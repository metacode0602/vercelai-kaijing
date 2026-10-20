/**
 * 支付网关离线单测（**不需任何真实凭据**）
 *
 * 为什么这组测试重要：微信/支付宝的凭据在生产环境才有，无法在 CI 里用真实密钥
 * 验证签名实现。但签名/加解密本身是纯函数——用本地生成的 RSA 密钥对与自造
 * AEAD 密文，就能把「算法实现是否正确」与「是否有凭据」两件事彻底分开验证。
 *
 * 覆盖的失败场景（都是真实事故形态）：
 *   - 微信回调验签串少一段换行 → 必须验不过
 *   - 回调 body 被篡改一个字节 → 必须验不过
 *   - APIv3 密钥长度不是 32 字节 → 必须显式报错而非静默截断
 *   - auth_tag 缺失 → 必须报错
 *   - 支付宝参数排序漏掉空值 / 漏掉 sign 自身 → 签名必不匹配
 *   - 金额「元↔分」互转的精度与非法输入
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  createCipheriv,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto"

import type { PaymentGateway } from "./types"
import type { PaymentMethod } from "../types"
import {
  AlipayGateway,
  BankTransferGateway,
  PaymentChannelUnavailableError,
  PaymentPayloadError,
  PaymentSignatureError,
  WechatPayGateway,
  buildAlipaySignContent,
  buildWechatNotifySignMessage,
  buildWechatRequestSignMessage,
  buildWechatAuthorizationHeader,
  decryptWechatResource,
  describePaymentChannels,
  encodeAlipayParams,
  fenToYuanString,
  getPaymentGateway,
  isPaymentMethodAvailable,
  listAvailableMethods,
  loadPaymentGatewayConfig,
  safeCompare,
  setPaymentGatewayRegistry,
  signAlipayParams,
  signWechatRequest,
  verifyAlipayResponseSignature,
  verifyAlipaySignature,
  verifyWechatNotifySignature,
  yuanToFen,
} from "./index"
import { AlipayGateway as AG } from "./alipay"

/** 本地生成的密钥对，不接触任何真实凭据 */
function makeKeyPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  })
}

const WECHAT_KEYS = makeKeyPair()
const ALIPAY_KEYS = makeKeyPair()

/**
 * 造一个合法的微信 AEAD 密文（模拟微信侧加密）
 *
 * 约束：AES-256-GCM 的 IV 必须是 12 字节，故 nonce 用 12 字符（与微信
 * resource.nonce 实际长度一致）；AAD 必须在加解密两侧都设置，否则解密必然失败。
 */
function encryptWechatResource(plain: object, apiV3Key: string) {
  const nonce = "NONCE123456" // 12 bytes
  const associatedData = "transaction"
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(apiV3Key, "utf8"),
    Buffer.from(nonce, "utf8"),
  )
  cipher.setAAD(Buffer.from(associatedData, "utf8"))
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(plain), "utf8")),
    cipher.final(),
  ])
  // 微信把 auth_tag 拼在密文尾部
  const ciphertext = Buffer.concat([body, cipher.getAuthTag()]).toString("base64")
  return { ciphertext, nonce, associated_data: associatedData }
}

const API_V3_KEY = randomBytes(32).toString("hex").slice(0, 32)

function wechatGatewayWith(overrides: Record<string, unknown> = {}) {
  return new WechatPayGateway({
    mchId: "mch-1",
    appId: "app-1",
    privateKeyPem: WECHAT_KEYS.privateKey,
    serialNo: "SERIAL",
    platformPublicKeyPem: WECHAT_KEYS.publicKey,
    apiV3Key: API_V3_KEY,
    notifyUrl: "https://example.test/notify",
    ...overrides,
  })
}

