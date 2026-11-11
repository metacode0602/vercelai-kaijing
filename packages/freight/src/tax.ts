import { round2, round4 } from './math'

export const FORMULA_LK_CASCADE_V1 = 'lk_cascade_v1'
export const FORMULA_LK_UPLIFT_V1 = 'lk_uplift_v1'

export type FormulaVersion = typeof FORMULA_LK_CASCADE_V1 | typeof FORMULA_LK_UPLIFT_V1

export type SpecificDutyUnit = 'kg' | 'unit'
export type SpecificDutyRule = 'none' | 'max' | 'sum'

export type CascadeTariffRates = {
  gdRate: number
  surchargeRate: number
  palRate: number
  cessRate: number
  exciseRate: number
  vatRate: number
  ssclRate: number
  gdSpecificAmount?: number | null
  gdSpecificUnit?: SpecificDutyUnit | null
  gdSpecificRule?: SpecificDutyRule | null
  cessSpecificAmount?: number | null
  cessSpecificUnit?: SpecificDutyUnit | null
  /** 保险费率，默认 0.003（CIF × 0.3%） */
  insuranceRate?: number | null
}

export type TaxLine = {
  code: string
  labelZh: string
  amount: number
  base: number
  source: string
}

export type CascadeTaxBreakdown = {
  formulaVersion: typeof FORMULA_LK_CASCADE_V1
  purchaseUnit: number
  freightUnit: number
  cifUnit: number
  insuranceUnit: number
  insuranceRate: number
  base: number
  gd: number
  surcharge: number
  pal: number
  cessAdValorem: number
  cessSpecific: number
  cess: number
  excise: number
  vat: number
  sscl: number
  taxTotal: number
  /** 讲解稿中间值：采购 + 海运 + GD */
  purchaseFreightDuty: number
  /** 其他税费：保险 + 附加 + PAL + CESS + Excise + VAT + SSCL */
  otherTaxes: number
  /** 含全部进口税费的定价基数（经营到仓） */
  fullLandedUnit: number
  lines: TaxLine[]
  warnings: string[]
}

export type UpliftTaxRates = {
  customs: number
  cess: number
  pal: number
  vat: number
  sscl: number
}

export type UpliftTaxBreakdown = {
  formulaVersion: typeof FORMULA_LK_UPLIFT_V1
  cifTotal: number
  customs: number
  cess: number
  pal: number
  vat: number
  sscl: number
  taxTotal: number
  vatSsclBase: number
  /** 10% CIF uplift 已计入 VAT/SSCL 税基，仅作对照 */
  upliftApplied: true
}

function specificAmount(
  amount: number | null | undefined,
  unit: SpecificDutyUnit | null | undefined,
  pieceGrossKg: number | null | undefined,
  warnings: string[],
  label: string,
): number | null {
  if (amount == null || !(amount > 0)) return 0
  if (unit === 'unit' || !unit) return amount
  if (pieceGrossKg == null || !(pieceGrossKg > 0)) {
    warnings.push(`缺毛重，无法计算${label}从量税`)
    return null
  }
  return amount * pieceGrossKg
}

function combineAdValoremAndSpecific(
  adValorem: number,
  specific: number | null,
  rule: SpecificDutyRule | null | undefined,
): number {
  if (specific == null) return adValorem
  if (rule === 'max') return Math.max(adValorem, specific)
  if (rule === 'sum') return adValorem + specific
  // none / 缺省：有从量则相加（CESS 讲解稿为从价 + 从量）
  return adValorem + specific
}

/**
 * 斯里兰卡级联税栈（无 10% CIF uplift；SSCL 税基含 VAT）。
 * 金额与采购/海运同一币种（通常为 CNY）；从量若以 LKR 计价，须先折成该币种再传入。
 */
