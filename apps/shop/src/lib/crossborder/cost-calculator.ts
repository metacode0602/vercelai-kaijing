/**
 * Sri Lanka landed-cost calculator（生产路径）。
 *
 * Tax stack (MVP): Customs → CESS → PAL on CIF (v); then VAT & SSCL on (v + 10%v + d + c + p).
 * 正式保存要求：费用模板命中 + 汇率 fx_rates；运价来自 freight_rate_cards 或手工运费总额。
 * 不再使用 TARIFF_PROFILES / FREIGHT_RATES / 写死汇率作为正式成本来源。
 * See apps/shop/content/design/cost-calculator-sl-landed-ued.md §5–§7
 * and apps/shop/content/design/fee-templates-ued.md.
 */

import {
  componentsToTariffRates,
  getPlatformFeePercents,
  TARIFF_PROFILE_META,
  type ResolvedFeeTemplate,
} from '@/lib/crossborder/fee-template-store'

/** @deprecated 仅作公式档案标签；正式路径禁止回退到此表税率 */
export const TARIFF_TABLE_VERSION = 'fee-template'
export const FREIGHT_RATE_VERSION = 'freight-rate-card'

export type FreightMode = 'AIR_DDP' | 'LCL' | 'FCL20' | 'FCL40'

export type TariffProfileId = 'apparel' | 'electronics' | 'home_sports'

export const TARIFF_PROFILE_IDS: TariffProfileId[] = ['apparel', 'electronics', 'home_sports']

export type TariffRates = {
  id: TariffProfileId
  labelZh: string
  hsHint: string
  /** Customs Duty rate on CIF */
  customs: number
  /** EDB CESS on CIF */
  cess: number
  /** PAL on CIF */
  pal: number
  /** VAT on (v + 10%v + d + c + p) */
  vat: number
  /** SSCL on same base as VAT */
  sscl: number
  reviewNeeded: boolean
}

/** 公式档案标签（不含税率；税率只来自已发布费用模板组件）。 */
export const TARIFF_PROFILES: Record<TariffProfileId, TariffRates> = {
  apparel: {
    id: 'apparel',
    labelZh: TARIFF_PROFILE_META.apparel!.labelZh,
    hsHint: TARIFF_PROFILE_META.apparel!.hsHint,
    customs: 0,
    cess: 0,
    pal: 0,
    vat: 0,
    sscl: 0,
    reviewNeeded: true,
  },
  electronics: {
    id: 'electronics',
    labelZh: TARIFF_PROFILE_META.electronics!.labelZh,
    hsHint: TARIFF_PROFILE_META.electronics!.hsHint,
    customs: 0,
    cess: 0,
    pal: 0,
    vat: 0,
    sscl: 0,
    reviewNeeded: true,
  },
  home_sports: {
    id: 'home_sports',
    labelZh: TARIFF_PROFILE_META.home_sports!.labelZh,
    hsHint: TARIFF_PROFILE_META.home_sports!.hsHint,
    customs: 0,
    cess: 0,
    pal: 0,
    vat: 0,
    sscl: 0,
    reviewNeeded: true,
  },
}

export type FreightRateBundle = {
  code: string
  versionLabel: string
  airDdpUsdPerKg: number
  airDdpMinChargeUsd: number
  airDdpVolumetricDivisor: number
  lclUsdPerCbm: number
  lclUsdPerTon: number
  lclSurchargeUsd: number
  fcl20Usd: number
  fcl40Usd: number
  thcUsd: number
  fcl20UsableCbm: number
  fcl40UsableCbm: number
}

/** 无运价卡时仅允许手工运费总额；此默认结构数值为 0，不可当正式运价。 */
export const EMPTY_FREIGHT_RATES: FreightRateBundle = {
  code: '',
  versionLabel: '未配置运价卡',
  airDdpUsdPerKg: 0,
  airDdpMinChargeUsd: 0,
  airDdpVolumetricDivisor: 6000,
  lclUsdPerCbm: 0,
  lclUsdPerTon: 0,
  lclSurchargeUsd: 0,
  fcl20Usd: 0,
  fcl40Usd: 0,
  thcUsd: 0,
  fcl20UsableCbm: 28,
  fcl40UsableCbm: 58,
}