describe("微信支付 V3 验签", () => {
  it("验签串必须以换行结尾且含三段（少一段就会验不过）", () => {
    const msg = buildWechatNotifySignMessage("1700000000", "abc", `{"a":1}`)
    assert.equal(msg, `1700000000\nabc\n{"a":1}\n`)
  })

  it("正确签名通过验签", () => {
    const body = `{"id":"1"}`
    const timestamp = "1700000000"
    const nonce = "abc"
    const signer = createSign("RSA-SHA256")
    signer.update(buildWechatNotifySignMessage(timestamp, nonce, body), "utf8")
    const sig = signer.sign(WECHAT_KEYS.privateKey, "base64")

    assert.equal(
      verifyWechatNotifySignature({
        signature: sig,
        timestamp,
        nonce,
        rawBody: body,
        platformPublicKeyPem: WECHAT_KEYS.publicKey,
      }),
      true,
    )
  })

  it("body 被篡改一个字节即验不过", () => {
    const body = `{"id":"1"}`
    const timestamp = "1700000000"
    const nonce = "abc"
    const signer = createSign("RSA-SHA256")
    signer.update(buildWechatNotifySignMessage(timestamp, nonce, body), "utf8")
    const sig = signer.sign(WECHAT_KEYS.privateKey, "base64")

    assert.equal(
      verifyWechatNotifySignature({
        signature: sig,
        timestamp,
        nonce,
        rawBody: `{"id":"2"}`, // 篡改
        platformPublicKeyPem: WECHAT_KEYS.publicKey,
      }),
      false,
    )
  })

  it("用别人的公钥验签必须失败（防伪造）", () => {
    const other = makeKeyPair()
    const body = `{"id":"1"}`
    const timestamp = "1700000000"
    const nonce = "abc"
    const signer = createSign("RSA-SHA256")
    signer.update(buildWechatNotifySignMessage(timestamp, nonce, body), "utf8")
    const sig = signer.sign(WECHAT_KEYS.privateKey, "base64")

    assert.equal(
      verifyWechatNotifySignature({
        signature: sig,
        timestamp,
        nonce,
        rawBody: body,
        platformPublicKeyPem: other.publicKey, // 非本人公钥
      }),
      false,
    )
  })

  it("公钥格式非法时返回 false 而非抛错", () => {
    assert.equal(
      verifyWechatNotifySignature({
        signature: "AAAA",
        timestamp: "1",
        nonce: "n",
        rawBody: "{}",
        platformPublicKeyPem: "not-a-pem",
      }),
      false,
    )
  })
})

describe("微信支付 V3 resource 解密", () => {
  const plain = {
    out_trade_no: "PO202501010001",
    transaction_id: "4200001234",
    trade_state: "SUCCESS",
    amount: { total: 12345, payer_total: 12345, currency: "CNY" },
  }

  it("合法密文能解出明文", () => {
    const enc = encryptWechatResource(plain, API_V3_KEY)
    const out = decryptWechatResource({ ...enc, associatedData: enc.associated_data, apiV3Key: API_V3_KEY })
    assert.equal(out.out_trade_no, "PO202501010001")
    assert.equal((out.amount as { total: number }).total, 12345)
  })

  it("APIv3 密钥长度不对必须显式报错（不静默截断）", () => {
    const enc = encryptWechatResource(plain, API_V3_KEY)
    assert.throws(
      () => decryptWechatResource({ ...enc, apiV3Key: "too-short" }),
      /必须为 32 字节/,
    )
  })

  it("密文缺 auth_tag（被截掉尾部 16 字节）必须解密失败", () => {
    const enc = encryptWechatResource(plain, API_V3_KEY)
    const raw = Buffer.from(enc.ciphertext, "base64")
    const truncated = raw.subarray(0, raw.length - 16).toString("base64")
    // 明文较长时长度检查拦不住，只能靠 AEAD 认证失败——两种都必须是硬失败
    assert.throws(() =>
      decryptWechatResource({
        ...enc,
        associatedData: enc.associated_data,
        ciphertext: truncated,
        apiV3Key: API_V3_KEY,
      }),
    )
  })

  it("密文过短（不足以含 auth_tag）给出明确报错", () => {
    assert.throws(
      () =>
        decryptWechatResource({
          ciphertext: Buffer.from("short").toString("base64"),
          nonce: "NONCE123456",
          apiV3Key: API_V3_KEY,
        }),
      /auth_tag/,
    )
  })

  it("associated_data 被篡改必须解密失败（AAD 参与认证）", () => {
    const enc = encryptWechatResource(plain, API_V3_KEY)
    assert.throws(() =>
      decryptWechatResource({ ...enc, associatedData: "tampered", apiV3Key: API_V3_KEY }),
    )
  })

  it("用错误密钥解密必须失败", () => {
    const enc = encryptWechatResource(plain, API_V3_KEY)
    const wrongKey = randomBytes(32).toString("hex").slice(0, 32)
    assert.throws(() =>
      decryptWechatResource({ ...enc, associatedData: enc.associated_data, apiV3Key: wrongKey }),
    )
  })

  it("nonce 缺失必须报错", () => {
    const enc = encryptWechatResource(plain, API_V3_KEY)
    assert.throws(
      () => decryptWechatResource({ ...enc, associatedData: enc.associated_data, nonce: "", apiV3Key: API_V3_KEY }),
      /nonce 缺失/,
    )
  })
})

