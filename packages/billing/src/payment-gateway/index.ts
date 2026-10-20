/**
 * 支付网关注册表 —— 业务层唯一的取用入口
 *
 * ## 「凭据未配置即通道关闭」的实现方式
 *
 * `getPaymentGateway(method)` 在渠道不可用时**直接抛**
 * `PaymentChannelUnavailableError`，而不是返回一个 available=false 的对象让
 * 调用方自己判断。理由：漏判一次的后果是商户建了一个永远付不了的单，
 * 还要走人工撤单。抛错让遗漏在测试里就暴露。
 *
 * 需要「看有哪些通道可用」（渲染前端选项）时用 `listAvailableMethods()`。
 */

import { AlipayGateway } from "./alipay"
import { BankTransferGateway } from "./bank-transfer"
import { WechatPayGateway } from "./wechat"
import { PaymentChannelUnavailableError } from "./types"
import type { AlipayConfig, PaymentGateway, WechatPayConfig } from "./types"
import { PAYMENT_METHODS, type PaymentMethod } from "../types"

export interface PaymentGatewayConfig {
  wechat?: WechatPayConfig
  alipay?: AlipayConfig
}

function readPem(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]
  if (!v) return undefined
  // 允许用 \n 转义的多行 PEM（部署时单行环境变量常见）
  return v.includes("\\n") ? v.replace(/\\n/g, "\n") : v
}

/** 从环境变量解析网关配置。不设置任何默认值——缺就是缺，由渠道自己判不可用。 */
export function loadPaymentGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): PaymentGatewayConfig {
  const wechat: WechatPayConfig = {
    mchId: env.WECHAT_PAY_MCH_ID,
    appId: env.WECHAT_PAY_APP_ID,
    privateKeyPem: readPem(env, "WECHAT_PAY_PRIVATE_KEY"),
    serialNo: env.WECHAT_PAY_SERIAL_NO,
    platformPublicKeyPem: readPem(env, "WECHAT_PAY_PLATFORM_CERT"),
    platformSerialNo: env.WECHAT_PAY_PLATFORM_SERIAL_NO,
    apiV3Key: env.WECHAT_PAY_API_V3_KEY,
    notifyUrl: env.WECHAT_PAY_NOTIFY_URL,
  }
  const alipay: AlipayConfig = {
    appId: env.ALIPAY_APP_ID,
    privateKeyPem: readPem(env, "ALIPAY_PRIVATE_KEY"),
    publicKeyPem: readPem(env, "ALIPAY_PUBLIC_KEY"),
    notifyUrl: env.ALIPAY_NOTIFY_URL,
    returnUrl: env.ALIPAY_RETURN_URL,
    gatewayUrl: env.ALIPAY_GATEWAY_URL,
    signType: "RSA2",
  }
  return { wechat, alipay }
}

function buildGateways(config: PaymentGatewayConfig): Map<PaymentMethod, PaymentGateway> {
  return new Map<PaymentMethod, PaymentGateway>([
    ["wechat", new WechatPayGateway(config.wechat ?? {})],
    ["alipay", new AlipayGateway(config.alipay ?? {})],
    ["bank_transfer", new BankTransferGateway()],
  ])
}

let registry: Map<PaymentMethod, PaymentGateway> | null = null

/** 测试用：注入自定义注册表（不改动模块级单例） */
export function setPaymentGatewayRegistry(
  map: Map<PaymentMethod, PaymentGateway> | null,
): void {
  registry = map
}

function getRegistry(): Map<PaymentMethod, PaymentGateway> {
  registry ??= buildGateways(loadPaymentGatewayConfig())
  return registry
}

/**
 * 取网关。渠道不可用即抛 `PaymentChannelUnavailableError`。
 *
 * 业务层应在**建单前**调用，据此给商户明确提示，而不是让单据进到不可支付的流程里。
 */
export function getPaymentGateway(method: PaymentMethod): PaymentGateway {
  const gw = getRegistry().get(method)
  if (!gw) {
    throw new PaymentChannelUnavailableError(method, "未注册该支付方式")
  }
  if (!gw.available) {
    throw new PaymentChannelUnavailableError(method, gw.unavailableReason ?? "通道未配置")
  }
  return gw
}

/** 只看凭据，不抛错（回调处理器/排障用；**不代表商户能下单**） */
export function isPaymentMethodAvailable(method: PaymentMethod): boolean {
  return getRegistry().get(method)?.available ?? false
}

/** 凭据齐备**且**下单已联调**——商户能真正走通的支付方式 */
export function isPaymentMethodOrderable(method: PaymentMethod): boolean {
  const gw = getRegistry().get(method)
  return (gw?.available ?? false) && (gw?.orderCapable ?? false)
}

/**
 * 取「商户现在就能用」的网关，否则抛 `PaymentChannelUnavailableError`。
 *
 * 与 `getPaymentGateway` 的区别：后者只管凭据（回调处理器用），本函数额外要求
 * 下单已联调。建单前用本函数，能保证「不可下单的通道」在建单**之前**就被挡掉，
 * 不会留下一个永远付不了的 pending 单。
 */
export function requireOrderableGateway(method: PaymentMethod): PaymentGateway {
  const gw = getPaymentGateway(method)
  if (!gw.orderCapable) {
    throw new PaymentChannelUnavailableError(
      method,
      "下单接口尚未联调，暂不支持商户自助支付",
    )
  }
  return gw
}

/**
 * 商户端要渲染的支付方式。
 *
 * 这里刻意**不能**只按 `available` 过滤：微信/支付宝的凭据可以先配好以便回调
 * 解析上线，但 `createPrepay` 未联调时把通道摆到商户面前，商户会一路填到提交
 * 才撞上「尚未联调」。多一个 `orderCapable` 就是为了让「能配」与「能用」两件事
 * 在代码里分开，而不是靠运营记得别配。
 */
export function listAvailableMethods(): PaymentMethod[] {
  return PAYMENT_METHODS.filter((m) => isPaymentMethodOrderable(m))
}

/** 渠道诊断信息（运营/排障用，不给终端用户） */
export function describePaymentChannels(): Array<{
  method: PaymentMethod
  available: boolean
  orderCapable: boolean
  /** 商户端是否会展示该通道（= available && orderCapable） */
  offered: boolean
  reason?: string
}> {
  return PAYMENT_METHODS.map((method) => {
    const gw = getRegistry().get(method)
    const available = gw?.available ?? false
    const orderCapable = gw?.orderCapable ?? false
    return {
      method,
      available,
      orderCapable,
      offered: available && orderCapable,
      ...(available ? {} : { reason: gw?.unavailableReason ?? "未注册" }),
    }
  })
}

export * from "./types"
export * from "./crypto"
export { AlipayGateway } from "./alipay"
export { WechatPayGateway } from "./wechat"
export { BankTransferGateway, buildBankTransferInstruction } from "./bank-transfer"
