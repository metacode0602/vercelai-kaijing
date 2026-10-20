/**
 * 支付渠道签名 / 加解密原语（纯函数，无网络、可离线单测）
 *
 * 收录这里的标准是「渠道只要求这几步，且步骤本身可独立验证」：
 *   - 微信支付 V3：请求签名 RSA-SHA256、回调/响应验签 RSA-SHA256、AES-256-GCM 解密
 *   - 支付宝：RSA2 签名/验签（SHA256withRSA）、JSON 响应原始字节验签
 *
 * 本文件**不含**任何 HTTP 调用与证书池管理（那是 adapter 层的事）。这样切分是为了
 * 让「签名串拼错」「AAD 用错」「响应字节被重排」这类问题能在无凭据、无网络的环境下
 * 被单测钉死 —— 这些恰好是接入支付渠道时最常见、也最难在线上才发现的错。
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, createSign, createVerify, timingSafeEqual } from "node:crypto"

// ---------------------------------------------------------------------------
// 微信支付 V3：回调验签
// ---------------------------------------------------------------------------

/**
 * 构造微信支付 V3 回调验签消息体。
 *
 * 微信的验签串不是原始 body，而是
 * `timestamp\nnonce\nbody\n`，三段以换行拼接。少一段或直接用 body 都会验不过。
 */
export function buildWechatNotifySignMessage(
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  return `${timestamp}\n${nonce}\n${rawBody}\n`
}

/**
 * 微信支付 V3 回调验签。
 *
 * @param signature  `Wechatpay-Signature` 头，base64
 * @param platformPublicKeyPem 微信支付平台证书内的公钥（v3 回调用）
 * @returns 验签通过返回 true；不通过返回 false（调用方必须拒绝，不得容错）
 */
export function verifyWechatNotifySignature(input: {
  signature: string
  timestamp: string
  nonce: string
  rawBody: string
  platformPublicKeyPem: string
}): boolean {
  const message = buildWechatNotifySignMessage(input.timestamp, input.nonce, input.rawBody)
  const verifier = createVerify("RSA-SHA256")
  verifier.update(message, "utf8")
  try {
    return verifier.verify(input.platformPublicKeyPem, Buffer.from(input.signature, "base64"))
  } catch {
    // 证书解析失败/公钥格式错误都算验签不通过
    return false
  }
}

// ---------------------------------------------------------------------------
// 微信支付 V3：resource AEAD 解密
// ---------------------------------------------------------------------------

/**
 * 解密微信支付回调的 `resource`。
 *
 * AES-256-GCM，key = APIv3 密钥（32 字节），nonce = resource.nonce，
 * associatedData = resource.associated_data。
 *
 * @returns 解密后的 JSON 明文；参数不合法时抛错（调用方拒绝处理）
 */
export function decryptWechatResource(input: {
  ciphertext: string
  nonce: string
  associatedData?: string
  apiV3Key: string
}): Record<string, unknown> {
  const key = Buffer.from(input.apiV3Key, "utf8")
  if (key.length !== 32) {
    throw new Error(`APIv3 密钥必须为 32 字节，当前 ${key.length} 字节`)
  }
  if (!input.nonce) {
    throw new Error("resource.nonce 缺失")
  }

  // 微信把 auth_tag 拼在密文尾部（16 字节），AEAD 需要拆开
  const data = Buffer.from(input.ciphertext, "base64")
  if (data.length <= 16) {
    throw new Error("resource.ciphertext 长度不足（缺少 16 字节 auth_tag）")
  }
  const authTag = data.subarray(data.length - 16)
  const ciphertext = data.subarray(0, data.length - 16)

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.nonce, "utf8"))
  decipher.setAuthTag(authTag)
  if (input.associatedData) {
    decipher.setAAD(Buffer.from(input.associatedData, "utf8"))
  }

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  let parsed: unknown
  try {
    parsed = JSON.parse(plain)
  } catch {
    throw new Error("解密结果不是合法 JSON")
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("解密结果不是 JSON 对象")
  }
  return parsed as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 微信支付 V3：请求签名（调用 /v3/pay/transactions/* 时用）
// ---------------------------------------------------------------------------

/**
 * 构造微信支付 V3 **接口请求**的签名消息体。
 *
 * 与回调验签串的差别只有两点，但这两点错了就 401：
 *   - 首段是 HTTP 方法（`GET` / `POST`），不是时间戳
 *   - 第二段是**含 query 的完整 URL path**（如 `/v3/pay/transactions/native`）
 *
 * 末尾同样要带换行，body 为 GET 时为空串（仍需那一个换行）。
 */