describe("支付宝 RSA2", () => {
  it("签名内容按 ASCII 升序、跳过空值与 sign/sign_type", () => {
    const content = buildAlipaySignContent({
      out_trade_no: "A1",
      total_amount: "1.00",
      empty: "",
      sign: "should-skip",
      sign_type: "RSA2",
      app_id: "2021",
    })
    assert.equal(content, "app_id=2021&out_trade_no=A1&total_amount=1.00")
  })

  it("自签自验通过，篡改金额后失败", () => {
    const params = { out_trade_no: "A1", total_amount: "1.00" }
    const sign = signAlipayParams(params, ALIPAY_KEYS.privateKey)
    assert.equal(verifyAlipaySignature(params, sign, ALIPAY_KEYS.publicKey), true)
    assert.equal(
      verifyAlipaySignature({ ...params, total_amount: "100.00" }, sign, ALIPAY_KEYS.publicKey),
      false,
    )
  })

  it("换公钥验签失败（防伪造）", () => {
    const other = makeKeyPair()
    const params = { out_trade_no: "A1", total_amount: "1.00" }
    const sign = signAlipayParams(params, ALIPAY_KEYS.privateKey)
    assert.equal(verifyAlipaySignature(params, sign, other.publicKey), false)
  })
})

describe("金额单位换算", () => {
  it("元转分四舍五入到分", () => {
    assert.equal(yuanToFen(1), 100)
    assert.equal(yuanToFen(12345.67), 1234567)
    // 1.005 在 IEEE754 下是 1.00499999999999989，×100 后为 100.49999...，
    // 故四舍五入结果是 100 分而非 101 分。这是浮点表示问题，不是四舍五入问题，
    // 真实金额一律按「分」入参（gateway 契约用 amountFen）可完全绕开。
    assert.equal(yuanToFen(1.005), 100)
  })

  it("元转分拒绝非有限值与负数", () => {
    assert.throws(() => yuanToFen(Number.NaN), /非法/)
    assert.throws(() => yuanToFen(-1), /非法/)
  })

  it("分转元保留两位", () => {
    assert.equal(fenToYuanString(100), "1.00")
    assert.equal(fenToYuanString(12345), "123.45")
  })

  it("非法分金额拒绝", () => {
    assert.throws(() => fenToYuanString(-1), /非法/)
    assert.throws(() => fenToYuanString(1.5), /非法/)
  })

  it("常量时间比较长度不同直接 false", () => {
    assert.equal(safeCompare("abc", "abc"), true)
    assert.equal(safeCompare("abc", "abcd"), false)
  })
})

