import { computeSuggestedPrices, type PlatformFeePercents } from './pricing'

export type PlatformSiteKey = {
  platform: string
  country: string
  currency: string
  labelZh: string
}

export type PlatformComparisonInput = PlatformSiteKey & {
  /** 该站点自己的费用模板；不得套用其他平台费率 */
  fees: PlatformFeePercents | null
  /** 该站点可用的到仓/含税完全成本；缺则不算价格 */
  fullCostUnit: number | null
  costCurrency: string
  missingReasons: string[]
}

export type PlatformComparisonRow = PlatformSiteKey & {
  fullCostUnit: number | null
  costCurrency: string
  suggestedRetail: number | null
  suggestedFreeShipping: number | null
  freeShippingCapped: boolean | null
  expectedMarginPct: number | null
  isEstimate: boolean
  missingReasons: string[]
  feeSource: 'org_fee_template' | 'temporary' | 'missing'
}

/**
 * 多平台对照：每个站点只用自己的费用模板和可用到仓成本。
 * 配不齐的行只标缺项，不算假价格。跨币种只并列，不加总。
 */
export function comparePlatformSuggestions(
  rows: PlatformComparisonInput[],
): PlatformComparisonRow[] {
  return rows.map((row) => {
    const missing = [...row.missingReasons]
    if (!row.fees) missing.push('缺费用模板')
    if (row.fullCostUnit == null || !(row.fullCostUnit > 0)) missing.push('缺到仓成本')
    const canPrice = Boolean(row.fees) && row.fullCostUnit != null && row.fullCostUnit > 0
    if (!canPrice || !row.fees || row.fullCostUnit == null) {
      return {
        platform: row.platform,
        country: row.country,
        currency: row.currency,
        labelZh: row.labelZh,
        fullCostUnit: row.fullCostUnit,
        costCurrency: row.costCurrency,
        suggestedRetail: null,
        suggestedFreeShipping: null,
        freeShippingCapped: null,
        expectedMarginPct: null,
        isEstimate: true,
        missingReasons: missing,
        feeSource: row.fees?.temporary ? 'temporary' : row.fees ? 'org_fee_template' : 'missing',
      }
    }
    const priced = computeSuggestedPrices({ fullCostUnit: row.fullCostUnit, fees: row.fees })
    const isEstimate = missing.length > 0 || Boolean(row.fees.temporary)
    return {
      platform: row.platform,
      country: row.country,
      currency: row.currency,
      labelZh: row.labelZh,
      fullCostUnit: row.fullCostUnit,
      costCurrency: row.costCurrency,
      suggestedRetail: priced.retail.price,
      suggestedFreeShipping: priced.freeShipping?.suggestedPrice ?? null,
      freeShippingCapped: priced.freeShipping?.capped ?? null,
      expectedMarginPct: priced.expectedMarginPct,
      isEstimate,
      missingReasons: missing,
      feeSource: row.fees.temporary ? 'temporary' : 'org_fee_template',
    }
  })
}

/** 断言对照行未混用其他平台的费率（测试辅助）。 */
export function feesBelongToPlatform(
  feesPlatform: string,
  feesCountry: string,
  rowPlatform: string,
  rowCountry: string,
): boolean {
  return (
    feesPlatform.trim().toLowerCase() === rowPlatform.trim().toLowerCase() &&
    feesCountry.trim().toUpperCase() === rowCountry.trim().toUpperCase()
  )
}