export function buildWechatRequestSignMessage(input: {
  method: string
  url: string
  timestamp: string
  nonce: string
  body: string
}): string {
  return `${input.method.toUpperCase()}\n${input.url}\n${input.timestamp}\n${input.nonce}\n${input.body}\n`
}

/**
 * 微信支付 V3 接口请求签名（RSA-SHA256 → base64）。
 *
 * 与 `verifyWechatNotifySignature` 共用同一套密钥材料：商户**私钥**签名、
 * 微信**平台证书公钥**验签。公钥在配置里既用于验回调，也用于验接口响应。
 */
export function signWechatRequest(input: {
  method: string
  url: string
  timestamp: string
  nonce: string
  body: string
  privateKeyPem: string
}): string {
  const signer = createSign("RSA-SHA256")
  signer.update(buildWechatRequestSignMessage(input), "utf8")
  return signer.sign(input.privateKeyPem, "base64")
}

/**
 * 拼装微信支付 V3 的 `Authorization` 头。
 *
 * 字段顺序与分隔符由微信规定，少一个引号或逗号后空格都会 401 —— 故集中在此生成，
 * 不让调用方各写一份字符串模板。
 */
export function buildWechatAuthorizationHeader(input: {
  mchId: string
  serialNo: string
  signature: string
  timestamp: string
  nonce: string
}): string {
  return (
    `WECHATPAY2-SHA256-RSA2048 mchid="${input.mchId}",nonce_str="${input.nonce}",` +
    `signature="${input.signature}",timestamp="${input.timestamp}",serial_no="${input.serialNo}"`
  )
}

// ---------------------------------------------------------------------------
// 支付宝 RSA2
// ---------------------------------------------------------------------------

/** 支付宝参数排序：ASCII 升序，跳过空值与 sign（`app_auth_token` 等同理跳过） */
export function buildAlipaySignContent(params: Record<string, string | undefined>): string {
  return Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && k !== "app_auth_token")
    .filter((k) => {
      const v = params[k]
      return v !== undefined && v !== null && v !== ""
    })
    .sort()
    .map((k) => `${k}=${params[k] as string}`)
    .join("&")
}

/** 支付宝 RSA2 签名（SHA256withRSA），输出 base64 */
export function signAlipayParams(
  params: Record<string, string | undefined>,
  privateKeyPem: string,
): string {
  const signer = createSign("RSA-SHA256")
  signer.update(buildAlipaySignContent(params), "utf8")
  return signer.sign(privateKeyPem, "base64")
}

/** 支付宝异步通知验签（v2 用 RSA，v3 用 RSA2；本项目统一 RSA2） */
export function verifyAlipaySignature(
  params: Record<string, string | undefined>,
  sign: string,
  alipayPublicKeyPem: string,
): boolean {
  const verifier = createVerify("RSA-SHA256")
  verifier.update(buildAlipaySignContent(params), "utf8")
  try {
    return verifier.verify(alipayPublicKeyPem, Buffer.from(sign, "base64"))
  } catch {
    return false
  }
}

