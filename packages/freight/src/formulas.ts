/**
 * 目的国计税公式注册表。按国家选择公式版本，不把斯里兰卡税栈套到其他站点。
 * 税率本身来自 hs_tariff_versions，这里只定义结构，不写官方税率数字。
 */
export const FORMULA_LK_CASCADE_V1 = 'lk_cascade_v1' as const
export const FORMULA_LK_UPLIFT_V1 = 'lk_uplift_v1' as const
export const FORMULA_MY_SST_V1 = 'my_sst_v1' as const
export const FORMULA_SG_GST_V1 = 'sg_gst_v1' as const
export const FORMULA_TH_VAT_V1 = 'th_vat_v1' as const
export const FORMULA_VN_VAT_V1 = 'vn_vat_v1' as const
export const FORMULA_ID_PPN_V1 = 'id_ppn_v1' as const
export const FORMULA_PH_VAT_V1 = 'ph_vat_v1' as const

export const FORMULA_IDS = [
  FORMULA_LK_CASCADE_V1,
  FORMULA_LK_UPLIFT_V1,
  FORMULA_MY_SST_V1,
  FORMULA_SG_GST_V1,
  FORMULA_TH_VAT_V1,
  FORMULA_VN_VAT_V1,
  FORMULA_ID_PPN_V1,
  FORMULA_PH_VAT_V1,
] as const

export type FormulaId = (typeof FORMULA_IDS)[number]
/** @deprecated 使用 FormulaId；保留别名以免既有引用中断 */
export type FormulaVersion = FormulaId

export type FormulaRateField = {
  key: string
  labelZh: string
  /** 兼容 hs_tariff_versions 已有列；没有列的字段写入 components jsonb */
  column?: string
}

export type FormulaProfileMeta = {
  id: FormulaId
  labelZh: string
  descriptionZh: string
  countries: readonly string[]
  defaultFor?: readonly string[]
  legacy?: boolean
  rateFields: readonly FormulaRateField[]
}

const DUTY: FormulaRateField = { key: 'dutyRate', labelZh: '关税', column: 'gdRate' }
const DUTY_SPECIFIC: FormulaRateField = { key: 'dutySpecificAmount', labelZh: '从量关税', column: 'gdSpecificAmount' }
const EXCISE: FormulaRateField = { key: 'exciseRate', labelZh: '消费税 / 特别消费税', column: 'exciseRate' }
const VAT: FormulaRateField = { key: 'vatRate', labelZh: '增值税 VAT', column: 'vatRate' }
const INSURANCE: FormulaRateField = { key: 'insuranceRate', labelZh: '保险费率（可空）' }