describe("通道可用性（凭据未配置即关闭）", () => {
  it("空环境变量下微信/支付宝不可用，对公转账可用", () => {
    const cfg = loadPaymentGatewayConfig({} as NodeJS.ProcessEnv)
    const wechat = new WechatPayGateway(cfg.wechat ?? {})
    const alipay = new AlipayGateway(cfg.alipay ?? {})

    assert.equal(wechat.available, false)
    assert.match(wechat.unavailableReason ?? "", /WECHAT_PAY_MCH_ID/)
    assert.equal(alipay.available, false)
    assert.match(alipay.unavailableReason ?? "", /ALIPAY_APP_ID/)
  })

  it("缺任一项即不可用，并列出全部缺项", () => {
    const gw = new WechatPayGateway({ mchId: "m", appId: "a" })
    assert.equal(gw.available, false)
    assert.match(gw.unavailableReason ?? "", /WECHAT_PAY_PRIVATE_KEY/)
    assert.match(gw.unavailableReason ?? "", /WECHAT_PAY_API_V3_KEY/)
  })

  it("不可用渠道取用时抛 PaymentChannelUnavailableError", async () => {
    const gw = new WechatPayGateway({})
    // createPrepay / parseCallback 都是 async，必须用 rejects（throws 看不到 rejected promise）
    await assert.rejects(() => gw.createPrepay({} as any), PaymentChannelUnavailableError)
    await assert.rejects(() => gw.parseCallback({} as any), PaymentChannelUnavailableError)
    await assert.rejects(() => gw.queryPayment("PO1"), PaymentChannelUnavailableError)
  })

  it("对公转账恒可用，且不接受回调/查单", async () => {
    const gw = new BankTransferGateway()
    assert.equal(gw.available, true)
    const prepay = await gw.createPrepay({
      orderNo: "PO1",
      amountFen: 100,
      currency: "CNY",
      payerId: "m1",
      description: "d",
    })
    assert.equal(prepay.channelOrderNo, "PO1")
    await assert.rejects(() => gw.parseCallback({} as any), PaymentChannelUnavailableError)
    await assert.rejects(() => gw.queryPayment("x"), PaymentChannelUnavailableError)
  })

  it("listAvailableMethods 只返回可用通道", () => {
    setPaymentGatewayRegistry(null)
    const fresh = loadPaymentGatewayConfig({} as NodeJS.ProcessEnv)
    setPaymentGatewayRegistry(
      new Map<PaymentMethod, PaymentGateway>([
        ["wechat", new WechatPayGateway(fresh.wechat ?? {})],
        ["alipay", new AG(fresh.alipay ?? {})],
        ["bank_transfer", new BankTransferGateway()],
      ]),
    )
    assert.deepEqual(listAvailableMethods(), ["bank_transfer"])
    assert.equal(isPaymentMethodAvailable("bank_transfer"), true)
    assert.equal(isPaymentMethodAvailable("wechat"), false)
    setPaymentGatewayRegistry(null)
  })

  it("注册表渠道不可用时 getPaymentGateway 直接抛", () => {
    setPaymentGatewayRegistry(
      new Map<PaymentMethod, PaymentGateway>([["wechat", new WechatPayGateway({})]]),
    )
    assert.throws(() => getPaymentGateway("wechat"), PaymentChannelUnavailableError)
    setPaymentGatewayRegistry(null)
  })

  it("describePaymentChannels 覆盖全部 3 种方式", () => {
    setPaymentGatewayRegistry(null)
    const rows = describePaymentChannels()
    assert.equal(rows.length, 3)
    assert.deepEqual(
      rows.map((r) => r.method).sort(),
      ["alipay", "bank_transfer", "wechat"],
    )
  })
})

describe("支付宝网关回调（离线构造）", () => {
  const gw = () =>
    new AlipayGateway({
      appId: "2021000000",
      privateKeyPem: ALIPAY_KEYS.privateKey,
      publicKeyPem: ALIPAY_KEYS.publicKey,
      notifyUrl: "https://example.test/notify",
    })

  it("合法通知验签通过并归一为 success", async () => {
    const params: Record<string, string> = {
      app_id: "2021000000",
      out_trade_no: "PO1",
      trade_no: "2021000001",
      trade_status: "TRADE_SUCCESS",
      total_amount: "88.50",
    }
    const sign = signAlipayParams(params, ALIPAY_KEYS.privateKey)
    const body = new URLSearchParams({ ...params, sign }).toString()

    const out = await gw().parseCallback({ rawBody: body, headers: {} })
    assert.equal(out.status, "success")
    assert.equal(out.channelOrderNo, "PO1")
    assert.equal(out.amountFen, 8850)
  })

  it("缺 sign 字段拒绝", async () => {
    await assert.rejects(
      () => gw().parseCallback({ rawBody: "app_id=1&total_amount=1.00", headers: {} }),
      PaymentSignatureError,
    )
  })

  it("app_id 不匹配拒绝（防止别的应用回调混入）", async () => {
    const params: Record<string, string> = {
      app_id: "9999999999",
      out_trade_no: "PO1",
      trade_status: "TRADE_SUCCESS",
      total_amount: "1.00",
    }
    const sign = signAlipayParams(params, ALIPAY_KEYS.privateKey)
    const body = new URLSearchParams({ ...params, sign }).toString()
    await assert.rejects(
      () => gw().parseCallback({ rawBody: body, headers: {} }),
      PaymentSignatureError,
    )
  })
})