/**
 * 校验支付宝 **JSON 响应** 的签名。
 *
 * 与 `verifyAlipaySignature`（用于 form-urlencoded 的异步通知）分开，原因有二：
 *
 * 1. **待签内容是原始响应字节**。支付宝对 JSON 响应的签名是对「去掉 `sign` 字段后的
 *    原始响应串」算的。若先把 JSON `parse` 成对象再 `JSON.stringify` 重建，
 *    键序、空格、转义（如 `\/`、非 ASCII）都可能变化，签名必然对不上 ——
 *    结果是每次查单都报「验签失败」，兜底入账形同虚设。
 * 2. `buildAlipaySignContent` 的「按 key 排序后拼 k=v」是**请求参数**的规则，
 *    不适用于嵌套的 `alipay_trade_query_response` 对象。
 *
 * @param rawBody 原始响应文本（未经 parse）
 * @param alipayPublicKeyPem 支付宝公钥
 */
export function verifyAlipayResponseSignature(
  rawBody: string,
  alipayPublicKeyPem: string,
): boolean {
  // "sign" 是支付宝响应里唯一被签名字段排除的键
  const matched = /"sign"\s*:\s*"([^"]*)"/.exec(rawBody)
  if (!matched) return false

  const sign = matched[1]
  if (!sign) return false

  // 去掉 sign 字段后，它会留下悬空逗号，需要两侧都清理：
  //   - sign 在末尾：`...,  "sign":"x"}` → 去掉后末尾多逗号
  //   - sign 在开头：`{"sign":"x",  ...}` → 去掉后开头多逗号
  // 只处理其中一侧会让验签恒失败（而失败会被误读成「渠道响应被篡改」）。
  const signContent = (
    rawBody.slice(0, matched.index) + rawBody.slice(matched.index + matched[0].length)
  )
    .replace(/([{,[]\s*),(\s*)/g, "$1$2")
    .replace(/,(\s*[}\]])/g, "$1")

  const verifier = createVerify("RSA-SHA256")
  verifier.update(signContent, "utf8")
  try {
    return verifier.verify(alipayPublicKeyPem, Buffer.from(sign, "base64"))
  } catch {
    return false
  }
}

/**
 * 按 `application/x-www-form-urlencoded` 序列化支付宝业务参数。
 *
 * 支付宝接收的是 query string（page.pay 的 GET 跳转），故用 URLSearchParams
 * 而不是嵌套编码 —— 它对空格编码为 `+`、其余为 `%XX`，与支付宝要求一致。
 */
export function encodeAlipayParams(
  params: Record<string, string | undefined>,
): URLSearchParams {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue
    search.append(key, value)
  }
  return search
}

// ---------------------------------------------------------------------------
// 通用
// ---------------------------------------------------------------------------

/** 常量时间比较，避免签名/金额比较的时序侧信道 */
export function safeCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8")
  const bb = Buffer.from(b, "utf8")
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/** 分转元字符串（对账用：渠道以「分」为单位的金额与库的 numeric 元比较） */
export function fenToYuanString(fen: number): string {
  if (!Number.isSafeInteger(fen) || fen < 0) {
    throw new Error(`分金额非法：${fen}`)
  }
  return (fen / 100).toFixed(2)
}

/**
 * 元转分（四舍五入到分）。
 *
 * 刻意**不**在这里校验「最多两位小数」：那是入参层的契约（zod `multipleOf(0.01)`
 * 等），而 `1.005` 这类值在 IEEE754 下是 `1.00499999999999989`，在本层拒绝会让商户
 * 对一个浏览器显示正常的金额收到报错。真正不能出错的是「有限且非负」，这里只管这个。
 *
 * 更稳的做法是让调用方直接传 `amountFen`（网关契约本身就是分），彻底避开浮点。
 */
export function yuanToFen(yuan: number): number {
  if (!Number.isFinite(yuan) || yuan < 0) {
    throw new Error(`金额非法：${yuan}`)
  }
  return Math.round(yuan * 100)
}

/** SHA-256 hex（订单号防重放、幂等键派生） */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

/** HMAC-SHA256 hex（回调防重放签名，如自建通道） */
export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex")
}
