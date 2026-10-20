/**
 * 计价方式（pricingMode）与合作模式（cooperationMode）是两套独立维度：
 * - cooperationMode 决定「怎么租」：整租（按台/月）还是闲时（按 GPU 卡时）
 * - pricingMode 决定「怎么算钱」：卡时 / 阶梯卡时 / 分成 / 阶梯分成
 *
 * 历史代码把两者混用（`CooperationMode = ContractPricingMode`），
 * 导致分成账单在展示层落回卡时公式。此处集中放判定逻辑，供
 * dataaccess、mapper 与展示组件共用。
 */
import type { ContractPricingMode } from '@/lib/data/types'

const REVENUE_SHARE_PRICING_MODES = new Set<string>([
  'revenue_share',
  'tiered_revenue_share',
])

/** 该计价方式下金额是否由「客户消费 × 分成比例」得出 */
export function isRevenueSharePricingMode(
  pricingMode: string | null | undefined,
): pricingMode is 'revenue_share' | 'tiered_revenue_share' {
  return pricingMode != null && REVENUE_SHARE_PRICING_MODES.has(pricingMode)
}

/** 该计价方式下金额是否由「使用卡时 × 卡时单价」得出 */
export function isCardTimePricingMode(
  pricingMode: string | null | undefined,
): pricingMode is 'card_time' | 'tiered_card_time' {
  return pricingMode === 'card_time' || pricingMode === 'tiered_card_time'
}

export function asContractPricingMode(value: string): ContractPricingMode {
  if (
    value === 'card_time' ||
    value === 'revenue_share' ||
    value === 'tiered_card_time' ||
    value === 'tiered_revenue_share'
  ) {
    return value
  }
  return 'card_time'
}

/**
 * 单条账单明细的应付金额。
 *
 * 计价方式取明细行自己的 pricingMode 快照，不再拿账单头的 cooperationMode
 * 去比对合同计价方式——两者本就是不同维度，混用会让分成账单落回卡时公式。
 * `tenantConsumption` 为空说明该行尚未结算出客户消费，按设计应显示「待结算」，
 * 而不是回退成 0 元的卡时金额。
 */
export function computeBillDetailAmount(detail: {
  pricingMode?: string | null
  amount: number
  tenantConsumption?: number | null
  revenueShareRatio?: number | null
}): { value: number; pending: boolean } {
  if (isRevenueSharePricingMode(detail.pricingMode)) {
    if (detail.tenantConsumption == null) return { value: 0, pending: true }
    return {
      value: (detail.tenantConsumption * (detail.revenueShareRatio || 0)) / 100,
      pending: false,
    }
  }
  // 卡时 / 阶梯卡时；mixed 理论上只出现在账单头，落到明细行应已收敛为具体模式
  return { value: detail.amount, pending: false }
}