export const FORMULA_PROFILES: Record<FormulaId, FormulaProfileMeta> = {
  [FORMULA_LK_CASCADE_V1]: {
    id: FORMULA_LK_CASCADE_V1,
    labelZh: '斯里兰卡级联税栈（默认）',
    descriptionZh: 'CIF+保险后按 GD → 附加 → PAL → CESS → Excise → VAT → SSCL 级联；默认保险费率 0.3%。',
    countries: ['LK'],
    defaultFor: ['LK'],
    rateFields: [
      { key: 'gdRate', labelZh: '关税 GD', column: 'gdRate' },
      { key: 'surchargeRate', labelZh: '附加', column: 'surchargeRate' },
      { key: 'palRate', labelZh: 'PAL', column: 'palRate' },
      { key: 'cessRate', labelZh: 'CESS', column: 'cessRate' },
      { key: 'exciseRate', labelZh: '消费税 Excise', column: 'exciseRate' },
      { key: 'vatRate', labelZh: 'VAT', column: 'vatRate' },
      { key: 'ssclRate', labelZh: 'SSCL', column: 'ssclRate' },
      { key: 'gdSpecificAmount', labelZh: '从量关税', column: 'gdSpecificAmount' },
      { key: 'cessSpecificAmount', labelZh: '从量 CESS', column: 'cessSpecificAmount' },
      INSURANCE,
    ],
  },
  [FORMULA_LK_UPLIFT_V1]: {
    id: FORMULA_LK_UPLIFT_V1,
    labelZh: '斯里兰卡旧口径对照（含 10% CIF 上浮）',
    descriptionZh: '仅作对照，不是默认定价公式，也不是平台官方报价。',
    countries: ['LK'],
    legacy: true,
    rateFields: [
      { key: 'gdRate', labelZh: '关税', column: 'gdRate' },
      { key: 'cessRate', labelZh: 'CESS', column: 'cessRate' },
      { key: 'palRate', labelZh: 'PAL', column: 'palRate' },
      { key: 'vatRate', labelZh: 'VAT', column: 'vatRate' },
      { key: 'ssclRate', labelZh: 'SSCL', column: 'ssclRate' },
    ],
  },
  [FORMULA_MY_SST_V1]: {
    id: FORMULA_MY_SST_V1,
    labelZh: '马来西亚：关税 + 销售税 SST',
    descriptionZh: '关税在 CIF 上计征，可选消费税，销售税 SST 在（CIF+关税+消费税）上计征。不含斯里兰卡 PAL/CESS/SSCL，也不套用 0.3% 默认保险。税率由组织税则维护，不在此写死。',
    countries: ['MY'],
    defaultFor: ['MY'],
    rateFields: [
      DUTY,
      DUTY_SPECIFIC,
      EXCISE,
      { key: 'vatRate', labelZh: '销售税 SST', column: 'vatRate' },
      INSURANCE,
    ],
  },
  [FORMULA_SG_GST_V1]: {
    id: FORMULA_SG_GST_V1,
    labelZh: '新加坡：关税 + GST',
    descriptionZh: '关税在 CIF 上计征（多数商品可为 0），GST 在（CIF+关税）上计征。税率由组织税则维护。',
    countries: ['SG'],
    defaultFor: ['SG'],
    rateFields: [DUTY, DUTY_SPECIFIC, { key: 'vatRate', labelZh: 'GST', column: 'vatRate' }, INSURANCE],
  },
  [FORMULA_TH_VAT_V1]: {
    id: FORMULA_TH_VAT_V1,
    labelZh: '泰国：关税 + 消费税 + 内地税 + VAT',
    descriptionZh: '关税在 CIF 上计征；消费税在（CIF+关税）上计征；内地税按消费税乘内地税率（须在税则中填写，不在此默认数字）；VAT 在前述税基上计征。',
    countries: ['TH'],
    defaultFor: ['TH'],
    rateFields: [
      DUTY,
      DUTY_SPECIFIC,
      EXCISE,
      { key: 'interiorTaxRate', labelZh: '内地税（以消费税为税基）' },
      { key: 'vatRate', labelZh: 'VAT', column: 'vatRate' },
      INSURANCE,
    ],
  },
  [FORMULA_VN_VAT_V1]: {
    id: FORMULA_VN_VAT_V1,
    labelZh: '越南：进口关税 + 特别消费税 + VAT',
    descriptionZh: '关税在 CIF 上计征；特别消费税在（CIF+关税）上计征；VAT 在（CIF+关税+特别消费税）上计征。税率由组织税则维护。',
    countries: ['VN'],
    defaultFor: ['VN'],
    rateFields: [
      DUTY,
      DUTY_SPECIFIC,
      { key: 'exciseRate', labelZh: '特别消费税 SCT', column: 'exciseRate' },
      { key: 'vatRate', labelZh: 'VAT', column: 'vatRate' },
      INSURANCE,
    ],
  },
  [FORMULA_ID_PPN_V1]: {
    id: FORMULA_ID_PPN_V1,
    labelZh: '印度尼西亚：关税 + PPh 22 + PPnBM + PPN',
    descriptionZh: '关税在 CIF 上计征；PPh 22 与可选奢侈税 PPnBM 在（CIF+关税）上计征（不计入增值税税基）；PPN 在（CIF+关税+PPnBM）上计征。税率由组织税则维护。',
    countries: ['ID'],
    defaultFor: ['ID'],
    rateFields: [
      DUTY,
      DUTY_SPECIFIC,
      { key: 'incomeTaxRate', labelZh: '进口所得税 PPh 22' },
      { key: 'luxuryTaxRate', labelZh: '奢侈税 PPnBM' },
      { key: 'vatRate', labelZh: '增值税 PPN', column: 'vatRate' },
      INSURANCE,
    ],
  },
  [FORMULA_PH_VAT_V1]: {
    id: FORMULA_PH_VAT_V1,
    labelZh: '菲律宾：关税 + 消费税 + VAT',
    descriptionZh: '关税在 CIF 上计征，可选消费税，VAT 在（CIF+关税+消费税）上计征。税率由组织税则维护。',
    countries: ['PH'],
    defaultFor: ['PH'],
    rateFields: [DUTY, DUTY_SPECIFIC, EXCISE, { key: 'vatRate', labelZh: 'VAT', column: 'vatRate' }, INSURANCE],
  },
}

