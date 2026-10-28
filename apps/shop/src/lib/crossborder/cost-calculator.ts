/**
 * Sri Lanka landed-cost calculator (illustrative mock engine).
 *
 * Numbers and rates are DEMO / 示例 only — not legal advice and not an
 * official customs API. Always mark results 估算·需报关/法务复核.
 *
 * Tax stack (MVP, Excise/Surcharge/SCL off):
 *   Customs → CESS → PAL on CIF (v); then VAT & SSCL on (v + 10%v + d + c + p).
 * See apps/shop/content/design/cost-calculator-sl-landed-ued.md §5–§7.
 */

export const TARIFF_TABLE_VERSION = 'v2026.10-mock'
export const FREIGHT_RATE_VERSION = 'freight-mock-2026.10'
export const FX_RATE_DATE = '2026-10-21'
/** Illustrative USD→LKR; not a live FX feed. */
export const FX_USD_LKR = 300

export type FreightMode = 'AIR_DDP' | 'LCL' | 'FCL20' | 'FCL40'

export type TariffProfileId = 'apparel' | 'electronics' | 'home_sports'

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

/** Example Sri Lanka rate templates — 示例·待复核 */
export const TARIFF_PROFILES: Record<TariffProfileId, TariffRates> = {
  apparel: {
    id: 'apparel',
    labelZh: '服装（示例）',
    hsHint: '6109.10',
    customs: 0.15,
    cess: 0.1,
    pal: 0.1,
    vat: 0.18,
    sscl: 0.025,
    reviewNeeded: true,
  },
  electronics: {
    id: 'electronics',
    labelZh: '3C 电子（示例）',
    hsHint: '8471.80',
    customs: 0.1,
    cess: 0.05,
    pal: 0.1,
    vat: 0.18,
    sscl: 0.025,
    reviewNeeded: true,
  },
  home_sports: {
    id: 'home_sports',
    labelZh: '家居/运动（示例）',
    hsHint: '9506.91',
    customs: 0.12,
    cess: 0.08,
    pal: 0.1,
    vat: 0.18,
    sscl: 0.025,
    reviewNeeded: true,
  },
}

export const FREIGHT_RATES = {
  /** Illustrative DDP quote only; no source quote is connected in this UED. */
  airDdpUsdPerKg: 13,
  airDdpMinChargeUsd: 25,
  airDdpVolumetricDivisor: 6000,
  lclUsdPerCbm: 120,
  lclUsdPerTon: 180,
  lclSurchargeUsd: 35,
  fcl20Usd: 1800,
  fcl40Usd: 2800,
  thcUsd: 120,
  /** Practical usable CBM (示意) */
  fcl20UsableCbm: 28,
  fcl40UsableCbm: 58,
} as const

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
  /** Carrier quote's volumetric divisor; demo value only, not a default rule. */
  airVolumetricDivisor: number
  /** Estimated gross package volume in cm³ for AIR DDP chargeable weight. */
  airQuoteIncludesTax: boolean
  freightMode: FreightMode
  tariffProfileId: TariffProfileId
  clearanceMiscTotal: number
  targetNetMarginPct: number
  platformCommissionPct: number
  paymentFeePct: number
  adsPct: number
  lastMileUnit: number
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
    disclaimerZh: string
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
): number {
  const r = FREIGHT_RATES
  if (mode === 'LCL') {
    const byCbm = cbmTotal * r.lclUsdPerCbm
    const byTon = chargeableTon * r.lclUsdPerTon
    return Math.max(byCbm, byTon) + r.lclSurchargeUsd
  }
  if (mode === 'FCL20') return Math.ceil(cbmTotal / r.fcl20UsableCbm) * (r.fcl20Usd + r.thcUsd)
  return Math.ceil(cbmTotal / r.fcl40UsableCbm) * (r.fcl40Usd + r.thcUsd)
}

/** Demo-only DDP quote calculation. Divisor/rate/minimum must come from a real quote in production. */
export function computeAirDdpFreight(
  actualWeightKg: number,
  volumeCbm: number,
  volumetricDivisor: number,
): { total: number; chargeableWeightKg: number } {
  const divisor = Math.max(1, volumetricDivisor)
  const volumetricWeightKg = (volumeCbm * 1_000_000) / divisor
  const chargeableWeightKg = Math.max(actualWeightKg, volumetricWeightKg)
  const total = Math.max(
    FREIGHT_RATES.airDdpMinChargeUsd,
    chargeableWeightKg * FREIGHT_RATES.airDdpUsdPerKg,
  )
  return { total: round2(total), chargeableWeightKg: round2(chargeableWeightKg) }
}

/**
 * LK tax stack on CIF total (USD). Internally converts to LKR for levy math,
 * then converts tax amounts back to USD at FX_USD_LKR.
 */
