/**
 * 微信支付 V3 适配器（Native 扫码支付下单 + 查单 + 回调验签）
 *
 * `available` 仅在凭据齐备时为 true。凭据缺失时业务层在建单前拒绝，
 * 不会产生「进得去、付不了」的脏单。
 *
 * 下单走 **`/v3/pay/transactions/native`**（Native 扫码）：
 *   - 商家后台场景最省事的一档——不需要用户授权 openid，也不需要 H5 UA 判断，
 *     商家拿到 `code_url` 渲染成二维码，用户微信扫一扫即可；
 *   - 请求要按 V3 规则签名（`Authorization: WECHATPAY2-SHA256-RSA2048 ...`），
 *     响应要用**平台证书公钥**验签、并用 APIv3 密钥解密 `resource`；
 *   - JSAPI/H5 各自要求 openid / UA 白名单，本场景没有，故不实现。
 */

import { randomBytes } from "node:crypto"

import {
  PaymentChannelUnavailableError,
  PaymentPayloadError,
  PaymentSignatureError,
} from "./types"
import {
  buildWechatAuthorizationHeader,
  decryptWechatResource,
  signWechatRequest,
  verifyWechatNotifySignature,
} from "./crypto"
import type {
  GatewayCallbackRequest,
  GatewayCallbackResult,
  GatewayPrepay,
  GatewayPrepayInput,
  PaymentGateway,
  WechatPayConfig,
} from "./types"
import type { PaymentMethod } from "../types"

type HeaderValue = string | string[] | undefined

/** 微信支付 API 主机（Native 下单与查单同主机） */
const WECHAT_API_BASE = "https://api.mch.weixin.qq.com"

function firstHeader(value: HeaderValue): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

/**
 * 微信要求的 `time_expire` 格式：RFC3339，且**必须带时区偏移**（`+08:00`）。
 *
 * 刻意固定 UTC+8 而不是用 `toISOString()`：后者输出 `Z` 后缀，微信会按 UTC
 * 解析，等于把过期时间提前 8 小时，单子刚建好就没法付了。
 */
function formatWechatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return (
    `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}` +
    `T${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}+08:00`
  )
}

/** 微信交易状态 → 平台终局 */
function mapTradeState(state: string): GatewayCallbackResult["status"] {
  switch (state) {
    case "SUCCESS":
      return "success"
    case "CLOSED":
    case "REVOKED":
      return "failed"
    default:
      // USERPAYING / NOTPAY / PAYERROR / 未知 → 保持 pending，由查单或补偿兜底
      return "pending"
  }
}

export class WechatPayGateway implements PaymentGateway {
  readonly method: PaymentMethod = "wechat"
  readonly available: boolean
  /**
   * 凭据齐备即可下单：Native 下单是标准 HTTPS + 签名调用，不需要额外联调才能
   * 跑通（不像 JSAPI 需要用户授权、H5 需要 UA 白名单）。故与 `available` 同源。
   */
  readonly orderCapable: boolean
  readonly unavailableReason?: string

  /** 渠道配置；构造后只读 */
  private readonly config: WechatPayConfig

