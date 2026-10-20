import type { ContractPricingMode } from '@/lib/data/types'
import {
  computeGiftedDurationCostExclTaxForPricing,
  computeSoldDurationCostExclTax,
  parsePositiveMoney,
  parsePositivePercent,
  type ResolvedPricingFields,
} from '@/lib/finance/cost-pricing-utils'
import {
  COST_TAX_DIVISOR,
  computeGrossProfit,
} from '@/lib/finance/cost-row-utils'
import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import type { PlatformProductLine } from '@/lib/types/platform-pricing'
import { SPOT_SELL_PRICE_GROSS_PROFIT_RATE } from '@/lib/monthly-cost/constants'

export type MonthlyConsumptionMetrics = {
  balanceConsumption: number
  balanceCardHours: number
  voucherCardHours: number
}

export type MonthlyCostBranchFinancials = {
  soldDurationCostExclTax: number
  giftedDurationCostExclTax: number
  grossProfit: number
}

export type DualBranchFinancials = {
  confirmedRevenueExclTax: number
  platformCost: MonthlyCostBranchFinancials
  platformSellPrice: MonthlyCostBranchFinancials
}

export function mapTenantProductLineToPlatformListPrice(
  productLine: string,
): PlatformProductLine {
  if (productLine === 'bare_metal') return 'bare_metal'
  if (productLine === 'spot') return 'spot'
  return 'elastic_service'
}

export function pricingFieldsFromMonthlyRow(row: {
  pricingMode: string | null
  unitPricePerHour: string | null
  listPricePerHour: string | null
  revenueSharePercent: string | null
}): ResolvedPricingFields | null {
  if (!row.pricingMode) return null
  return {
    pricingMode: row.pricingMode as ContractPricingMode,
    unitPricePerHour: parsePositiveMoney(row.unitPricePerHour),
    listPricePerHour: parsePositiveMoney(row.listPricePerHour),
    revenueSharePercent: parsePositivePercent(row.revenueSharePercent),
    pricingTiers: [],
  }
}

export function computePlatformCostBranchFinancials(
  metrics: MonthlyConsumptionMetrics,
  pricing: ResolvedPricingFields,
): MonthlyCostBranchFinancials {
  const soldDurationCostExclTax = computeSoldDurationCostExclTax(pricing, metrics)
  const giftedDurationCostExclTax = computeGiftedDurationCostExclTaxForPricing(
    pricing,
    metrics,
  )
  const confirmedRevenueExclTax = metrics.balanceConsumption / COST_TAX_DIVISOR
  const grossProfit = computeGrossProfit(
    confirmedRevenueExclTax,
    soldDurationCostExclTax,
    giftedDurationCostExclTax,
  )
  return { soldDurationCostExclTax, giftedDurationCostExclTax, grossProfit }
}

export function computePlatformSellPriceBranchFinancials(input: {
  metrics: MonthlyConsumptionMetrics
  productLine: TenantRegionGpuProductLine | string
  sellPricePerHour: number | null
}): MonthlyCostBranchFinancials {
  const confirmedRevenueExclTax = input.metrics.balanceConsumption / COST_TAX_DIVISOR

  if (input.productLine === 'spot') {
    const grossProfit = input.metrics.balanceConsumption * SPOT_SELL_PRICE_GROSS_PROFIT_RATE
    return {
      soldDurationCostExclTax: 0,
      giftedDurationCostExclTax: 0,
      grossProfit,
    }
  }

  const unit = input.sellPricePerHour ?? 0
  const soldDurationCostExclTax =
    unit > 0 && input.metrics.balanceCardHours > 0
      ? (unit * input.metrics.balanceCardHours) / COST_TAX_DIVISOR
      : 0
  const giftedDurationCostExclTax =
    unit > 0 && input.metrics.voucherCardHours > 0
      ? (unit * input.metrics.voucherCardHours) / COST_TAX_DIVISOR
      : 0
  const grossProfit = computeGrossProfit(
    confirmedRevenueExclTax,
    soldDurationCostExclTax,
    giftedDurationCostExclTax,
  )
  return { soldDurationCostExclTax, giftedDurationCostExclTax, grossProfit }
}

export function computeDualBranchFinancials(input: {
  balanceConsumption: string | number
  balanceCardHours: string | number
  voucherCardHours: string | number
  productLine: string
  pricing: ResolvedPricingFields | null
  sellPricePerHour: number | null
}): DualBranchFinancials | null {
  const metrics: MonthlyConsumptionMetrics = {
    balanceConsumption: parseMoney(String(input.balanceConsumption)),
    balanceCardHours: Number(input.balanceCardHours ?? 0),
    voucherCardHours: Number(input.voucherCardHours ?? 0),
  }

  if (!input.pricing) return null

  const confirmedRevenueExclTax = metrics.balanceConsumption / COST_TAX_DIVISOR
  const platformCost = computePlatformCostBranchFinancials(metrics, input.pricing)
  const platformSellPrice = computePlatformSellPriceBranchFinancials({
    metrics,
    productLine: input.productLine,
    sellPricePerHour: input.sellPricePerHour,
  })

  return { confirmedRevenueExclTax, platformCost, platformSellPrice }
}

export function money4(n: number): string {
  return toMoneyString(n)
}