describe("微信支付网关回调（离线构造）", () => {
  it("合法通知验签+解密通过", async () => {
    const plain = {
      out_trade_no: "PO1",
      transaction_id: "4200001234",
      trade_state: "SUCCESS",
      amount: { total: 5000, currency: "CNY" },
    }
    const enc = encryptWechatResource(plain, API_V3_KEY)
    const body = JSON.stringify({
      id: "1",
      resource: {
        ciphertext: enc.ciphertext,
        nonce: enc.nonce,
        associated_data: enc.associated_data,
      },
    })
    const timestamp = "1700000000"
    const nonce = "abc"
    const signer = createSign("RSA-SHA256")
    signer.update(buildWechatNotifySignMessage(timestamp, nonce, body), "utf8")
    const signature = signer.sign(WECHAT_KEYS.privateKey, "base64")

    const out = await wechatGatewayWith().parseCallback({
      rawBody: body,
      headers: {
        "wechatpay-timestamp": timestamp,
        "wechatpay-nonce": nonce,
        "wechatpay-signature": signature,
      },
    })
    assert.equal(out.status, "success")
    assert.equal(out.amountFen, 5000)
  })

  it("缺少验签头拒绝", async () => {
    await assert.rejects(
      () => wechatGatewayWith().parseCallback({ rawBody: "{}", headers: {} }),
      PaymentSignatureError,
    )
  })

  it("CLOSE 状态归一为 failed，USERPAYING 归一为 pending", async () => {
    for (const [state, expected] of [
      ["CLOSED", "failed"],
      ["USERPAYING", "pending"],
      ["SUCCESS", "success"],
    ] as const) {
      const enc = encryptWechatResource(
        {
          out_trade_no: "PO1",
          transaction_id: "t",
          trade_state: state,
          amount: { total: 100, currency: "CNY" },
        },
        API_V3_KEY,
      )
      const body = JSON.stringify({
        resource: {
          ciphertext: enc.ciphertext,
          nonce: enc.nonce,
          associated_data: enc.associated_data,
        },
      })
      const timestamp = "1"
      const nonce = "n"
      const signer = createSign("RSA-SHA256")
      signer.update(buildWechatNotifySignMessage(timestamp, nonce, body), "utf8")
      const out = await wechatGatewayWith().parseCallback({
        rawBody: body,
        headers: {
          "wechatpay-timestamp": timestamp,
          "wechatpay-nonce": nonce,
          "wechatpay-signature": signer.sign(WECHAT_KEYS.privateKey, "base64"),
        },
      })
      assert.equal(out.status, expected, `${state} → ${expected}`)
    }
  })
})

describe("支付宝参数编码", () => {
  it("空值不参与编码（空串参数会被支付宝当非法参数）", () => {
    const qs = encodeAlipayParams({ a: "1", b: undefined, c: "", d: "2" }).toString()
    assert.equal(qs.includes("b="), false)
    assert.equal(qs.includes("c="), false)
    assert.equal(new URLSearchParams(qs).get("a"), "1")
    assert.equal(new URLSearchParams(qs).get("d"), "2")
  })
})

describe("微信支付 V3 请求签名（Authorization 头）", () => {
  it("待签串格式为 method\\nurl\\n时间戳\\n随机串\\n请求体\\n", () => {
    const msg = buildWechatRequestSignMessage({
      method: "POST",
      url: "/v3/pay/transactions/native",
      timestamp: "1700000000",
      nonce: "abc",
      body: `{"a":1}`,
    })
    assert.equal(msg, "POST\n/v3/pay/transactions/native\n1700000000\nabc\n{\"a\":1}\n")
  })

  it("GET 无请求体时请求体段为空行", () => {
    const msg = buildWechatRequestSignMessage({
      method: "GET",
      url: "/v3/pay/transactions/out-trade-no/PO1",
      timestamp: "1",
      nonce: "n",
      body: "",
    })
    assert.equal(msg, "GET\n/v3/pay/transactions/out-trade-no/PO1\n1\nn\n\n")
  })

  it("signWechatRequest 的签名可被平台公钥验签通过（与待签串逐字节一致）", () => {
    const params = {
      method: "POST",
      url: "/v3/pay/transactions/native",
      timestamp: "1700000000",
      nonce: "abc",
      body: `{"a":1}`,
      privateKeyPem: WECHAT_KEYS.privateKey,
    }
    const signature = signWechatRequest(params)
    // 直接用平台公钥验：请求签名与通知验签**共用**同一待签串格式，但生产代码无需
    // 「验自己的请求」，故这里独立验，而不是借道只吃通知格式的 verifyWechatNotifySignature。
    const verifier = createVerify("RSA-SHA256")
    verifier.update(
      buildWechatRequestSignMessage({
        method: params.method,
        url: params.url,
        timestamp: params.timestamp,
        nonce: params.nonce,
        body: params.body,
      }),
      "utf8",
    )
    assert.equal(verifier.verify(WECHAT_KEYS.publicKey, Buffer.from(signature, "base64")), true)
  })

  it("Authorization 头含 mchid/序列号/时间戳/随机串/签名五段", () => {
    const header = buildWechatAuthorizationHeader({
      mchId: "1900000109",
      serialNo: "SERIAL123",
      signature: "c2ln",
      timestamp: "1700000000",
      nonce: "abc",
    })
    assert.match(header, /^WECHATPAY2-SHA256-RSA2048 /)
    assert.match(header, /mchid="1900000109"/)
    assert.match(header, /nonce_str="abc"/)
    assert.match(header, /timestamp="1700000000"/)
    assert.match(header, /serial_no="SERIAL123"/)
    assert.match(header, /signature="c2ln"/)
  })
})

