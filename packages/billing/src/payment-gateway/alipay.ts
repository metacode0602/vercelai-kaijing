/**
 * 支付宝适配器（`alipay.trade.page.pay` 网页支付 + 通知验签）
 *
 * `available` 需 appId + 私钥 + 支付宝公钥 + notifyUrl 四者齐备，任一缺失即渠道关闭。
 *
 * 下单走 **`alipay.trade.page.pay`（GET 跳转）** 而非 SDK：
 *   - 该接口本身就是「拼一串签名参数 → 浏览器整页跳转到 openapi.alipay.com」，
 *     没有需要服务端轮询/等待的同步响应，用 SDK 反而多一层依赖；
 *   - 签名与验签都是 RSA2 纯函数，可离线单测（见 payment-gateway.test.ts），
 *     不需要真实 APPID 就能验证「参数排序 / 签名串 / 编码」是否正确；
 *   - 真正的到账仍只认异步通知（`parseCallback`），跳转回来的页面**不能**当作到账凭据。
 */

import {
  PaymentChannelUnavailableError,
  PaymentPayloadError,
  PaymentSignatureError,
} from "./types"
import {
  encodeAlipayParams,
  fenToYuanString,
  signAlipayParams,
  verifyAlipayResponseSignature,
  verifyAlipaySignature,
} from "./crypto"
import type {
  AlipayConfig,
  GatewayCallbackRequest,
  GatewayCallbackResult,
  GatewayPrepay,
  GatewayPrepayInput,
  PaymentGateway,
} from "./types"
import type { PaymentMethod } from "../types"

/** 支付宝开放平台默认网关（沙箱为 https://openapi-sandbox.dl.alipaydev.com/gateway.do） */
const DEFAULT_GATEWAY_URL = "https://openapi.alipay.com/gateway.do"

/**
 * 支付宝要求的时间戳格式：`yyyy-MM-dd HH:mm:ss`。
 *
 * 刻意用 UTC+8 固定偏移而不是 `toLocaleString`：容器时区通常是 UTC，
 * 用本地时区格式化会让签名的 `timestamp` 与支付宝校验的相差 8 小时，直接被拒。
 */
function formatAlipayTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const bj = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return (
    `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ` +
    `${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`
  )
}

/** 解析 form-urlencoded / query 串为扁平对象（同名键取第一个） */
function parseFormBody(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of body.split("&")) {
    if (!pair) continue
    const idx = pair.indexOf("=")
    const key = decodeURIComponent(idx < 0 ? pair : pair.slice(0, idx))
    const value = idx < 0 ? "" : decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "))
    if (!(key in out)) out[key] = value
  }
  return out
}

/** 支付宝交易状态 → 平台终局 */
function mapTradeStatus(status: string): GatewayCallbackResult["status"] {
  switch (status) {
    case "TRADE_SUCCESS":
    case "TRADE_FINISHED":
      return "success"
    case "TRADE_CLOSED":
      return "failed"
    default:
      return "pending"
  }
}

export class AlipayGateway implements PaymentGateway {
  readonly method: PaymentMethod = "alipay"
  readonly available: boolean
  /**
   * 凭据齐备即可下单：page.pay 只要求拼签名 + 跳转，不需要任何联调才能跑通的
   * 同步接口。故与 `available` 同源，而不是像微信那样有独立的「下单未联调」闸。
   */
  readonly orderCapable: boolean
  readonly unavailableReason?: string

  /** 渠道配置；构造后只读 */
  private readonly config: AlipayConfig

