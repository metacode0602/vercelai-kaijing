import { round2, round4 } from './math'

export type ReversePriceInput = {
  fullCostUnit: number
  commissionPct: number
  /** 回款 / 支付手续费 */
  payoutPct: number
  warehousePct: number
  targetMarginPct: number
  /** 额外可变费率（如广告），默认 0；定价主公式不含此项 */
  extraPct?: number
}

export type ReversePriceResult = {
  price: number | null
  denom: number
  error: string | null
}

/** 标准倒推分母：1 − 佣金 − 回款 − 仓杂 − 目标毛利（可加 extra）。不用讲义 0.365 笔误。 */
export function reversePriceDenominator(input: ReversePriceInput): number {
  const commission = input.commissionPct / 100
  const payout = input.payoutPct / 100
  const warehouse = input.warehousePct / 100
  const margin = input.targetMarginPct / 100
  const extra = (input.extraPct ?? 0) / 100
  return 1 - commission - payout - warehouse - margin - extra
}

export function suggestSellPriceStandard(input: ReversePriceInput): ReversePriceResult {
  const denom = reversePriceDenominator(input)
  if (denom <= 0.01) {
    return { price: null, denom: round4(denom), error: '目标毛利或费率过高（分母 ≤ 0），请下调目标或费率。' }
  }
  const price = input.fullCostUnit / denom
  return { price: round2(price), denom: round4(denom), error: null }
}

export type FreeShippingPriceInput = ReversePriceInput & {
  /** 包邮佣金比例（额外叠加），如 5 */
  freeShippingPct: number
  /** 封顶金额，须与成本/售价同一币种 */
  capAmount: number
}

export type FreeShippingPriceResult = {
  trialPrice: number | null
  trialFreeShippingFee: number | null
  capped: boolean
  suggestedPrice: number | null
  freeShippingFee: number | null
  denomUsed: number | null
  error: string | null
}

/**
 * 包邮两步回算：先按未触顶分母（标准分母 − 包邮%）试算；
 * 若售价 × 包邮% > 封顶，则改算 (总成本 + 封顶) ÷ 标准档分母。
 */
export function suggestFreeShippingPrice(input: FreeShippingPriceInput): FreeShippingPriceResult {
  const standard = suggestSellPriceStandard(input)
  if (standard.price == null) {
    return {
      trialPrice: null,
      trialFreeShippingFee: null,
      capped: false,
      suggestedPrice: null,
      freeShippingFee: null,
      denomUsed: null,
      error: standard.error,
    }
  }
  const cap = input.capAmount
  const hasCap = Number.isFinite(cap) && cap > 0
  const trial = suggestSellPriceStandard({
    ...input,
    extraPct: (input.extraPct ?? 0) + input.freeShippingPct,
  })
  if (trial.price == null) {
    return {
      trialPrice: null,
      trialFreeShippingFee: null,
      capped: false,
      suggestedPrice: null,
      freeShippingFee: null,
      denomUsed: null,
      error: trial.error,
    }
  }
  const trialFee = trial.price * (input.freeShippingPct / 100)
  if (hasCap && trialFee > cap) {
    const cappedPrice = (input.fullCostUnit + cap) / standard.denom
    return {
      trialPrice: trial.price,
      trialFreeShippingFee: round2(trialFee),
      capped: true,
      suggestedPrice: round2(cappedPrice),
      freeShippingFee: round2(cap),
      denomUsed: standard.denom,
      error: null,
    }
  }
  return {
    trialPrice: trial.price,
    trialFreeShippingFee: round2(trialFee),
    capped: false,
    suggestedPrice: trial.price,
    freeShippingFee: round2(trialFee),
    denomUsed: trial.denom,
    error: null,
  }
}

export type PlatformFeePercents = {
  commissionPct: number
  payoutPct: number
  warehousePct: number
  targetMarginPct: number
  freeShippingPct: number
  /** 与售价同一币种的封顶；无则 0 表示不封顶 */
  freeShippingCap: number
  /** 是否使用了临时费率（未写入模板） */
  temporary?: boolean
}

export function computeSuggestedPrices(input: {
  fullCostUnit: number
  fees: PlatformFeePercents
}): {
  retail: ReversePriceResult
  freeShipping: FreeShippingPriceResult | null
  expectedPayout: number | null
  expectedMarginPct: number | null
} {
  const retail = suggestSellPriceStandard({
    fullCostUnit: input.fullCostUnit,
    commissionPct: input.fees.commissionPct,
    payoutPct: input.fees.payoutPct,
    warehousePct: input.fees.warehousePct,
    targetMarginPct: input.fees.targetMarginPct,
  })
  const freeShipping =
    input.fees.freeShippingPct > 0
      ? suggestFreeShippingPrice({
          fullCostUnit: input.fullCostUnit,
          commissionPct: input.fees.commissionPct,
          payoutPct: input.fees.payoutPct,
          warehousePct: input.fees.warehousePct,
          targetMarginPct: input.fees.targetMarginPct,
          freeShippingPct: input.fees.freeShippingPct,
          capAmount: input.fees.freeShippingCap,
        })
      : null
  let expectedPayout: number | null = null
  let expectedMarginPct: number | null = null
  if (retail.price != null && retail.price > 0) {
    const varFees =
      (retail.price * (input.fees.commissionPct + input.fees.payoutPct + input.fees.warehousePct)) /
      100
    expectedPayout = round2(retail.price - varFees)
    expectedMarginPct = round2(((retail.price - input.fullCostUnit - varFees) / retail.price) * 100)
  }
  return { retail, freeShipping, expectedPayout, expectedMarginPct }
}

/** 按已填售价回算毛利率（%）。售价无效时返回 null。不把跨币种金额混算。 */
export function marginAtSellPrice(input: {
  fullCostUnit: number
  sellPrice: number
  fees: Pick<PlatformFeePercents, 'commissionPct' | 'payoutPct' | 'warehousePct'>
}): number | null {
  const price = input.sellPrice
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(input.fullCostUnit)) return null
  const varFees =
    (price * (input.fees.commissionPct + input.fees.payoutPct + input.fees.warehousePct)) / 100
  return round2(((price - input.fullCostUnit - varFees) / price) * 100)
}