describe("微信支付 Native 下单（离线构造）", () => {
  /**
   * 造一个可验签+可解密的微信下单响应。
   *
   * 注意 AAD 必须是 `response`：微信对**响应**与**回调**用不同的
   * associated_data（分别是 "response" 和回调报文里的原值），AAD 不符解密必失败。
   */
  function nativeOrderResponse(codeUrl: string) {
    const nonce = "NONCE123456"
    const associatedData = "response"
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(API_V3_KEY, "utf8"),
      Buffer.from(nonce, "utf8"),
    )
    cipher.setAAD(Buffer.from(associatedData, "utf8"))
    const body = Buffer.concat([
      cipher.update(JSON.stringify({ code_url: codeUrl }), "utf8"),
      cipher.final(),
    ])
    const ciphertext = Buffer.concat([body, cipher.getAuthTag()]).toString("base64")
    return JSON.stringify({
      code_url: codeUrl,
      resource: { ciphertext, nonce, associated_data: associatedData },
    })
  }

  /** 签一个微信响应（验签串格式与回调相同，故复用 notify 的构造） */
  function signWechatResponse(rawBody: string) {
    const timestamp = "1700000000"
    const nonce = "resp-nonce"
    const signer = createSign("RSA-SHA256")
    signer.update(buildWechatNotifySignMessage(timestamp, nonce, rawBody), "utf8")
    return {
      timestamp,
      nonce,
      signature: signer.sign(WECHAT_KEYS.privateKey, "base64"),
    }
  }

  function stubFetchOnce(body: string, headers: Record<string, string>) {
    const original = globalThis.fetch
    let captured: { url?: string; init?: RequestInit } = {}
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      captured = { url: String(url), init }
      return new Response(body, { status: 200, headers })
    }) as unknown as typeof fetch
    return {
      captured: () => captured,
      restore: () => {
        globalThis.fetch = original
      },
    }
  }

  it("凭据齐备时 orderCapable 随 available（不再永久关闭下单）", () => {
    assert.equal(wechatGatewayWith().orderCapable, true)
    assert.equal(new WechatPayGateway({}).orderCapable, false)
  })

  it("下单返回 code_url，且请求带签名头与正确路径", async () => {
    const codeUrl = "weixin://wxpay/bizpayurl?pr=abcdef"
    const raw = nativeOrderResponse(codeUrl)
    const sig = signWechatResponse(raw)
    const stub = stubFetchOnce(raw, {
      "wechatpay-timestamp": sig.timestamp,
      "wechatpay-nonce": sig.nonce,
      "wechatpay-signature": sig.signature,
    })

    try {
      const out = await wechatGatewayWith().createPrepay({
        orderNo: "PO1",
        amountFen: 8850,
        currency: "CNY",
        payerId: "m1",
        description: "商户预付充值 PO1",
        idempotencyKey: "idem-1",
      })
      assert.equal(out.codeUrl, codeUrl)
      // 微信侧交易号此时还没有，故 channelOrderNo 落我方单号
      assert.equal(out.channelOrderNo, "PO1")

      const { url, init } = stub.captured()
      assert.equal(url, "https://api.mch.weixin.qq.com/v3/pay/transactions/native")
      assert.equal(init?.method, "POST")
      const headers = new Headers(init?.headers)
      assert.match(headers.get("authorization") ?? "", /^WECHATPAY2-SHA256-RSA2048 /)
      // Native 支付不允许传 payer，多传会被渠道直接拒单
      assert.equal((JSON.parse(String(init?.body)) as Record<string, unknown>).payer, undefined)
      const sent = JSON.parse(String(init?.body)) as {
        out_trade_no: string
        notify_url: string
        amount: { total: number }
      }
      assert.equal(sent.out_trade_no, "PO1")
      assert.equal(sent.notify_url, "https://example.test/notify")
      assert.equal(sent.amount.total, 8850)
    } finally {
      stub.restore()
    }
  })

  it("time_expire 为带 +08:00 偏移的 RFC3339（Z 后缀会让单子提前 8 小时失效）", async () => {
    const codeUrl = "weixin://wxpay/bizpayurl?pr=expiry"
    const raw = nativeOrderResponse(codeUrl)
    const sig = signWechatResponse(raw)
    const stub = stubFetchOnce(raw, {
      "wechatpay-timestamp": sig.timestamp,
      "wechatpay-nonce": sig.nonce,
      "wechatpay-signature": sig.signature,
    })

    try {
      await wechatGatewayWith().createPrepay({
        orderNo: "PO1",
        amountFen: 100,
        currency: "CNY",
        payerId: "m1",
        description: "d",
        // 2026-01-01T00:00:00Z 即北京时间 08:00
        expiresAt: new Date("2026-01-01T00:00:00Z"),
      })
      const sent = JSON.parse(String(stub.captured().init?.body)) as { time_expire?: string }
      assert.equal(sent.time_expire, "2026-01-01T08:00:00+08:00")
    } finally {
      stub.restore()
    }
  })

  it("响应验签失败拒绝下单（防中间人伪造 code_url）", async () => {
    const raw = nativeOrderResponse("weixin://evil")
    const stub = stubFetchOnce(raw, {
      "wechatpay-timestamp": "1700000000",
      "wechatpay-nonce": "resp-nonce",
      "wechatpay-signature": "ZmFrZS1zaWduYXR1cmU=",
    })
    try {
      await assert.rejects(
        () =>
          wechatGatewayWith().createPrepay({
            orderNo: "PO1",
            amountFen: 100,
            currency: "CNY",
            payerId: "m1",
            description: "d",
          }),
        PaymentSignatureError,
      )
    } finally {
      stub.restore()
    }
  })

  it("渠道错误响应（无 resource）报渠道文案，不当成功", async () => {
    const raw = JSON.stringify({ code: "PARAM_ERROR", message: "参数错误" })
    const sig = signWechatResponse(raw)
    const stub = stubFetchOnce(raw, {
      "wechatpay-timestamp": sig.timestamp,
      "wechatpay-nonce": sig.nonce,
      "wechatpay-signature": sig.signature,
    })
    try {
      await assert.rejects(
        () =>
          wechatGatewayWith().createPrepay({
            orderNo: "PO1",
            amountFen: 100,
            currency: "CNY",
            payerId: "m1",
            description: "d",
          }),
        /PARAM_ERROR/,
      )
    } finally {
      stub.restore()
    }
  })

  it("金额非正整数分直接拒绝，不发请求", async () => {
    await assert.rejects(
      () =>
        wechatGatewayWith().createPrepay({
          orderNo: "PO1",
          amountFen: 0.5,
          currency: "CNY",
          payerId: "m1",
          description: "d",
        }),
      PaymentPayloadError,
    )
  })
})