  constructor(config: AlipayConfig) {
    this.config = config
    const missing: string[] = []
    if (!config.appId) missing.push("ALIPAY_APP_ID")
    if (!config.privateKeyPem) missing.push("ALIPAY_PRIVATE_KEY")
    if (!config.publicKeyPem) missing.push("ALIPAY_PUBLIC_KEY")
    if (!config.notifyUrl) missing.push("ALIPAY_NOTIFY_URL")

    this.available = missing.length === 0
    this.orderCapable = this.available
    if (!this.available) {
      this.unavailableReason = `缺少配置：${missing.join("、")}`
    }
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new PaymentChannelUnavailableError("alipay", this.unavailableReason!)
    }
  }

  /**
   * 下单：`alipay.trade.page.pay`（电脑网站支付）。
   *
   * 返回 `payUrl` 让浏览器整页跳转。**不返回 sign 之外的任何"假成功"字段** ——
   * 商户点下按钮后被带到支付宝，若签名错误支付宝会当场报错，这比返回一个
   * 看起来正常但付不出去的表单安全得多。
   *
   * 金额换算走 `fenToYuanString`：支付宝的 `total_amount` 单位是**元**且最多
   * 2 位小数，直接 `String(fen / 100)` 会产出 "88.5" 这类被拒的串。
   *
   * `time_expire` 与我方订单失效时间对齐：支付宝过了这个点就拒付，避免商户
   * 在我方订单过期后才付款、导致「钱到了但不入账」。
   */
  async createPrepay(input: GatewayPrepayInput): Promise<GatewayPrepay> {
    this.assertAvailable()

    if (!Number.isSafeInteger(input.amountFen) || input.amountFen <= 0) {
      throw new PaymentPayloadError("alipay", `金额非法（分）：${input.amountFen}`)
    }

    const bizContent = JSON.stringify({
      out_trade_no: input.orderNo,
      // FAST_INSTANT_TRADE = 电脑网站支付（个人/企业均可）。选错 product_code
      // 会让支付宝按另一种产品形态渲染，参数被拒。
      product_code: "FAST_INSTANT_TRADE",
      total_amount: fenToYuanString(input.amountFen),
      subject: input.description,
      ...(input.payerName
        ? // passback_params 要求原值先 URL Encode（支付宝会原样回传）
          { passback_params: encodeURIComponent(input.payerName) }
        : {}),
      ...(input.expiresAt ? { time_expire: formatAlipayTimestamp(input.expiresAt) } : {}),
    })

    // 公共参数 + 业务参数平铺同级参与签名（支付宝 v2 规范，不是嵌套）
    const params: Record<string, string | undefined> = {
      app_id: this.config.appId,
      method: "alipay.trade.page.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: formatAlipayTimestamp(new Date()),
      version: "1.0",
      notify_url: this.config.notifyUrl,
      return_url: this.config.returnUrl,
      biz_content: bizContent,
    }

    const sign = signAlipayParams(params, this.config.privateKeyPem!)
    const query = encodeAlipayParams({ ...params, sign })

    return {
      // 支付宝的商户订单号就是我方 orderNo（out_trade_no），回调按它回查
      channelOrderNo: input.orderNo,
      payUrl: `${this.config.gatewayUrl ?? DEFAULT_GATEWAY_URL}?${query.toString()}`,
    }
  }

  /** 异步通知：验签 → 归一。验签失败一律拒绝。 */
  async parseCallback(request: GatewayCallbackRequest): Promise<GatewayCallbackResult> {
    this.assertAvailable()

    const params = parseFormBody(request.rawBody)
    const sign = params.sign
    if (!sign) {
      throw new PaymentSignatureError("alipay", "回调缺少 sign 字段")
    }

    const ok = verifyAlipaySignature(
      { ...params, sign: undefined },
      sign,
      this.config.publicKeyPem!,
    )
    if (!ok) {
      throw new PaymentSignatureError("alipay", "签名与参数不匹配")
    }

    // 校验 app_id 而非 seller_id：
    //   app_id    = 本应用的应用 ID，与配置一致才说明回调是发给我们的
    //   seller_id = 收款方商户 PID（2088…），与 app_id 是不同维度，
    //               拿它和 appId 比会在生产上把每一笔合法回调都拒掉。
    const notifyAppId = params.app_id
    if (notifyAppId && notifyAppId !== this.config.appId) {
      // 防止把其它应用的回调当成自己的
      throw new PaymentSignatureError(
        "alipay",
        `回调 app_id 不匹配：期望 ${this.config.appId}，实际 ${notifyAppId}`,
      )
    }

    // 支付宝通知的金额单位是**元**（如 "88.50"），不是分，故不能按整数分校验。
    // 换算用 Math.round 吸收 "0.1+0.2" 类浮点误差。
    const totalAmount = params.total_amount ?? params.receipt_amount
    if (totalAmount === undefined) {
      throw new PaymentPayloadError("alipay", "回调缺少 total_amount")
    }
    const amountYuan = Number(totalAmount)
    if (!Number.isFinite(amountYuan) || amountYuan <= 0) {
      throw new PaymentPayloadError("alipay", `total_amount 非法：${totalAmount}`)
    }

    return {
      channelOrderNo: params.out_trade_no ?? "",
      transactionId: params.trade_no ?? "",
      amountFen: Math.round(amountYuan * 100),
      currency: "CNY",
      status: mapTradeStatus(params.trade_status ?? ""),
      raw: params,
    }
  }

  /**
   * 主动查单：`alipay.trade.query`。
   *
   * 与下单同构（签名 → form POST → 验签），只是 `method` 与 `biz_content` 不同。
   * 查单同样必须验签：这是兜底入账的唯一依据。
   */
  async queryPayment(channelOrderNo: string): Promise<GatewayCallbackResult> {
    this.assertAvailable()

    const params: Record<string, string | undefined> = {
      app_id: this.config.appId,
      method: "alipay.trade.query",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: formatAlipayTimestamp(new Date()),
      version: "1.0",
      biz_content: JSON.stringify({ out_trade_no: channelOrderNo }),
    }
    const requestSign = signAlipayParams(params, this.config.privateKeyPem!)

    const response = await fetch(this.config.gatewayUrl ?? DEFAULT_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: encodeAlipayParams({ ...params, sign: requestSign }).toString(),
    })

    const rawBody = await response.text()
    if (!response.ok) {
      throw new PaymentPayloadError(
        "alipay",
        `查单请求失败：HTTP ${response.status} ${response.statusText}`,
      )
    }

    // 验签必须基于**原始响应串**：支付宝对 JSON 响应的签名覆盖「去掉 sign 后的原始
    // 字节」。先 parse 再 stringify 会因键序/转义（如 \/、非 ASCII）差异导致误判，
    // 结果是每次查单都报验签失败、兜底入账形同虚设。
    if (!verifyAlipayResponseSignature(rawBody, this.config.publicKeyPem!)) {
      throw new PaymentSignatureError("alipay", "查单响应验签失败")
    }

    // 顶层包一层 `alipay_<method>_response`，业务字段在其内部。
    let envelope: { alipay_trade_query_response?: Record<string, unknown> }
    try {
      envelope = JSON.parse(rawBody)
    } catch {
      throw new PaymentPayloadError("alipay", "查单响应不是合法 JSON")
    }
    const body = envelope.alipay_trade_query_response
    if (!body) {
      throw new PaymentPayloadError("alipay", "查单响应缺少 alipay_trade_query_response")
    }

    const totalAmount = body.total_amount as string | undefined
    const amountFen = totalAmount === undefined ? 0 : Math.round(Number(totalAmount) * 100)
    if (!Number.isSafeInteger(amountFen) || amountFen <= 0) {
      throw new PaymentPayloadError("alipay", `查单 total_amount 非法：${String(totalAmount)}`)
    }

    return {
      channelOrderNo: String(body.out_trade_no ?? channelOrderNo),
      transactionId: String(body.trade_no ?? ""),
      amountFen,
      currency: "CNY",
      status: mapTradeStatus(String(body.trade_status ?? "")),
      raw: body,
    }
  }
}
