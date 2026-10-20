import type { ContractPricingMode, ContractPricingTier } from '@/lib/data/types'
import { isSharePricingMode } from '@/lib/data/types'
import { COST_TAX_DIVISOR } from '@/lib/finance/cost-row-utils'
import {
  DEFAULT_CARDS_PER_MACHINE,
  computeDealUnitPricePerHour as computeDealUnitPricePerHourShared,
  matchTierByDealToListRatio as matchTierByDealToListRatioShared,
  normalizeSupplierBillingUnit,
  parsePositiveMoney as parsePositiveMoneyShared,
  parsePositivePercent as parsePositivePercentShared,
  parsePricingTiers as parsePricingTiersShared,
  resolveCardTimeUnitPrice,
  tierSettlementUnitPrice as tierSettlementUnitPriceShared,
  type ContractPricingTier as SharedContractPricingTier,
  type SupplierBillingUnit,
} from '@workspace/billing/pricing-resolver'
import { validateRevenueShareRatioContractTiers } from '@/lib/supplier/revenue-share-ratio-tiers'

export type ResolvedPricingFields = {
  pricingMode: ContractPricingMode
  billingUnit?: SupplierBillingUnit
  unitPrice?: number | null
  cardsPerMachine?: number | null
  unitPricePerHour: number | null
  revenueSharePercent: number | null
  listPricePerHour: number | null
  pricingTiers: ContractPricingTier[]
}

export type CostMetrics = {
  balanceConsumption: number
  balanceCardHours: number
  voucherCardHours: number
}

/** 总卡时 = 券卡时 + 余额卡时（设计 §4.6） */
export function computeTotalCardHours(metrics: CostMetrics): number {
  return metrics.balanceCardHours + metrics.voucherCardHours
}

// 以下纯函数转发到 @workspace/billing/pricing-resolver（W-10 单一实现），
// 保留本文件导出名以兼容既有调用方。
export const parsePositiveMoney = parsePositiveMoneyShared
export const parsePositivePercent = parsePositivePercentShared
export const parsePricingTiers = parsePricingTiersShared as (
  value: unknown,
) => ContractPricingTier[]

export function isPricingFieldsComplete(
  fields: {
    configStatus: string
    pricingMode: ContractPricingMode
    billingUnit?: SupplierBillingUnit
    unitPrice?: number | null
    cardsPerMachine?: number | null
    unitPricePerHour: number | null
    revenueSharePercent: number | null
    listPricePerHour: number | null
    pricingTiers: ContractPricingTier[]
  },
  options?: { requireListPrice?: boolean },
): boolean {
  if (fields.configStatus !== 'active') return false

  const mode = fields.pricingMode
  const tiers = fields.pricingTiers
  const requireListPrice = options?.requireListPrice ?? true

  if (mode === 'tiered_revenue_share') {
    if (requireListPrice && fields.listPricePerHour == null) return false
    return validateRevenueShareRatioContractTiers(tiers) == null
  }

  if (mode === 'tiered_card_time') {
    if (requireListPrice && fields.listPricePerHour == null) return false
    return tiers.length >= 1
  }

  if (isSharePricingMode(mode)) {
    return fields.revenueSharePercent != null
  }

  if (normalizeSupplierBillingUnit(fields.billingUnit) === 'month') {
    return fields.unitPrice != null && fields.unitPricePerHour != null
  }

  return fields.unitPricePerHour != null
}

/** 成交/刊例比例落档：[min, max) —— 转发到 billing 单一实现 */
export function matchTierByDealToListRatio(
  tiers: ContractPricingTier[],
  dealToListRatio: number,
): ContractPricingTier | null {
  const matched = matchTierByDealToListRatioShared(
    tiers as SharedContractPricingTier[],
    dealToListRatio,
  )
  return matched as ContractPricingTier | null
}

function tierSettlementUnitPrice(
  tier: ContractPricingTier,
  listPricePerHour: number,
): number | null {
  return tierSettlementUnitPriceShared(tier as SharedContractPricingTier, listPricePerHour)
}