describe("支付宝网页支付下单（离线构造）", () => {
  const gw = (overrides: Record<string, unknown> = {}) =>
    new AlipayGateway({
      appId: "2021000000",
      privateKeyPem: ALIPAY_KEYS.privateKey,
      publicKeyPem: ALIPAY_KEYS.publicKey,
      notifyUrl: "https://example.test/notify",
      returnUrl: "https://example.test/return",
      ...overrides,
    })

  function stubFetchOnce(body: string) {
    const original = globalThis.fetch
    let captured: { url?: string; init?: RequestInit } = {}
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      captured = { url: String(url), init }
      return new Response(body, { status: 200 })
    }) as unknown as typeof fetch
    return {
      captured: () => captured,
      restore: () => {
        globalThis.fetch = original
      },
    }
  }

  it("凭据齐备时 orderCapable 随 available", () => {
    assert.equal(gw().orderCapable, true)
    assert.equal(new AlipayGateway({}).orderCapable, false)
  })

  it("下单返回带签名的 page.pay 跳转 URL，元数据正确", async () => {
    const stub = stubFetchOnce("ok")
    try {
      const out = await gw().createPrepay({
        orderNo: "PO1",
        amountFen: 8850,
        currency: "CNY",
        payerId: "m1",
        description: "商户预付充值 PO1",
      })

      assert.equal(out.channelOrderNo, "PO1")
      assert.equal(out.codeUrl, undefined)
      const url = new URL(out.payUrl!)
      assert.equal(url.searchParams.get("method"), "alipay.trade.page.pay")
      assert.equal(url.searchParams.get("app_id"), "2021000000")
      assert.equal(url.searchParams.get("notify_url"), "https://example.test/notify")
      assert.equal(url.searchParams.get("return_url"), "https://example.test/return")
      assert.ok(url.searchParams.get("sign"), "跳转 URL 必须带签名")

      const biz = JSON.parse(url.searchParams.get("biz_content")!) as Record<string, unknown>
      assert.equal(biz.out_trade_no, "PO1")
      assert.equal(biz.total_amount, "88.50")
      // 签名可被支付宝公钥独立验签通过
      const signable: Record<string, string> = {}
      url.searchParams.forEach((v, k) => {
        if (k !== "sign") signable[k] = v
      })
      assert.equal(
        verifyAlipaySignature(signable, url.searchParams.get("sign")!, ALIPAY_KEYS.publicKey),
        true,
      )
    } finally {
      stub.restore()
    }
  })

  it("沙箱网关地址可覆盖（联调时打沙箱而非生产）", async () => {
    const out = await gw({ gatewayUrl: "https://openapi-sandbox.dl.alipaydev.com/gateway.do" })
      .createPrepay({
        orderNo: "PO1",
        amountFen: 100,
        currency: "CNY",
        payerId: "m1",
        description: "d",
      })
    assert.equal(new URL(out.payUrl!).host, "openapi-sandbox.dl.alipaydev.com")
  })

  it("time_expire 对齐我方订单失效时间（固定 UTC+8，不能是 Z 后缀）", async () => {
    const out = await gw().createPrepay({
      orderNo: "PO1",
      amountFen: 100,
      currency: "CNY",
      payerId: "m1",
      description: "d",
      // 2026-01-01T00:00:00Z 即北京时间 08:00
      expiresAt: new Date("2026-01-01T00:00:00Z"),
    })
    const biz = JSON.parse(new URL(out.payUrl!).searchParams.get("biz_content")!) as Record<
      string,
      unknown
    >
    assert.equal(biz.time_expire, "2026-01-01 08:00:00")
  })
})