/** @deprecated 已移除硬编码运价；保留别名避免旧 import 崩溃 */
export const FREIGHT_RATES = EMPTY_FREIGHT_RATES

export type CostCalculatorInput = {
  sku: string
  title: string
  /** FOB per unit (USD) */
  fobUnit: number
  units: number
  /** Domestic first-mile total for the batch (USD); default not in CIF */
  firstMileTotal: number
  firstMileInCif: boolean
  /** Insurance total for batch (USD) */
  insuranceTotal: number
  /** Carton outer L×W×H in cm */
  cartonLcm: number
  cartonWcm: number
  cartonHcm: number
  unitsPerCarton: number
  /** Gross kg per carton (optional; used for LCL ton quote) */
  kgPerCarton: number
  /** 承运商报价泡重除数；未配置运价卡时不作为正式规则默认值。 */
  airVolumetricDivisor: number
  /** Estimated gross package volume in cm³ for AIR DDP chargeable weight. */
  airQuoteIncludesTax: boolean
  freightMode: FreightMode
  /** 兼容旧 UED：映射到费用模板 formulaProfile */
  tariffProfileId: TariffProfileId
  /** 平台 / 国家 / 履约（费用模板解析维度） */
  platform: string
  country: string
  fulfillmentPool: string
  /** 空=按 freightMode 推导 */
  fulfillmentLogistics: string
  /** 测算基准日 YYYY-MM-DD */
  asOf: string
  /** 可选：显式进口税模板 code/id */
  importTaxTemplateId?: string
  /** 可选：显式平台费模板 code/id */
  platformFeeTemplateId?: string
  clearanceMiscTotal: number
  targetNetMarginPct: number
  platformCommissionPct: number
  paymentFeePct: number
  adsPct: number
  lastMileUnit: number
  /** 手工运费总额（USD，整批）；有值时覆盖运价卡计算结果 */
  manualFreightTotal?: number | null
  /** 箱规主档 code；空=手工尺寸 */
  cartonSpecCode?: string
  cartonSpecSource?: 'master' | 'manual'
}

export type TaxBreakdown = {
  cifTotalUsd: number
  cifTotalLkr: number
  customs: number
  cess: number
  pal: number
  vat: number
  sscl: number
  taxTotal: number
  vatSsclBase: number
  rates: TariffRates
  feeTemplateVersionId: string | null
  feeTemplateCode: string | null
  feeTemplatePriority: number | null
  resolvedFrom: 'fee_template' | 'missing'
}

export type WaterfallLine = {
  id: string
  labelZh: string
  labelEn: string
  /** Per-unit USD */
  unitUsd: number
  /** Batch total USD */
  totalUsd: number
}