  constructor(config: WechatPayConfig) {
    this.config = config
    const missing: string[] = []
    if (!config.mchId) missing.push("WECHAT_PAY_MCH_ID")
    if (!config.appId) missing.push("WECHAT_PAY_APP_ID")
    if (!config.privateKeyPem) missing.push("WECHAT_PAY_PRIVATE_KEY")
    if (!config.serialNo) missing.push("WECHAT_PAY_SERIAL_NO")
    if (!config.platformPublicKeyPem) missing.push("WECHAT_PAY_PLATFORM_CERT")
    if (!config.apiV3Key) missing.push("WECHAT_PAY_API_V3_KEY")
    if (!config.notifyUrl) missing.push("WECHAT_PAY_NOTIFY_URL")

    this.available = missing.length === 0
    this.orderCapable = this.available
    if (!this.available) {
      this.unavailableReason = `缺少配置：${missing.join("、")}`
    }
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new PaymentChannelUnavailableError("wechat", this.unavailableReason!)
    }
  }

  /**
   * V3 响应验签 → 解密 `resource` → 返回明文对象。
   *
   * 响应与回调用的是**同一套**验签串格式（`timestamp\nnonce\nbody\n`），
   * 故复用 `verifyWechatNotifySignature`。这一步不能省：HTTP 响应同样可能被中间人
   * 篡改，不验签就等于「谁都能告诉我们钱到账了」。
   */
  private async decryptResponse(response: Response, what: string): Promise<Record<string, unknown>> {
    const raw = await response.text()
    const timestamp = firstHeader(response.headers.get("wechatpay-timestamp") as HeaderValue)
    const nonce = firstHeader(response.headers.get("wechatpay-nonce") as HeaderValue)
    const signature = firstHeader(response.headers.get("wechatpay-signature") as HeaderValue)

    if (!timestamp || !nonce || !signature) {
      throw new PaymentSignatureError("wechat", `${what} 响应缺少验签头`)
    }
    const ok = verifyWechatNotifySignature({
      signature,
      timestamp,
      nonce,
      rawBody: raw,
      platformPublicKeyPem: this.config.platformPublicKeyPem!,
    })
    if (!ok) {
      throw new PaymentSignatureError("wechat", `${what} 响应验签失败`)
    }

    let envelope: { resource?: Record<string, unknown>; code?: string; message?: string }
    try {
      envelope = JSON.parse(raw)
    } catch {
      throw new PaymentPayloadError("wechat", `${what} 响应不是合法 JSON`)
    }
    // HTTP 非 2xx 时微信只回 {code, message}，没有 resource 可解 —— 直接抛出
    // 渠道给的错误文案，比后续在 resource 上解出 undefined 更好定位。
    if (!envelope.resource || typeof envelope.resource.ciphertext !== "string") {
      throw new PaymentPayloadError(
        "wechat",
        `${what} 失败：${envelope.code ?? response.status} ${envelope.message ?? ""}`.trim(),
      )
    }

    try {
      return decryptWechatResource({
        ciphertext: envelope.resource.ciphertext,
        nonce: String(envelope.resource.nonce ?? ""),
        associatedData:
          typeof envelope.resource.associated_data === "string"
            ? envelope.resource.associated_data
            : undefined,
        apiV3Key: this.config.apiV3Key!,
      })
    } catch (err) {
      throw new PaymentPayloadError("wechat", `${what} 响应解密失败：${(err as Error).message}`)
    }
  }

  /**
   * 下单：`POST /v3/pay/transactions/native`（扫码支付）。
   *
   * 返回 `codeUrl`（`weixin://wxpay/bizpayurl?pr=...`）供前端渲染二维码。
   *
   * 微信侧的 `transaction_id` **付款完成后**才由回调/查单给出，故这里
   * `channelOrderNo` 只能填我方 `out_trade_no`；它同时就是查单入参，故不会失效。
   *
   * `time_expire` 与我方订单失效时间对齐：过了这个点微信拒付，避免商户在我方
   * 订单过期后才付款、导致「钱到了但不入账」。
   */
  async createPrepay(input: GatewayPrepayInput): Promise<GatewayPrepay> {
    this.assertAvailable()

    if (!Number.isSafeInteger(input.amountFen) || input.amountFen <= 0) {
      throw new PaymentPayloadError("wechat", `金额非法（分）：${input.amountFen}`)
    }

    const path = "/v3/pay/transactions/native"
    const body = JSON.stringify({
      appid: this.config.appId,
      mchid: this.config.mchId,
      description: input.description,
      out_trade_no: input.orderNo,
      notify_url: this.config.notifyUrl,
      // Native 支付不支持挂件，必须不传 payer
      amount: { total: input.amountFen, currency: input.currency || "CNY" },
      ...(input.expiresAt ? { time_expire: formatWechatTime(input.expiresAt) } : {}),
    })

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = randomBytes(12).toString("hex")
    const signature = signWechatRequest({
      method: "POST",
      url: path,
      timestamp,
      nonce,
      body,
      privateKeyPem: this.config.privateKeyPem!,
    })

    const response = await fetch(`${WECHAT_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: buildWechatAuthorizationHeader({
          mchId: this.config.mchId!,
          serialNo: this.config.serialNo!,
          signature,
          timestamp,
          nonce,
        }),
        "User-Agent": "GPURun/1.0",
      },
      body,
    })

    const plain = await this.decryptResponse(response, "微信 Native 下单")
    const codeUrl = plain.code_url
    if (typeof codeUrl !== "string" || !codeUrl) {
      throw new PaymentPayloadError("wechat", "微信 Native 下单响应缺少 code_url")
    }

    return { channelOrderNo: input.orderNo, codeUrl }
  }

  /**
   * 回调：验签 → 解密 → 归一。
   *
   * 三步任一失败都抛错，绝不「验签失败就当成功」——那等于允许任何人伪造到账。
   */
  async parseCallback(request: GatewayCallbackRequest): Promise<GatewayCallbackResult> {
    this.assertAvailable()

    const timestamp = firstHeader(request.headers["wechatpay-timestamp"] as HeaderValue)
    const nonce = firstHeader(request.headers["wechatpay-nonce"] as HeaderValue)
    const signature = firstHeader(request.headers["wechatpay-signature"] as HeaderValue)

    if (!timestamp || !nonce || !signature) {
      throw new PaymentSignatureError(
        "wechat",
        "缺少 Wechatpay-Timestamp / Wechatpay-Nonce / Wechatpay-Signature 头",
      )
    }

    const ok = verifyWechatNotifySignature({
      signature,
      timestamp,
      nonce,
      rawBody: request.rawBody,
      platformPublicKeyPem: this.config.platformPublicKeyPem!,
    })
    if (!ok) {
      throw new PaymentSignatureError("wechat", "签名与报文不匹配")
    }

    let envelope: Record<string, unknown>
    try {
      envelope = JSON.parse(request.rawBody) as Record<string, unknown>
    } catch {
      throw new PaymentPayloadError("wechat", "回调 body 不是合法 JSON")
    }

    const resource = envelope.resource as Record<string, unknown> | undefined
    if (!resource || typeof resource.ciphertext !== "string") {
      throw new PaymentPayloadError("wechat", "回调缺少 resource.ciphertext")
    }

    let plain: Record<string, unknown>
    try {
      plain = decryptWechatResource({
        ciphertext: resource.ciphertext,
        nonce: String(resource.nonce ?? ""),
        associatedData:
          typeof resource.associated_data === "string" ? resource.associated_data : undefined,
        apiV3Key: this.config.apiV3Key!,
      })
    } catch (err) {
      throw new PaymentPayloadError("wechat", (err as Error).message)
    }

    // 金额：amount.total 为「分」
    const amountObj = plain.amount as { total?: unknown; payer_total?: unknown } | undefined
    const total = amountObj?.total ?? amountObj?.payer_total
    const amountFen = Number(total)
    if (!Number.isSafeInteger(amountFen) || amountFen <= 0) {
      throw new PaymentPayloadError("wechat", `amount.total 非法：${String(total)}`)
    }

    return {
      channelOrderNo: String(plain.out_trade_no ?? ""),
      transactionId: String(plain.transaction_id ?? ""),
      amountFen,
      currency: String((amountObj as { currency?: string } | undefined)?.currency ?? "CNY"),
      status: mapTradeState(String(plain.trade_state ?? "")),
      raw: envelope,
    }
  }

  /**
   * 主动查单：`GET /v3/pay/transactions/out-trade-no/{out_trade_no}`。
   *
   * 回调可能丢（用户关页面、网络中断）。查单是**唯一**的兜底入账依据，
   * 同样必须验签解密，不能因为「是我们自己主动发起的」就跳过。
   */
  async queryPayment(channelOrderNo: string): Promise<GatewayCallbackResult> {
    this.assertAvailable()

    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(channelOrderNo)}?mchid=${encodeURIComponent(this.config.mchId!)}`
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = randomBytes(12).toString("hex")
    const signature = signWechatRequest({
      method: "GET",
      url: path,
      timestamp,
      nonce,
      body: "",
      privateKeyPem: this.config.privateKeyPem!,
    })

    const response = await fetch(`${WECHAT_API_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: buildWechatAuthorizationHeader({
          mchId: this.config.mchId!,
          serialNo: this.config.serialNo!,
          signature,
          timestamp,
          nonce,
        }),
        "User-Agent": "GPURun/1.0",
      },
    })

    const plain = await this.decryptResponse(response, "微信查单")
    const amountObj = plain.amount as { total?: unknown; currency?: unknown } | undefined
    const amountFen = Number(amountObj?.total)
    if (!Number.isSafeInteger(amountFen) || amountFen <= 0) {
      throw new PaymentPayloadError("wechat", `查单 amount.total 非法：${String(amountObj?.total)}`)
    }

    return {
      channelOrderNo: String(plain.out_trade_no ?? channelOrderNo),
      transactionId: String(plain.transaction_id ?? ""),
      amountFen,
      currency: String(amountObj?.currency ?? "CNY"),
      status: mapTradeState(String(plain.trade_state ?? "")),
      raw: plain,
    }
  }
}