export function computeLkCascadeTaxStack(input: {
  purchaseUnit: number
  freightUnit: number
  rates: CascadeTariffRates
  pieceGrossKg?: number | null
}): CascadeTaxBreakdown {
  const warnings: string[] = []
  const purchaseUnit = input.purchaseUnit
  const freightUnit = input.freightUnit
  const cifUnit = purchaseUnit + freightUnit
  const insuranceRate =
    input.rates.insuranceRate != null && input.rates.insuranceRate >= 0
      ? input.rates.insuranceRate
      : 0.003
  const insuranceUnit = cifUnit * insuranceRate
  const base = cifUnit + insuranceUnit

  const gdAdValorem = base * (input.rates.gdRate || 0)
  const gdSpecific = specificAmount(
    input.rates.gdSpecificAmount,
    input.rates.gdSpecificUnit,
    input.pieceGrossKg,
    warnings,
    '关税',
  )
  const gd = combineAdValoremAndSpecific(gdAdValorem, gdSpecific, input.rates.gdSpecificRule ?? 'max')
  const surcharge = gd * (input.rates.surchargeRate || 0)
  const pal = base * (input.rates.palRate || 0)
  const cessAdValorem = base * (input.rates.cessRate || 0)
  const cessSpecific = specificAmount(
    input.rates.cessSpecificAmount,
    input.rates.cessSpecificUnit,
    input.pieceGrossKg,
    warnings,
    'CESS',
  )
  const cess = combineAdValoremAndSpecific(cessAdValorem, cessSpecific, 'sum')
  const exciseBase = base + gd + surcharge + pal + cess
  const excise = exciseBase * (input.rates.exciseRate || 0)
  const vatBase = exciseBase + excise
  const vat = vatBase * (input.rates.vatRate || 0)
  const sscl = (vatBase + vat) * (input.rates.ssclRate || 0)
  const taxTotal = gd + surcharge + pal + cess + excise + vat + sscl
  const purchaseFreightDuty = purchaseUnit + freightUnit + gd
  const otherTaxes = insuranceUnit + surcharge + pal + cess + excise + vat + sscl
  const fullLandedUnit = purchaseFreightDuty + otherTaxes

  const lines: TaxLine[] = [
    { code: 'cif', labelZh: 'CIF（采购+海运）', amount: round4(cifUnit), base: 0, source: '主档/柜次' },
    { code: 'insurance', labelZh: '保险', amount: round4(insuranceUnit), base: round4(cifUnit), source: '保险费率' },
    { code: 'base', labelZh: '计税基数', amount: round4(base), base: 0, source: 'CIF+保险' },
    { code: 'gd', labelZh: '关税 GD', amount: round4(gd), base: round4(base), source: '税则' },
    { code: 'surcharge', labelZh: '附加', amount: round4(surcharge), base: round4(gd), source: '税则' },
    { code: 'pal', labelZh: 'PAL', amount: round4(pal), base: round4(base), source: '税则' },
    { code: 'cess', labelZh: 'CESS', amount: round4(cess), base: round4(base), source: '税则' },
    { code: 'excise', labelZh: '消费税 Excise', amount: round4(excise), base: round4(exciseBase), source: '税则' },
    { code: 'vat', labelZh: 'VAT', amount: round4(vat), base: round4(vatBase), source: '税则' },
    { code: 'sscl', labelZh: 'SSCL（含 VAT）', amount: round4(sscl), base: round4(vatBase + vat), source: '税则' },
  ]

  return {
    formulaVersion: FORMULA_LK_CASCADE_V1,
    purchaseUnit: round4(purchaseUnit),
    freightUnit: round4(freightUnit),
    cifUnit: round4(cifUnit),
    insuranceUnit: round4(insuranceUnit),
    insuranceRate,
    base: round4(base),
    gd: round4(gd),
    surcharge: round4(surcharge),
    pal: round4(pal),
    cessAdValorem: round4(cessAdValorem),
    cessSpecific: round4(cessSpecific ?? 0),
    cess: round4(cess),
    excise: round4(excise),
    vat: round4(vat),
    sscl: round4(sscl),
    taxTotal: round4(taxTotal),
    purchaseFreightDuty: round4(purchaseFreightDuty),
    otherTaxes: round4(otherTaxes),
    fullLandedUnit: round4(fullLandedUnit),
    lines,
    warnings,
  }
}

/**
 * 旧口径对照：Customs/CESS/PAL 在 CIF 上平行计算；VAT 与 SSCL 同一税基（CIF+10%v+d+c+p），SSCL 不含 VAT。
 * 仅作对照，默认不用此版本定价。
 */
export function computeLkUpliftTaxStack(input: {
  cifTotal: number
  rates: UpliftTaxRates
}): UpliftTaxBreakdown {
  const v = input.cifTotal
  const d = v * (input.rates.customs || 0)
  const c = v * (input.rates.cess || 0)
  const p = v * (input.rates.pal || 0)
  const base2 = v + 0.1 * v + d + c + p
  const sscl = base2 * (input.rates.sscl || 0)
  const vat = base2 * (input.rates.vat || 0)
  const taxTotal = d + c + p + sscl + vat
  return {
    formulaVersion: FORMULA_LK_UPLIFT_V1,
    cifTotal: round2(v),
    customs: round4(d),
    cess: round4(c),
    pal: round4(p),
    vat: round4(vat),
    sscl: round4(sscl),
    taxTotal: round4(taxTotal),
    vatSsclBase: round4(base2),
    upliftApplied: true,
  }
}
