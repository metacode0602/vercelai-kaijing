/**
 * 支付网关抽象层
 *
 * ## 为什么不直接写死 wechat/alipay 调用
 *
 * 微信支付 V3 与支付宝的签名体系、回调验签、证书轮换各不相同，把它们内联进业务
 * 逻辑会让「有没有配置凭据」变成一个散落在 if 分支里的隐式条件——结果是商户点了
 * 充值、订单进了支付流程、最后才失败。故本模块只做两件事：
 *
 *   1. 声明渠道契约（`PaymentGateway`），让业务层只依赖接口；
 *   2. 凭据缺失时把渠道标记为**不可用**（`available=false` + 明确原因），
 *      由业务层在建单前就拒绝，不产生脏单。
 *
 * ## 配置来源
 *
 * 仅从环境变量读取（`payment-gateway.config.ts`），不落库：凭据属于密钥，
 * 按 AGENTS.md 约定不入代码库。缺任一必需项即该渠道不可用。
 *
 * ## 验签可测性
 *
 * 微信/支付宝的签名算法（RSA2 / AES-256-GCM）实现为纯函数，可不依赖真实凭据、
 * 用本地生成的密钥离线单测（见 `payment-gateway.crypto.test.ts`）。
 */

import type { PaymentMethod } from "../types"

// ---------------------------------------------------------------------------
// 错误
// ---------------------------------------------------------------------------

/** 渠道未配置凭据：业务层应在建单前捕获，避免产生无法支付的单据 */
export class PaymentChannelUnavailableError extends Error {
  readonly code = "PAYMENT_CHANNEL_UNAVAILABLE"
  readonly method: PaymentMethod
  readonly reason: string

  constructor(method: PaymentMethod, reason: string) {
    super(`支付通道 ${method} 当前不可用：${reason}`)
    this.name = "PaymentChannelUnavailableError"
    this.method = method
    this.reason = reason
  }
}

/** 回调验签失败：绝不继续，必须由网关重试或人工介入 */
export class PaymentSignatureError extends Error {
  readonly code = "PAYMENT_SIGNATURE_INVALID"
  readonly method: PaymentMethod

  constructor(method: PaymentMethod, message: string) {
    super(`[${method}] 回调验签失败：${message}`)
    this.name = "PaymentSignatureError"
    this.method = method
  }
}

/** 回调解析/解密失败（结构不合法、AEAD 解密失败等） */
export class PaymentPayloadError extends Error {
  readonly code = "PAYMENT_PAYLOAD_INVALID"
  readonly method: PaymentMethod

  constructor(method: PaymentMethod, message: string) {
    super(`[${method}] 回调报文解析失败：${message}`)
    this.name = "PaymentPayloadError"
    this.method = method
  }
}

// ---------------------------------------------------------------------------
// 渠道契约
// ---------------------------------------------------------------------------

/** 渠道配置（从环境变量解析，缺失项不填） */
export interface WechatPayConfig {
  /** 微信支付商户号 mchid */
  mchId?: string
  /** 绑定的 AppID（公众号/小程序/开放平台） */
  appId?: string
  /** 商户 API 证书私钥（PKCS#8 PEM） */
  privateKeyPem?: string
  /** 商户证书序列号 */
  serialNo?: string
  /** 微信支付平台证书或公钥（用于回调验签） */
  platformPublicKeyPem?: string
  /** 平台证书序列号 */
  platformSerialNo?: string
  /** APIv3 密钥（回调 resource 的 AES-256-GCM 解密） */
  apiV3Key?: string
  /** 通知地址（平台回调 URL） */
  notifyUrl?: string
}

export interface AlipayConfig {
  /** 应用 APPID */
  appId?: string
  /** 应用私钥（PKCS#8/PKCS#1 PEM） */
  privateKeyPem?: string
  /** 支付宝公钥或支付宝公钥证书中的公钥（用于通知验签） */
  publicKeyPem?: string
  /** 异步通知地址 */
  notifyUrl?: string
  /** 同步跳转地址（支付完成后回到商户页）。缺省时不带该参数，支付宝不强制要求 */
  returnUrl?: string
  /** 网关地址（沙箱可改） */
  gatewayUrl?: string
  /** 签名类型，固定 RSA2 */
  signType?: "RSA2"
}