describe("支付宝响应验签（原始字节）", () => {
  it("去掉 sign 字段后的原始串可验签通过", () => {
    const body = `{"alipay_trade_query_response":{"trade_no":"2021","total_amount":"88.50"},"sign":"__SIGN__"}`
    const signable = `{"alipay_trade_query_response":{"trade_no":"2021","total_amount":"88.50"}}`
    const signer = createSign("RSA-SHA256")
    signer.update(signable, "utf8")
    const sign = signer.sign(ALIPAY_KEYS.privateKey, "base64")
    assert.equal(
      verifyAlipayResponseSignature(body.replace("__SIGN__", sign), ALIPAY_KEYS.publicKey),
      true,
    )
  })

  it("sign 在最前（带尾逗号）也能验签", () => {
    const signable = `{"alipay_trade_query_response":{"trade_no":"2021"}}`
    const signer = createSign("RSA-SHA256")
    signer.update(signable, "utf8")
    const sign = signer.sign(ALIPAY_KEYS.privateKey, "base64")
    assert.equal(
      verifyAlipayResponseSignature(
        `{"sign":"${sign}","alipay_trade_query_response":{"trade_no":"2021"}}`,
        ALIPAY_KEYS.publicKey,
      ),
      true,
    )
  })

  it("响应被篡改（改金额）验签失败", () => {
    const signable = `{"alipay_trade_query_response":{"total_amount":"88.50"}}`
    const signer = createSign("RSA-SHA256")
    signer.update(signable, "utf8")
    const sign = signer.sign(ALIPAY_KEYS.privateKey, "base64")
    // 攻击者把 88.50 改成 0.01，sign 保持不变
    assert.equal(
      verifyAlipayResponseSignature(
        `{"alipay_trade_query_response":{"total_amount":"0.01"},"sign":"${sign}"}`,
        ALIPAY_KEYS.publicKey,
      ),
      false,
    )
  })

  it("缺 sign 字段返回 false 而非抛错", () => {
    assert.equal(
      verifyAlipayResponseSignature(`{"alipay_trade_query_response":{}}`, ALIPAY_KEYS.publicKey),
      false,
    )
  })
})
