/**
 * 对公转账（bank_transfer）网关
 *
 * 与微信/支付宝的根本差别：**没有网关回调**，到账靠平台人工核对银行流水后确认。
 * 所以它的「建单」是本地动作，「到账」走运营核销（`opsConfirmBankTransfer`）。
 *
 * `available` 恒为 true —— 只要平台为该商户开设了专用收款账户即可自助建单；
 * 「有没有账户可转」是建单时的业务校验（`NoReceivingAccountError`），
 * 不是渠道可用性问题，两者不要混为一谈。
 */

import { PaymentChannelUnavailableError } from "./types"
import type {
  GatewayCallbackRequest,
  GatewayCallbackResult,
  GatewayPrepay,
  GatewayPrepayInput,
  PaymentGateway,
} from "./types"
import type { PaymentMethod } from "../types"

/** 商户建单时拿到的转账指引（账户信息由调用方从 bank_account 注入） */
export interface BankTransferInstruction {
  orderNo: string
  amountYuan: string
  bankName: string
  accountName: string
  accountNo: string
  bankBranch?: string
  /** 汇款备注：必须填 orderNo，否则到账无法自动归属 */
  remark: string
}

export class BankTransferGateway implements PaymentGateway {
  readonly method: PaymentMethod = "bank_transfer"
  readonly available = true
  /** 不依赖凭据也不依赖外部接口，恒可下单 */
  readonly orderCapable = true

  /**
   * 建单。不调任何外部接口：对公转账的「预下单」就是生成 orderNo，
   * 商户拿它作为汇款备注。
   *
   * 注意本方法**不**返回账户信息——账户是每商户一份的 DB 数据，
   * 由调用方（dataaccess）注入，避免把「通道能力」与「账户配置」耦合。
   */
  async createPrepay(input: GatewayPrepayInput): Promise<GatewayPrepay> {
    if (input.amountFen <= 0) {
      throw new PaymentChannelUnavailableError("bank_transfer", `金额非法：${input.amountFen}`)
    }
    return { channelOrderNo: input.orderNo }
  }

  /**
   * 对公转账没有渠道回调，故不支持。
   *
   * 刻意抛错而非返回空实现：若这里返回「pending」，运营侧就可能误以为
   * 「回调没来=还在处理中」，从而跳过人工核对。
   */
  async parseCallback(_request: GatewayCallbackRequest): Promise<GatewayCallbackResult> {
    throw new PaymentChannelUnavailableError(
      "bank_transfer",
      "对公转账无渠道回调，到账须由平台按 orderNo 核对银行流水后人工确认",
    )
  }

  async queryPayment(_channelOrderNo: string): Promise<GatewayCallbackResult> {
    throw new PaymentChannelUnavailableError(
      "bank_transfer",
      "对公转账无主动查单接口，须由平台核对银行流水",
    )
  }
}

/** 把专用账户 + 单号拼成给商户的转账指引 */
export function buildBankTransferInstruction(input: {
  orderNo: string
  amountYuan: string
  account: { bankName: string; accountName: string; accountNo: string; bankBranch?: string | null }
}): BankTransferInstruction {
  return {
    orderNo: input.orderNo,
    amountYuan: input.amountYuan,
    bankName: input.account.bankName,
    accountName: input.account.accountName,
    accountNo: input.account.accountNo,
    bankBranch: input.account.bankBranch ?? undefined,
    remark: input.orderNo,
  }
}