/** 建单结果：跳转到渠道收银台所需的参数 */
export interface GatewayPrepay {
  /** 渠道侧单号（写入 payment_order.channel_order_no） */
  channelOrderNo: string
  /** 支付 URL / 收银台地址（网页支付） */
  payUrl?: string
  /** 小程序/APP 唤起参数原文（JSON） */
  invokeParams?: string
  /** 二维码内容（扫码支付） */
  codeUrl?: string
}

/** 渠道回调解析后的终局结果（金额单位一律「分」） */
export interface GatewayCallbackResult {
  channelOrderNo: string
  /** 渠道交易号 */
  transactionId: string
  /** 实际到账金额（分） */
  amountFen: number
  /** 币种，如 CNY */
  currency: string
  /** 终局状态 */
  status: "success" | "failed" | "pending"
  /** 渠道原始回调体（落 channel_response，便于对账） */
  raw: unknown
}

export interface PaymentGateway {
  readonly method: PaymentMethod
  /**
   * 凭据是否齐备。false 时业务层必须在建单前拒绝。
   *
   * 注意：这只代表「密钥配全了」，不代表「商户现在能用」——见 `orderCapable`。
   */
  readonly available: boolean
  /**
   * 能否真正发起一笔线上支付（`createPrepay` 是否已联调）。
   *
   * 这两个标志必须分开：微信/支付宝的凭据可以先配好、回调解析先上线，但下单
   * 接口未联调时 `createPrepay` 仍会抛错。若只看 `available` 就把渠道摆到商户
   * 面前，商户会填完金额、点下按钮、然后撞到一句「尚未联调」——这正是
   * `available` 单独存在时最危险的一种组合。故商户端只渲染
   * `available && orderCapable` 的渠道（见 `listAvailableMethods`）。
   */
  readonly orderCapable: boolean
  /** 不可用原因（available=false 时非空），用于给商户的文案 */
  readonly unavailableReason?: string
  /** 建单：返回渠道收银台参数 */
  createPrepay(input: GatewayPrepayInput): Promise<GatewayPrepay>
  /** 校验并解析回调（验签 + 解密 + 状态归一） */
  parseCallback(request: GatewayCallbackRequest): Promise<GatewayCallbackResult>
  /** 主动查单（回调丢失时的兜底对账） */
  queryPayment(channelOrderNo: string): Promise<GatewayCallbackResult>
}

export interface GatewayPrepayInput {
  /** 我方单号（out_trade_no），同时作为转账/备注 */
  orderNo: string
  /** 金额（分） */
  amountFen: number
  /** 币种 */
  currency: string
  /** 付款方主体标识（商户号/用户 openid，视渠道而定） */
  payerId: string
  /** 付款方展示名 */
  payerName?: string
  /** 订单描述 */
  description: string
  /** 客户端 IP（风控用） */
  clientIp?: string
  /** 幂等键（部分渠道要求） */
  idempotencyKey?: string
  /**
   * 我方订单的失效时间。
   *
   * 必须透传给渠道（`time_expire`），否则会出现最糟的一种状态：商户在我方订单
   * 已过期后仍完成了付款，钱真收到了，但入账时按「过期单拒绝」被退回 ——
   * 平台白拿一笔钱、商户余额没涨，客服也说不清。渠道侧到期即停止收款，
   * 才能让「我方过期」与「渠道可付」这两条时间线对齐。
   */
  expiresAt?: Date
}

export interface GatewayCallbackRequest {
  /** 原始报文 */
  rawBody: string
  headers: Record<string, string | string[] | undefined>
  /** 渠道配置的回调地址（参与签名，必须与发起时一致） */
  notifyUrl?: string
}
