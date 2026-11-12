/**
 * 按公式版本计税。LK 级联保持原函数；其他目的国使用关税+消费税+增值税结构。
 * 不把 LK 的默认保险 0.3% 或 PAL/CESS/SSCL 套到其他国家。
 */
import {
  FORMULA_ID_PPN_V1,
  FORMULA_LK_CASCADE_V1,
  FORMULA_LK_UPLIFT_V1,
  FORMULA_MY_SST_V1,
  FORMULA_PH_VAT_V1,
  FORMULA_SG_GST_V1,
  FORMULA_TH_VAT_V1,
  FORMULA_VN_VAT_V1,
  type FormulaId,
  isKnownFormula,
} from './formulas'
import { round4 } from './math'
import {
  computeLkCascadeTaxStack,
  computeLkUpliftTaxStack,
  type CascadeTariffRates,
  type SpecificDutyRule,
  type SpecificDutyUnit,
  type TaxLine,
  type UpliftTaxRates,
} from './tax'

export type GenericTaxRates = {
  insuranceRate?: number | null
  dutyRate?: number | null
  dutySpecificAmount?: number | null
  dutySpecificUnit?: SpecificDutyUnit | null
  dutySpecificRule?: SpecificDutyRule | null
  exciseRate?: number | null
  interiorTaxRate?: number | null
  incomeTaxRate?: number | null
  luxuryTaxRate?: number | null
  vatRate?: number | null
}

export type UnifiedTaxBreakdown = {
  formulaVersion: FormulaId
  purchaseUnit: number
  freightUnit: number
  cifUnit: number
  insuranceUnit: number
  duty: number
  excise: number
  interiorTax: number
  incomeTax: number
  luxuryTax: number
  vat: number
  surcharge: number
  pal: number
  cess: number
  sscl: number
  taxTotal: number
  purchaseFreightDuty: number
  otherTaxes: number
  fullLandedUnit: number
  lines: TaxLine[]
  warnings: string[]
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
  return adValorem + specific
}

function num(v: number | null | undefined): number {
  return v != null && Number.isFinite(v) ? v : 0
}

type DutyVatOptions = {
  formulaVersion: FormulaId
  vatLabel: string
  includeExcise: boolean
  includeInterior: boolean
  includeIncomeTax: boolean
  includeLuxury: boolean
  /** 缺内地税率且有消费税时记缺项，按 0 估算 */
  warnMissingInterior: boolean
}