export function computeLkTaxStack(
  cifTotalUsd: number,
  rates: TariffRates,
): TaxBreakdown {
  const v = cifTotalUsd * FX_USD_LKR
  const d = v * rates.customs
  const c = v * rates.cess
  const p = v * rates.pal
  const base2 = v + 0.1 * v + d + c + p
  const sscl = base2 * rates.sscl
  const vat = base2 * rates.vat
  const taxTotalLkr = d + c + p + sscl + vat
  const toUsd = (x: number) => round4(x / FX_USD_LKR)
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

export function computeLandedCost(input: CostCalculatorInput): CostCalculatorResult {
  const units = Math.max(1, Math.floor(input.units))
  const upc = Math.max(1, Math.floor(input.unitsPerCarton))
  const cartons = Math.ceil(units / upc)
  const cbmPc = cbmPerCartonCm(input.cartonLcm, input.cartonWcm, input.cartonHcm)
  const cbmTotal = cbmPc * cartons
  const kgTotal = input.kgPerCarton * cartons
  const chargeableTon = kgTotal / 1000

  const oceanFreightTotal = input.freightMode === 'AIR_DDP'
    ? 0
    : computeOceanFreight(input.freightMode, cbmTotal, chargeableTon)
  const airDdp = computeAirDdpFreight(
    kgTotal,
    cbmTotal,
    input.airVolumetricDivisor || FREIGHT_RATES.airDdpVolumetricDivisor,
  )
  const fcl20Containers = Math.max(1, Math.ceil(cbmTotal / FREIGHT_RATES.fcl20UsableCbm))
  const fcl40Containers = Math.max(1, Math.ceil(cbmTotal / FREIGHT_RATES.fcl40UsableCbm))
  const selectedFreightTotal = input.freightMode === 'AIR_DDP' ? airDdp.total : oceanFreightTotal
  const selectedFreightUnit = selectedFreightTotal / units
  const freightIncludesTax = input.freightMode === 'AIR_DDP' && input.airQuoteIncludesTax

  const fobTotal = input.fobUnit * units
  const insurance = input.insuranceTotal
  const firstMileInCif = input.firstMileInCif ? input.firstMileTotal : 0
  const cifTotal = fobTotal + insurance + (input.freightMode === 'AIR_DDP' ? 0 : selectedFreightTotal) + firstMileInCif

  const rates = TARIFF_PROFILES[input.tariffProfileId]
  const tax = freightIncludesTax
    ? computeLkTaxStack(0, rates)
    : computeLkTaxStack(cifTotal, rates)

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
    input.platformCommissionPct,
    input.paymentFeePct,
    input.adsPct,
  )

  let netMarginPct: number | null = null
  let grossMarginOnLandedPct: number | null = null
  if (suggestPrice != null && suggestPrice > 0) {
    const feeVar =
      (suggestPrice *
        (input.platformCommissionPct + input.paymentFeePct + input.adsPct)) /
      100
    const costAtP = landedUnit + input.lastMileUnit + feeVar
    netMarginPct = round2(((suggestPrice - costAtP) / suggestPrice) * 100)
    grossMarginOnLandedPct = round2(
      ((suggestPrice - landedUnit) / suggestPrice) * 100,
    )
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

  const lclOcean = computeOceanFreight('LCL', cbmTotal, chargeableTon)
  const fcl20Ocean = computeOceanFreight('FCL20', cbmTotal, chargeableTon)
  const fcl40Ocean = computeOceanFreight('FCL40', cbmTotal, chargeableTon)
  // DDP quote and sea rates have different included cost boundaries; never auto-pick a winner.
  const preferred: FreightMode | null = null

  // Approx units where FCL20 beats LCL for this SKU's CBM/unit
  const cbmPerUnit = cbmTotal / units
  let fclBetterFromUnitsApprox: number | null = null
  if (cbmPerUnit > 0) {
    const lclPerCbmEffective = FREIGHT_RATES.lclUsdPerCbm
    // Ignore surcharge for rough crossover: n * cbm * lclRate ≈ fcl20+thc
    const n = Math.ceil(
      (FREIGHT_RATES.fcl20Usd + FREIGHT_RATES.thcUsd) /
        (cbmPerUnit * lclPerCbmEffective),
    )
    fclBetterFromUnitsApprox = n
  }

  const noteZh =
    '方案费用范围不同：空运 DDP 示例含税打包，海运示例未含进口税。当前仅比较演示物流报价，不可据此判定完整成本最优方案。'

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
      nonComparableReason: 'DDP 示例报价含税，LCL/FCL 示例报价未含税，且来源/有效期未核实。',
      fcl20Containers,
      fcl40Containers,
      exceedsFcl20: cbmTotal > FREIGHT_RATES.fcl20UsableCbm,
      exceedsFcl40: cbmTotal > FREIGHT_RATES.fcl40UsableCbm,
      fclBetterFromUnitsApprox,
      noteZh,
    },
    meta: {
      tariffTableVersion: TARIFF_TABLE_VERSION,
      freightRateVersion: FREIGHT_RATE_VERSION,
      fxRateDate: FX_RATE_DATE,
      fxUsdLkr: FX_USD_LKR,
      disclaimerZh:
        '估算 · 需报关/法务复核。示例税率与运价，非法务结论，无官方实时税率 API。',
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
        zh: `计税输入为演示口径：FOB + 保险 + 海运分摊；DDP 报价含税开关打开时不重复计入进口税（须以真实报价核实）`,
        en: 'demo_cif = fob_total + insurance + sea_freight; DDP included tax is not added twice',
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
        zh: `税率表 ${TARIFF_TABLE_VERSION} · 运价 ${FREIGHT_RATE_VERSION} · 汇率日 ${FX_RATE_DATE}（1 USD = ${FX_USD_LKR} LKR）· HS 示意 ${rates.hsHint} · DDP ${FREIGHT_RATES.airDdpUsdPerKg} USD/kg 示例，含税范围待核实`,
        en: `tariff ${TARIFF_TABLE_VERSION}; freight ${FREIGHT_RATE_VERSION}; fx ${FX_RATE_DATE}`,
      },
    ],
  }
}