export const COUNTRY_CURRENCY: Record<string, string> = {
  LK: 'LKR',
  MY: 'MYR',
  SG: 'SGD',
  ID: 'IDR',
  TH: 'THB',
  PH: 'PHP',
  VN: 'VND',
  PK: 'PKR',
  BD: 'BDT',
  NP: 'NPR',
  MM: 'MMK',
  CN: 'CNY',
  US: 'USD',
}

export function isKnownFormula(id: string | null | undefined): id is FormulaId {
  return Boolean(id && (FORMULA_IDS as readonly string[]).includes(id))
}

export function getFormulaProfile(id: string | null | undefined): FormulaProfileMeta | null {
  if (!isKnownFormula(id)) return null
  return FORMULA_PROFILES[id]
}

export function formulasForCountry(country: string): FormulaProfileMeta[] {
  const code = country.trim().toUpperCase()
  return FORMULA_IDS.map((id) => FORMULA_PROFILES[id]).filter((p) => p.countries.includes(code))
}

export function defaultFormulaForCountry(country: string): FormulaId | null {
  const code = country.trim().toUpperCase()
  const found = FORMULA_IDS.map((id) => FORMULA_PROFILES[id]).find((p) => p.defaultFor?.includes(code))
  return found?.id ?? null
}

export function isFormulaAllowedForCountry(formula: string, country: string): boolean {
  const profile = getFormulaProfile(formula)
  if (!profile) return false
  return profile.countries.includes(country.trim().toUpperCase())
}

export function resolveFormulaForCountry(input: {
  country: string
  requested?: string | null
}): {
  formula: FormulaId | null
  usedFallback: boolean
  rejectedRequested: boolean
  reasonZh: string | null
} {
  const country = input.country.trim().toUpperCase()
  const requested = input.requested?.trim() || null
  const defaultFormula = defaultFormulaForCountry(country)
  if (requested) {
    if (isFormulaAllowedForCountry(requested, country)) {
      return { formula: requested as FormulaId, usedFallback: false, rejectedRequested: false, reasonZh: null }
    }
    if (defaultFormula) {
      return {
        formula: defaultFormula,
        usedFallback: true,
        rejectedRequested: true,
        reasonZh: `公式 ${requested} 不适用于目的国 ${country}，已改用该国默认公式 ${defaultFormula}，不会套用其他国家的税栈。`,
      }
    }
    return {
      formula: null,
      usedFallback: false,
      rejectedRequested: true,
      reasonZh: `公式 ${requested} 不适用于目的国 ${country}，且该国尚无默认计税公式，税金按 0 估算，不会套用斯里兰卡税栈。`,
    }
  }
  if (defaultFormula) {
    return { formula: defaultFormula, usedFallback: false, rejectedRequested: false, reasonZh: null }
  }
  return {
    formula: null,
    usedFallback: false,
    rejectedRequested: false,
    reasonZh: `尚未为目的国 ${country} 配置计税公式，税金按 0 估算，不会套用斯里兰卡税栈。`,
  }
}

export function currencyForCountry(country: string): string {
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? 'USD'
}