function computeDutyVatStack(input: {
  purchaseUnit: number
  freightUnit: number
  rates: GenericTaxRates
  pieceGrossKg?: number | null
  options: DutyVatOptions
}): UnifiedTaxBreakdown {
  const warnings: string[] = []
  const purchaseUnit = input.purchaseUnit
  const freightUnit = input.freightUnit
  const cifUnit = purchaseUnit + freightUnit
  const insuranceRate = input.rates.insuranceRate != null && input.rates.insuranceRate > 0 ? input.rates.insuranceRate : 0
  const insuranceUnit = cifUnit * insuranceRate
  const dutyBase = cifUnit + insuranceUnit
  const dutyAdValorem = dutyBase * num(input.rates.dutyRate)
  const dutySpecific = specificAmount(
    input.rates.dutySpecificAmount,
    input.rates.dutySpecificUnit,
    input.pieceGrossKg,
    warnings,
    '关税',
  )
  const duty = combineAdValoremAndSpecific(dutyAdValorem, dutySpecific, input.rates.dutySpecificRule ?? 'sum')
  const exciseBase = dutyBase + duty
  const excise = input.options.includeExcise ? exciseBase * num(input.rates.exciseRate) : 0
  if (input.options.warnMissingInterior && excise > 0 && (input.rates.interiorTaxRate == null || input.rates.interiorTaxRate === undefined)) {
    warnings.push('税则未填写内地税率，内地税按 0 估算')
  }
  const interiorTax = input.options.includeInterior ? excise * num(input.rates.interiorTaxRate) : 0
  const incomeTax = input.options.includeIncomeTax ? exciseBase * num(input.rates.incomeTaxRate) : 0
  const luxuryTax = input.options.includeLuxury ? exciseBase * num(input.rates.luxuryTaxRate) : 0
  const vatBase = dutyBase + duty + excise + interiorTax + luxuryTax
  const vat = vatBase * num(input.rates.vatRate)
  const taxTotal = duty + excise + interiorTax + incomeTax + luxuryTax + vat
  const purchaseFreightDuty = purchaseUnit + freightUnit + duty
  const otherTaxes = insuranceUnit + excise + interiorTax + incomeTax + luxuryTax + vat
  const fullLandedUnit = purchaseFreightDuty + otherTaxes

  const lines: TaxLine[] = [
    { code: 'cif', labelZh: 'CIF（采购+海运）', amount: round4(cifUnit), base: 0, source: '主档/柜次' },
  ]
  if (insuranceUnit > 0) {
    lines.push({
      code: 'insurance',
      labelZh: '保险',
      amount: round4(insuranceUnit),
      base: round4(cifUnit),
      source: '税则保险费率',
    })
  }
  lines.push({ code: 'duty', labelZh: '关税', amount: round4(duty), base: round4(dutyBase), source: '税则' })
  if (input.options.includeExcise && (excise > 0 || num(input.rates.exciseRate) > 0)) {
    lines.push({ code: 'excise', labelZh: '消费税', amount: round4(excise), base: round4(exciseBase), source: '税则' })
  }
  if (input.options.includeInterior && (interiorTax > 0 || num(input.rates.interiorTaxRate) > 0 || warnings.some((w) => w.includes('内地税')))) {
    lines.push({
      code: 'interior',
      labelZh: '内地税',
      amount: round4(interiorTax),
      base: round4(excise),
      source: '税则',
    })
  }
  if (input.options.includeIncomeTax && (incomeTax > 0 || num(input.rates.incomeTaxRate) > 0)) {
    lines.push({
      code: 'income_tax',
      labelZh: '进口所得税 PPh 22',
      amount: round4(incomeTax),
      base: round4(exciseBase),
      source: '税则',
    })
  }
  if (input.options.includeLuxury && (luxuryTax > 0 || num(input.rates.luxuryTaxRate) > 0)) {
    lines.push({
      code: 'luxury',
      labelZh: '奢侈税 PPnBM',
      amount: round4(luxuryTax),
      base: round4(exciseBase),
      source: '税则',
    })
  }
  lines.push({
    code: 'vat',
    labelZh: input.options.vatLabel,
    amount: round4(vat),
    base: round4(vatBase),
    source: '税则',
  })

  return {
    formulaVersion: input.options.formulaVersion,
    purchaseUnit: round4(purchaseUnit),
    freightUnit: round4(freightUnit),
    cifUnit: round4(cifUnit),
    insuranceUnit: round4(insuranceUnit),
    duty: round4(duty),
    excise: round4(excise),
    interiorTax: round4(interiorTax),
    incomeTax: round4(incomeTax),
    luxuryTax: round4(luxuryTax),
    vat: round4(vat),
    surcharge: 0,
    pal: 0,
    cess: 0,
    sscl: 0,
    taxTotal: round4(taxTotal),
    purchaseFreightDuty: round4(purchaseFreightDuty),
    otherTaxes: round4(otherTaxes),
    fullLandedUnit: round4(fullLandedUnit),
    lines,
    warnings,
  }
}

const DUTY_VAT_OPTIONS: Record<
  Exclude<FormulaId, typeof FORMULA_LK_CASCADE_V1 | typeof FORMULA_LK_UPLIFT_V1>,
  Omit<DutyVatOptions, 'formulaVersion'>