export function computeDealUnitPricePerHour(
  balanceConsumption: number,
  totalCardHours: number,
): number | null {
  return computeDealUnitPricePerHourShared(balanceConsumption, totalCardHours)
}

export type TierCostContext = {
  dealUnitPricePerHour: number | null
  dealToListRatio: number | null
  matchedTierOrder: number | null
  settlementUnitPrice: number | null
  revenueSharePercentApplied: number | null
}

export function resolveTierCostContext(
  pricing: ResolvedPricingFields,
  metrics: CostMetrics,
): TierCostContext {
  const totalCardHours = computeTotalCardHours(metrics)
  const listPrice = pricing.listPricePerHour
  const dealUnit = computeDealUnitPricePerHour(metrics.balanceConsumption, totalCardHours)
  if (dealUnit == null || listPrice == null || listPrice <= 0) {
    return {
      dealUnitPricePerHour: dealUnit,
      dealToListRatio: null,
      matchedTierOrder: null,
      settlementUnitPrice: null,
      revenueSharePercentApplied: null,
    }
  }
  const ratio = dealUnit / listPrice
  const tier = matchTierByDealToListRatio(pricing.pricingTiers, ratio)
  if (!tier) {
    return {
      dealUnitPricePerHour: dealUnit,
      dealToListRatio: ratio,
      matchedTierOrder: null,
      settlementUnitPrice: null,
      revenueSharePercentApplied: null,
    }
  }
  return {
    dealUnitPricePerHour: dealUnit,
    dealToListRatio: ratio,
    matchedTierOrder: tier.tierOrder,
    settlementUnitPrice: tierSettlementUnitPrice(tier, listPrice),
    revenueSharePercentApplied: tier.revenueSharePercent ?? null,
  }
}

export function computeSoldDurationCostExclTax(
  pricing: ResolvedPricingFields,
  metrics: CostMetrics,
  tierContext?: TierCostContext,
): number {
  const mode = pricing.pricingMode
  const tax = COST_TAX_DIVISOR

  if (mode === 'card_time') {
    const unit = pricing.unitPricePerHour
    if (unit == null || metrics.balanceCardHours <= 0) return 0
    return (unit * metrics.balanceCardHours) / tax
  }

  if (mode === 'revenue_share') {
    const pct = pricing.revenueSharePercent
    if (pct == null || metrics.balanceConsumption <= 0) return 0
    return ((pct / 100) * metrics.balanceConsumption) / tax
  }

  const ctx = tierContext ?? resolveTierCostContext(pricing, metrics)

  if (mode === 'tiered_revenue_share') {
    const pct = ctx.revenueSharePercentApplied
    if (pct == null || metrics.balanceConsumption <= 0) return 0
    return ((pct / 100) * metrics.balanceConsumption) / tax
  }

  if (mode === 'tiered_card_time') {
    const tierUnit = ctx.settlementUnitPrice
    if (tierUnit == null || metrics.balanceCardHours <= 0) return 0
    return (tierUnit * metrics.balanceCardHours) / tax
  }

  return 0
}

export function computeGiftedDurationCostExclTaxForPricing(
  pricing: ResolvedPricingFields,
  metrics: CostMetrics,
  tierContext?: TierCostContext,
): number {
  if (metrics.voucherCardHours <= 0) return 0

  const mode = pricing.pricingMode
  const tax = COST_TAX_DIVISOR
  const ctx = tierContext ?? resolveTierCostContext(pricing, metrics)

  if (mode === 'card_time') {
    const unit = pricing.unitPricePerHour
    if (unit == null) return 0
    return (unit * metrics.voucherCardHours) / tax
  }

  if (mode === 'tiered_card_time') {
    const tierUnit = ctx.settlementUnitPrice
    if (tierUnit == null) return 0
    return (tierUnit * metrics.voucherCardHours) / tax
  }

  const settlement =
    ctx.dealUnitPricePerHour ??
    pricing.unitPricePerHour ??
    (pricing.listPricePerHour != null && ctx.dealToListRatio != null
      ? pricing.listPricePerHour * ctx.dealToListRatio
      : null)

  if (settlement == null) return 0
  return (settlement * metrics.voucherCardHours) / tax
}