export type CostCalculatorResult = {
  input: CostCalculatorInput
  cartons: number
  cbmPerCarton: number
  cbmTotal: number
  oceanFreightTotal: number
  oceanFreightUnit: number
  chargeableWeightKg: number
  selectedFreightTotal: number
  selectedFreightUnit: number
  freightIncludesTax: boolean
  tax: TaxBreakdown
  waterfall: WaterfallLine[]
  landedUnit: number
  landedTotal: number
  suggestPrice: number | null
  netMarginPct: number | null
  grossMarginOnLandedPct: number | null
  suggestPriceError: string | null
  comparison: {
    airDdpTotal: number
    airDdpUnit: number
    lclOceanTotal: number
    lclOceanUnit: number
    fcl20OceanTotal: number
    fcl20OceanUnit: number
    fcl40OceanTotal: number
    fcl40OceanUnit: number
    preferred: FreightMode | null
    comparable: boolean
    nonComparableReason: string
    fcl20Containers: number
    fcl40Containers: number
    exceedsFcl20: boolean
    exceedsFcl40: boolean
    fclBetterFromUnitsApprox: number | null
    noteZh: string
  }
  meta: {
    tariffTableVersion: string
    freightRateVersion: string
    fxRateDate: string
    fxUsdLkr: number
    fxRateId: string | null
    disclaimerZh: string
    feeTemplateVersionId: string | null
    feeTemplateCode: string | null
    platformFeeTemplateVersionId: string | null
    platformFeeTemplateCode: string | null
    missingImportTaxComponents: string[]
    componentsSnapshot: Array<{ code: string; labelZh: string; rate: number; unit: string }>
    canPublishFormal: boolean
    blockReasons: string[]
    freightSource: 'rate_card' | 'manual' | 'missing'
    cartonSpecSource: 'master' | 'manual'
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

export function cbmPerCartonCm(l: number, w: number, h: number) {
  return (l * w * h) / 1_000_000
}

export function computeOceanFreight(
  mode: FreightMode,
  cbmTotal: number,
  chargeableTon: number,
  rates: FreightRateBundle = EMPTY_FREIGHT_RATES,
): number {
  const r = rates
  if (mode === 'LCL') {
    const byCbm = cbmTotal * r.lclUsdPerCbm
    const byTon = chargeableTon * r.lclUsdPerTon
    return Math.max(byCbm, byTon) + r.lclSurchargeUsd
  }
  if (mode === 'FCL20') {
    const usable = Math.max(0.1, r.fcl20UsableCbm || 28)
    return Math.ceil(cbmTotal / usable) * (r.fcl20Usd + r.thcUsd)
  }
  const usable = Math.max(0.1, r.fcl40UsableCbm || 58)
  return Math.ceil(cbmTotal / usable) * (r.fcl40Usd + r.thcUsd)
}

/** 空运 DDP；费率必须来自运价卡或手工总额。 */
export function computeAirDdpFreight(
  actualWeightKg: number,
  volumeCbm: number,
  volumetricDivisor: number,
  rates: FreightRateBundle = EMPTY_FREIGHT_RATES,
): { total: number; chargeableWeightKg: number } {
  const divisor = Math.max(1, volumetricDivisor || rates.airDdpVolumetricDivisor || 6000)
  const volumetricWeightKg = (volumeCbm * 1_000_000) / divisor
  const chargeableWeightKg = Math.max(actualWeightKg, volumetricWeightKg)
  const total = Math.max(
    rates.airDdpMinChargeUsd,
    chargeableWeightKg * rates.airDdpUsdPerKg,
  )
  return { total: round2(total), chargeableWeightKg: round2(chargeableWeightKg) }
}

/**
 * LK tax stack on CIF total (USD). Internally converts to LKR for levy math,
 * then converts tax amounts back to USD at provided FX.
 */
export function computeLkTaxStack(
  cifTotalUsd: number,
  rates: TariffRates,
  fxUsdLkr: number,
  resolveMeta?: {
    feeTemplateVersionId: string | null
    feeTemplateCode: string | null
    feeTemplatePriority: number | null
    resolvedFrom: 'fee_template' | 'missing'
  },
): TaxBreakdown {
  const fx = fxUsdLkr > 0 ? fxUsdLkr : 0
  const v = cifTotalUsd * fx
  const d = v * rates.customs
  const c = v * rates.cess
  const p = v * rates.pal
  const base2 = v + 0.1 * v + d + c + p
  const sscl = base2 * rates.sscl
  const vat = base2 * rates.vat
  const taxTotalLkr = d + c + p + sscl + vat
  const toUsd = (x: number) => (fx > 0 ? round4(x / fx) : 0)
  return {
    cifTotalUsd: round2(cifTotalUsd),
    cifTotalLkr: round2(v),
    customs: toUsd(d),
    cess: toUsd(c),
    pal: toUsd(p),
    vat: toUsd(vat),
    sscl: toUsd(sscl),
    taxTotal: toUsd(taxTotalLkr),
    vatSsclBase: toUsd(base2),
    rates,
    feeTemplateVersionId: resolveMeta?.feeTemplateVersionId ?? null,
    feeTemplateCode: resolveMeta?.feeTemplateCode ?? null,
    feeTemplatePriority: resolveMeta?.feeTemplatePriority ?? null,
    resolvedFrom: resolveMeta?.resolvedFrom ?? 'missing',
  }
}

/** 服务端 / tRPC resolve 结果注入；主路径读 DB，未注入时不再走 localStorage。 */
export type FeeResolutionOverrides = {
  importTax?: ResolvedFeeTemplate | null
  platformFee?: ResolvedFeeTemplate | null
}

/** 测算运行时上下文：汇率 / 运价卡（生产必填项）。 */
export type CostCalcRuntime = {
  fxUsdLkr?: number | null
  fxRateDate?: string | null
  fxRateId?: string | null
  freightRates?: FreightRateBundle | null
}

/** 按平台+国家+履约+asOf 解析进口税费用模板；未命中则 missing（禁止正式保存）。 */
export function resolveImportTaxRates(
  input: Pick<
    CostCalculatorInput,
    | 'platform'
    | 'country'
    | 'fulfillmentPool'
    | 'fulfillmentLogistics'
    | 'freightMode'
    | 'asOf'
    | 'tariffProfileId'
    | 'importTaxTemplateId'
  >,
  overrides?: FeeResolutionOverrides,
): {
  rates: TariffRates
  resolved: ResolvedFeeTemplate | null
  resolvedFrom: 'fee_template' | 'missing'
  missingComponents: string[]
} {
  const resolved =
    overrides && 'importTax' in overrides ? (overrides.importTax ?? null) : null
  if (resolved) {
    const mapped = componentsToTariffRates(resolved.version, input.tariffProfileId)
    const rates: TariffRates = {
      id: (['apparel', 'electronics', 'home_sports'].includes(mapped.id)
        ? mapped.id
        : input.tariffProfileId) as TariffProfileId,
      labelZh: mapped.labelZh,
      hsHint: mapped.hsHint,
      customs: mapped.customs,
      cess: mapped.cess,
      pal: mapped.pal,
      vat: mapped.vat,
      sscl: mapped.sscl,
      reviewNeeded: mapped.reviewNeeded,
    }
    return { rates, resolved, resolvedFrom: 'fee_template', missingComponents: mapped.missingCodes }
  }
  const profile = TARIFF_PROFILES[input.tariffProfileId]
  return {
    rates: {
      id: profile.id,
      labelZh: profile.labelZh,
      hsHint: profile.hsHint,
      customs: 0,
      cess: 0,
      pal: 0,
      vat: 0,
      sscl: 0,
      reviewNeeded: true,
    },
    resolved: null,
    resolvedFrom: 'missing',
    missingComponents: [],
  }
}

export function suggestSellPrice(
  landedUnit: number,
  lastMileUnit: number,
  targetNetMarginPct: number,
  commissionPct: number,
  paymentPct: number,
  adsPct: number,
): { price: number | null; error: string | null } {
  const m = targetNetMarginPct / 100
  const f = (commissionPct + paymentPct + adsPct) / 100
  const denom = 1 - f - m
  if (denom <= 0.01) {
    return { price: null, error: '目标净利率过高（分母 ≤ 0），请下调目标或费率。' }
  }
  const price = (landedUnit + lastMileUnit) / denom
  return { price: round2(price), error: null }
}

export function computeLandedCost(
  input: CostCalculatorInput,
  overrides?: FeeResolutionOverrides,
  runtime?: CostCalcRuntime,
): CostCalculatorResult {
  const units = Math.max(1, Math.floor(input.units))
  const upc = Math.max(1, Math.floor(input.unitsPerCarton))
  const cartons = Math.ceil(units / upc)
  const cbmPc = cbmPerCartonCm(input.cartonLcm, input.cartonWcm, input.cartonHcm)
  const cbmTotal = cbmPc * cartons
  const kgTotal = input.kgPerCarton * cartons
  const chargeableTon = kgTotal / 1000

  const freightRates = runtime?.freightRates ?? EMPTY_FREIGHT_RATES
  const fxUsdLkr = runtime?.fxUsdLkr && runtime.fxUsdLkr > 0 ? runtime.fxUsdLkr : 0
  const fxRateDate = runtime?.fxRateDate || ''
  const fxRateId = runtime?.fxRateId ?? null

  const hasManualFreight =
    input.manualFreightTotal != null && Number.isFinite(input.manualFreightTotal) && input.manualFreightTotal >= 0
  const hasRateCard = Boolean(freightRates.code) && (
    freightRates.airDdpUsdPerKg > 0 ||
    freightRates.lclUsdPerCbm > 0 ||
    freightRates.fcl20Usd > 0 ||
    freightRates.fcl40Usd > 0
  )

  const oceanFreightTotal =
    input.freightMode === 'AIR_DDP'
      ? 0
      : computeOceanFreight(input.freightMode, cbmTotal, chargeableTon, freightRates)
  const airDdp = computeAirDdpFreight(
    kgTotal,
    cbmTotal,
    input.airVolumetricDivisor || freightRates.airDdpVolumetricDivisor,
    freightRates,
  )
  const fcl20Usable = Math.max(0.1, freightRates.fcl20UsableCbm || 28)
  const fcl40Usable = Math.max(0.1, freightRates.fcl40UsableCbm || 58)
  const fcl20Containers = Math.max(1, Math.ceil(cbmTotal / fcl20Usable))
  const fcl40Containers = Math.max(1, Math.ceil(cbmTotal / fcl40Usable))

  let selectedFreightTotal = input.freightMode === 'AIR_DDP' ? airDdp.total : oceanFreightTotal
  let freightSource: 'rate_card' | 'manual' | 'missing' = hasRateCard ? 'rate_card' : 'missing'
  if (hasManualFreight) {
    selectedFreightTotal = Number(input.manualFreightTotal)
    freightSource = 'manual'
  }
  const selectedFreightUnit = selectedFreightTotal / units
  const freightIncludesTax = input.freightMode === 'AIR_DDP' && input.airQuoteIncludesTax

  const fobTotal = input.fobUnit * units
  const insurance = input.insuranceTotal
  const firstMileInCif = input.firstMileInCif ? input.firstMileTotal : 0
  const cifTotal =
    fobTotal +
    insurance +
    (input.freightMode === 'AIR_DDP' ? 0 : selectedFreightTotal) +
    firstMileInCif

  const { rates, resolved: importResolved, resolvedFrom, missingComponents } = resolveImportTaxRates(
    input,
    overrides,
  )
  const resolveMeta = {
    feeTemplateVersionId: importResolved?.version.id ?? null,
    feeTemplateCode: importResolved?.template.code ?? null,
    feeTemplatePriority: importResolved?.version.priority ?? null,
    resolvedFrom,
  }
  const tax = freightIncludesTax
    ? computeLkTaxStack(0, rates, fxUsdLkr, resolveMeta)
    : computeLkTaxStack(cifTotal, rates, fxUsdLkr, resolveMeta)

  const platformFeeResolved =
    overrides && 'platformFee' in overrides ? (overrides.platformFee ?? null) : null
  const platformFeePercents = getPlatformFeePercents(platformFeeResolved)
  const platformCommissionPct = platformFeeResolved
    ? platformFeePercents.commissionPct
    : input.platformCommissionPct
  const paymentFeePct = platformFeeResolved
    ? platformFeePercents.paymentFeePct
    : input.paymentFeePct

  const landedTotal =
    fobTotal +
    input.firstMileTotal +
    selectedFreightTotal +
    (freightIncludesTax ? 0 : tax.taxTotal) +
    input.clearanceMiscTotal
  const landedUnit = landedTotal / units

  const { price: suggestPrice, error: suggestPriceError } = suggestSellPrice(
    landedUnit,
    input.lastMileUnit,
    input.targetNetMarginPct,
    platformCommissionPct,
    paymentFeePct,
    input.adsPct,
  )

  let netMarginPct: number | null = null
  let grossMarginOnLandedPct: number | null = null
  if (suggestPrice != null && suggestPrice > 0) {
    const feeVar =
      (suggestPrice * (platformCommissionPct + paymentFeePct + input.adsPct)) / 100
    const costAtP = landedUnit + input.lastMileUnit + feeVar
    netMarginPct = round2(((suggestPrice - costAtP) / suggestPrice) * 100)
    grossMarginOnLandedPct = round2(((suggestPrice - landedUnit) / suggestPrice) * 100)
  }

  const waterfall: WaterfallLine[] = [
    {
      id: 'fob',
      labelZh: 'FOB / 采购',
      labelEn: 'fob',
      unitUsd: round4(input.fobUnit),
      totalUsd: round2(fobTotal),
    },
    {
      id: 'first_mile',
      labelZh: '头程（国内段）',
      labelEn: 'first_mile',
      unitUsd: round4(input.firstMileTotal / units),
      totalUsd: round2(input.firstMileTotal),
    },
    {
      id: 'ocean',
      labelZh: `国际物流分摊（${input.freightMode}）`,
      labelEn: 'international_freight_allocated',
      unitUsd: round4(selectedFreightUnit),
      totalUsd: round2(selectedFreightTotal),
    },
    {
      id: 'customs',
      labelZh: 'Customs Duty',
      labelEn: 'customs',
      unitUsd: round4(tax.customs / units),
      totalUsd: round2(tax.customs),
    },
    {
      id: 'pal',
      labelZh: 'PAL',
      labelEn: 'pal',
      unitUsd: round4(tax.pal / units),
      totalUsd: round2(tax.pal),
    },
    {
      id: 'cess',
      labelZh: 'CESS',
      labelEn: 'cess',
      unitUsd: round4(tax.cess / units),
      totalUsd: round2(tax.cess),
    },
    {
      id: 'vat',
      labelZh: 'VAT',
      labelEn: 'vat',
      unitUsd: round4(tax.vat / units),
      totalUsd: round2(tax.vat),
    },
    {
      id: 'sscl',
      labelZh: 'SSCL',
      labelEn: 'sscl',
      unitUsd: round4(tax.sscl / units),
      totalUsd: round2(tax.sscl),
    },
    {
      id: 'misc',
      labelZh: '清关杂费',
      labelEn: 'clearance_misc',
      unitUsd: round4(input.clearanceMiscTotal / units),
      totalUsd: round2(input.clearanceMiscTotal),
    },
  ]

  const lclOcean = computeOceanFreight('LCL', cbmTotal, chargeableTon, freightRates)
  const fcl20Ocean = computeOceanFreight('FCL20', cbmTotal, chargeableTon, freightRates)
  const fcl40Ocean = computeOceanFreight('FCL40', cbmTotal, chargeableTon, freightRates)
  const preferred: FreightMode | null = null

  const cbmPerUnit = cbmTotal / units
  let fclBetterFromUnitsApprox: number | null = null
  if (cbmPerUnit > 0 && freightRates.lclUsdPerCbm > 0) {
    const n = Math.ceil(
      (freightRates.fcl20Usd + freightRates.thcUsd) / (cbmPerUnit * freightRates.lclUsdPerCbm),
    )
    fclBetterFromUnitsApprox = n
  }

  const blockReasons: string[] = []
  if (fxUsdLkr <= 0) blockReasons.push('缺少有效汇率（请在设置/汇率配置维护 USD→LKR）')
  if (resolvedFrom !== 'fee_template') blockReasons.push('未命中进口税费用模板，不可发布正式成本版本')
  if (missingComponents.length > 0) {
    blockReasons.push(`进口税费用模板缺少组件：${missingComponents.join('、')}，不可发布正式成本版本`)
  }
  if (!platformFeeResolved) blockReasons.push('未命中平台费费用模板，不可发布正式成本版本')
  if (freightSource === 'missing') blockReasons.push('缺少运价卡或手工运费总额')
  const canPublishFormal = blockReasons.length === 0

  const noteZh =
    freightSource === 'missing'
      ? '未配置运价卡且未填手工运费；运费为 0，仅供草稿测算。'
      : freightSource === 'manual'
        ? '运费来自手工总额；请核对与承运商报价一致。'
        : `运费来自运价卡 ${freightRates.code}。`

  const cartonSpecSource = input.cartonSpecSource === 'master' ? 'master' : 'manual'

  return {
    input: { ...input, units },
    cartons,
    cbmPerCarton: round4(cbmPc),
    cbmTotal: round4(cbmTotal),
    oceanFreightTotal: round2(selectedFreightTotal),
    oceanFreightUnit: round4(selectedFreightUnit),
    chargeableWeightKg: airDdp.chargeableWeightKg,
    selectedFreightTotal: round2(selectedFreightTotal),
    selectedFreightUnit: round4(selectedFreightUnit),
    freightIncludesTax,
    tax,
    waterfall,
    landedUnit: round4(landedUnit),
    landedTotal: round2(landedTotal),
    suggestPrice,
    netMarginPct,
    grossMarginOnLandedPct,
    suggestPriceError,
    comparison: {
      airDdpTotal: airDdp.total,
      airDdpUnit: round4(airDdp.total / units),
      lclOceanTotal: round2(lclOcean),
      lclOceanUnit: round4(lclOcean / units),
      fcl20OceanTotal: round2(fcl20Ocean),
      fcl20OceanUnit: round4(fcl20Ocean / units),
      fcl40OceanTotal: round2(fcl40Ocean),
      fcl40OceanUnit: round4(fcl40Ocean / units),
      preferred,
      comparable: false,
      nonComparableReason: '空运 DDP 与海运费用范围可能不同，不可自动判定最优方案。',
      fcl20Containers,
      fcl40Containers,
      exceedsFcl20: cbmTotal > fcl20Usable,
      exceedsFcl40: cbmTotal > fcl40Usable,
      fclBetterFromUnitsApprox,
      noteZh,
    },
    meta: {
      tariffTableVersion: importResolved
        ? `${importResolved.template.code}@v${importResolved.version.versionNo}`
        : '未命中费用模板',
      freightRateVersion: freightSource === 'rate_card' ? freightRates.versionLabel : freightSource === 'manual' ? '手工运费' : '未配置运价',
      fxRateDate: fxRateDate || '—',
      fxUsdLkr,
      fxRateId,
      disclaimerZh: canPublishFormal
        ? `正式测算就绪。进口税模板 ${importResolved?.template.code} · 平台费模板 ${platformFeeResolved?.template.code}；汇率 ${fxRateDate}（1 USD = ${fxUsdLkr} LKR）。仍需报关/法务复核。`
        : `不可发布正式成本：${blockReasons.join('；')}`,
      feeTemplateVersionId: importResolved?.version.id ?? null,
      feeTemplateCode: importResolved?.template.code ?? null,
      platformFeeTemplateVersionId: platformFeeResolved?.version.id ?? null,
      platformFeeTemplateCode: platformFeeResolved?.template.code ?? null,
      missingImportTaxComponents: missingComponents,
      componentsSnapshot: (importResolved?.version.components ?? []).map((c) => ({
        code: c.code,
        labelZh: c.labelZh,
        rate: c.rate,
        unit: c.unit,
      })),
      canPublishFormal,
      blockReasons,
      freightSource,
      cartonSpecSource,
    },
  }
}

/** Human-readable formula sheet for the results panel. */
export function getFormulaDocs(rates: TariffRates): {
  titleZh: string
  lines: { zh: string; en: string }[]
} {
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`
  return {
    titleZh: '计算规则与公式',
    lines: [
      {
        zh: `计税输入：FOB + 保险 + 海运分摊；DDP 报价含税开关打开时不重复计入进口税（须以真实报价核实）`,
        en: 'cif = fob_total + insurance + sea_freight; DDP included tax is not added twice',
      },
      {
        zh: `Customs Duty d = v × ${pct(rates.customs)}（税基 CIF）`,
        en: `customs = cif × ${rates.customs}`,
      },
      {
        zh: `CESS c = v × ${pct(rates.cess)}（税基 CIF）`,
        en: `cess = cif × ${rates.cess}`,
      },
      {
        zh: `PAL p = v × ${pct(rates.pal)}（税基 CIF）`,
        en: `pal = cif × ${rates.pal}`,
      },
      {
        zh: `VAT / SSCL 税基 = v + 10%v + d + c + p`,
        en: 'vat_sscl_base = cif + 0.1·cif + customs + cess + pal',
      },
      {
        zh: `VAT t = 税基 × ${pct(rates.vat)}；SSCL = 税基 × ${pct(rates.sscl)}`,
        en: `vat = base × ${rates.vat}; sscl = base × ${rates.sscl}`,
      },
      {
        zh: `经营到仓成本/件 = (FOB + 国际物流 + 未含进口税费 + 清关杂费) / 件数；DDP 含税报价不重复加税`,
        en: 'landed_unit = (fob + freight + non_included_tax + clearance_misc) / units',
      },
      {
        zh: `建议售价 P* = (到仓/件 + 尾程) / (1 − 佣金% − 支付% − 广告% − 目标净利率)`,
        en: 'P* = (landed + last_mile) / (1 − f − m)',
      },
      {
        zh: `税率来自费用模板 · 运价来自运价卡或手工总额 · HS 示意 ${rates.hsHint}`,
        en: `tariff from fee template; freight from rate card or manual total; HS ${rates.hsHint}`,
      },
    ],
  }
}