> = {
  [FORMULA_MY_SST_V1]: {
    vatLabel: '销售税 SST',
    includeExcise: true,
    includeInterior: false,
    includeIncomeTax: false,
    includeLuxury: false,
    warnMissingInterior: false,
  },
  [FORMULA_SG_GST_V1]: {
    vatLabel: 'GST',
    includeExcise: false,
    includeInterior: false,
    includeIncomeTax: false,
    includeLuxury: false,
    warnMissingInterior: false,
  },
  [FORMULA_TH_VAT_V1]: {
    vatLabel: 'VAT',
    includeExcise: true,
    includeInterior: true,
    includeIncomeTax: false,
    includeLuxury: false,
    warnMissingInterior: true,
  },
  [FORMULA_VN_VAT_V1]: {
    vatLabel: 'VAT',
    includeExcise: true,
    includeInterior: false,
    includeIncomeTax: false,
    includeLuxury: false,
    warnMissingInterior: false,
  },
  [FORMULA_ID_PPN_V1]: {
    vatLabel: '增值税 PPN',
    includeExcise: false,
    includeInterior: false,
    includeIncomeTax: true,
    includeLuxury: true,
    warnMissingInterior: false,
  },
  [FORMULA_PH_VAT_V1]: {
    vatLabel: 'VAT',
    includeExcise: true,
    includeInterior: false,
    includeIncomeTax: false,
    includeLuxury: false,
    warnMissingInterior: false,
  },
}

function fromLkCascade(
  input: Parameters<typeof computeLkCascadeTaxStack>[0],
): UnifiedTaxBreakdown {
  const tax = computeLkCascadeTaxStack(input)
  return {
    formulaVersion: FORMULA_LK_CASCADE_V1,
    purchaseUnit: tax.purchaseUnit,
    freightUnit: tax.freightUnit,
    cifUnit: tax.cifUnit,
    insuranceUnit: tax.insuranceUnit,
    duty: tax.gd,
    excise: tax.excise,
    interiorTax: 0,
    incomeTax: 0,
    luxuryTax: 0,
    vat: tax.vat,
    surcharge: tax.surcharge,
    pal: tax.pal,
    cess: tax.cess,
    sscl: tax.sscl,
    taxTotal: tax.taxTotal,
    purchaseFreightDuty: tax.purchaseFreightDuty,
    otherTaxes: tax.otherTaxes,
    fullLandedUnit: tax.fullLandedUnit,
    lines: tax.lines,
    warnings: tax.warnings,
  }
}

function fromLkUplift(input: { cifTotal: number; rates: UpliftTaxRates; purchaseUnit: number; freightUnit: number }): UnifiedTaxBreakdown {
  const tax = computeLkUpliftTaxStack({ cifTotal: input.cifTotal, rates: input.rates })
  return {
    formulaVersion: FORMULA_LK_UPLIFT_V1,
    purchaseUnit: round4(input.purchaseUnit),
    freightUnit: round4(input.freightUnit),
    cifUnit: tax.cifTotal,
    insuranceUnit: 0,
    duty: tax.customs,
    excise: 0,
    interiorTax: 0,
    incomeTax: 0,
    luxuryTax: 0,
    vat: tax.vat,
    surcharge: 0,
    pal: tax.pal,
    cess: tax.cess,
    sscl: tax.sscl,
    taxTotal: tax.taxTotal,
    purchaseFreightDuty: round4(input.purchaseUnit + input.freightUnit + tax.customs),
    otherTaxes: round4(tax.taxTotal - tax.customs),
    fullLandedUnit: round4(input.cifTotal + tax.taxTotal),
    lines: [
      { code: 'cif', labelZh: 'CIF', amount: tax.cifTotal, base: 0, source: '采购+海运' },
      { code: 'uplift', labelZh: '对照：CIF+10% 上浮税栈', amount: tax.taxTotal, base: tax.vatSsclBase, source: 'lk_uplift_v1' },
    ],
    warnings: [],
  }
}

export type TariffRateRecord = {
  components?: Record<string, unknown> | null
  gdRate?: number | null
  surchargeRate?: number | null
  palRate?: number | null
  cessRate?: number | null
  exciseRate?: number | null
  vatRate?: number | null
  ssclRate?: number | null
  gdSpecificAmount?: number | null
  gdSpecificUnit?: string | null
  gdSpecificRule?: string | null
  cessSpecificAmount?: number | null
  cessSpecificUnit?: string | null
}

function componentNum(components: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!components) return null
  const value = components[key]
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function ratesFromTariffRecord(row: TariffRateRecord): {
  generic: GenericTaxRates
  lkCascade: CascadeTariffRates
  lkUplift: UpliftTaxRates
} {
  const c = row.components ?? null
  const dutyRate = componentNum(c, 'dutyRate') ?? row.gdRate ?? null
  const vatRate = componentNum(c, 'vatRate') ?? componentNum(c, 'sstRate') ?? row.vatRate ?? null
  const exciseRate = componentNum(c, 'exciseRate') ?? row.exciseRate ?? null
  const generic: GenericTaxRates = {
    insuranceRate: componentNum(c, 'insuranceRate'),
    dutyRate,
    dutySpecificAmount: componentNum(c, 'dutySpecificAmount') ?? row.gdSpecificAmount ?? null,
    dutySpecificUnit: ((typeof c?.dutySpecificUnit === 'string' ? c.dutySpecificUnit : null) ||
      row.gdSpecificUnit ||
      null) as SpecificDutyUnit | null,
    dutySpecificRule: ((c?.dutySpecificRule as string | undefined) || row.gdSpecificRule || 'sum') as SpecificDutyRule,
    exciseRate,
    interiorTaxRate: componentNum(c, 'interiorTaxRate'),
    incomeTaxRate: componentNum(c, 'incomeTaxRate'),
    luxuryTaxRate: componentNum(c, 'luxuryTaxRate'),
    vatRate,
  }
  const lkCascade: CascadeTariffRates = {
    gdRate: row.gdRate ?? dutyRate ?? 0,
    surchargeRate: row.surchargeRate ?? componentNum(c, 'surchargeRate') ?? 0,
    palRate: row.palRate ?? componentNum(c, 'palRate') ?? 0,
    cessRate: row.cessRate ?? componentNum(c, 'cessRate') ?? 0,
    exciseRate: row.exciseRate ?? exciseRate ?? 0,
    vatRate: row.vatRate ?? vatRate ?? 0,
    ssclRate: row.ssclRate ?? componentNum(c, 'ssclRate') ?? 0,
    gdSpecificAmount: row.gdSpecificAmount ?? generic.dutySpecificAmount,
    gdSpecificUnit: (row.gdSpecificUnit as SpecificDutyUnit | null) ?? generic.dutySpecificUnit,
    gdSpecificRule: (row.gdSpecificRule as SpecificDutyRule | null) ?? generic.dutySpecificRule,
    cessSpecificAmount: row.cessSpecificAmount,
    cessSpecificUnit: (row.cessSpecificUnit as SpecificDutyUnit | null) ?? null,
    insuranceRate: generic.insuranceRate,
  }
  const lkUplift: UpliftTaxRates = {
    customs: lkCascade.gdRate,
    cess: lkCascade.cessRate,
    pal: lkCascade.palRate,
    vat: lkCascade.vatRate,
    sscl: lkCascade.ssclRate,
  }
  return { generic, lkCascade, lkUplift }
}

export function computeTaxStack(input: {
  formulaVersion: string
  purchaseUnit: number
  freightUnit: number
  pieceGrossKg?: number | null
  rates: TariffRateRecord
}): UnifiedTaxBreakdown | null {
  if (!isKnownFormula(input.formulaVersion)) return null
  const parsed = ratesFromTariffRecord(input.rates)
  if (input.formulaVersion === FORMULA_LK_CASCADE_V1) {
    return fromLkCascade({
      purchaseUnit: input.purchaseUnit,
      freightUnit: input.freightUnit,
      pieceGrossKg: input.pieceGrossKg,
      rates: parsed.lkCascade,
    })
  }
  if (input.formulaVersion === FORMULA_LK_UPLIFT_V1) {
    return fromLkUplift({
      purchaseUnit: input.purchaseUnit,
      freightUnit: input.freightUnit,
      cifTotal: input.purchaseUnit + input.freightUnit,
      rates: parsed.lkUplift,
    })
  }
  const options = DUTY_VAT_OPTIONS[input.formulaVersion]
  return computeDutyVatStack({
    purchaseUnit: input.purchaseUnit,
    freightUnit: input.freightUnit,
    pieceGrossKg: input.pieceGrossKg,
    rates: parsed.generic,
    options: { ...options, formulaVersion: input.formulaVersion },
  })
}
