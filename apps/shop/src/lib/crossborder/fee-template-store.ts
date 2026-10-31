'use client'

/**
 * 费用模板（进口税 / 平台费）localStorage UED。
 * 解析：同维度下取 priority 最高且在有效期内、已发布的版本；允许区间重叠。
 * @see apps/shop/content/design/fee-templates-ued.md
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export type FeeTemplateType = 'import_tax' | 'platform_fee'
export type FeeTemplateStatus = '启用' | '停用' | '草稿'

export type FeeComponent = {
  code: string
  labelZh: string
  /** 比例（0–1）或固定金额，由 unit 决定 */
  rate: number
  unit: 'pct' | 'usd'
  baseHint?: string
  note?: string
}

export type FeeTemplate = {
  id: string
  code: string
  name: string
  platform: string
  country: string
  /** 业务履约池，如 daraz_lk_sea_lot / lazada_cn_spot_xmn */
  fulfillmentPool: string
  /** 物流形态，如 FCL / LCL / AIR_DDP；空=不限 */
  fulfillmentLogistics: string
  type: FeeTemplateType
  status: FeeTemplateStatus
  note: string
  updatedAt: string
}

export type FeeTemplateVersion = {
  id: string
  templateId: string
  versionNo: number
  effectiveFrom: string
  /** 空=长期有效 */
  effectiveTo: string
  /** 同维度重叠时人工优先级，数值越大越优先 */
  priority: number
  formulaProfile: string
  components: FeeComponent[]
  published: boolean
  reviewNeeded: boolean
  note: string
  createdAt: string
}

export type FeeTemplateStoreState = {
  templates: FeeTemplate[]
  versions: FeeTemplateVersion[]
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

/** 自原 TARIFF_PROFILES 迁出的 LK 税率初值（待报关行复核）。 */
const LK_SEED_RATES: Record<string, { customs: number; cess: number; pal: number; vat: number; sscl: number; hsHint: string; labelZh: string }> = {
  apparel: { customs: 0.15, cess: 0.1, pal: 0.1, vat: 0.18, sscl: 0.025, hsHint: '6109.10', labelZh: '服装（示例）' },
  electronics: { customs: 0.1, cess: 0.05, pal: 0.1, vat: 0.18, sscl: 0.025, hsHint: '8471.80', labelZh: '3C 电子（示例）' },
  home_sports: { customs: 0.12, cess: 0.08, pal: 0.1, vat: 0.18, sscl: 0.025, hsHint: '9506.91', labelZh: '家居/运动（示例）' },
}

function ratesToComponents(profile: keyof typeof LK_SEED_RATES): FeeComponent[] {
  const rates = LK_SEED_RATES[profile]
  return [
    { code: 'customs', labelZh: 'Customs Duty', rate: rates.customs, unit: 'pct', baseHint: 'CIF', note: '税基 CIF' },
    { code: 'cess', labelZh: 'CESS', rate: rates.cess, unit: 'pct', baseHint: 'CIF', note: 'EDB CESS' },
    { code: 'pal', labelZh: 'PAL', rate: rates.pal, unit: 'pct', baseHint: 'CIF', note: 'PAL on CIF' },
    { code: 'vat', labelZh: 'VAT', rate: rates.vat, unit: 'pct', baseHint: 'v+10%v+d+c+p', note: '叠税基' },
    { code: 'sscl', labelZh: 'SSCL', rate: rates.sscl, unit: 'pct', baseHint: 'v+10%v+d+c+p', note: '叠税基' },
  ]
}

const SEED_TEMPLATES: FeeTemplate[] = [
  {
    id: 'FT-DARAZ-LK-IMPORT-APPAREL',
    code: 'daraz_lk_import_apparel',
    name: 'Daraz LK 进口税 · 服装',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: '启用',
    note: '自 TARIFF_PROFILES.apparel 迁出 · 待报关行复核',
    updatedAt: '2026-10-21',
  },
  {
    id: 'FT-DARAZ-LK-IMPORT-ELECTRONICS',
    code: 'daraz_lk_import_electronics',
    name: 'Daraz LK 进口税 · 3C 电子',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: '启用',
    note: '自 TARIFF_PROFILES.electronics 迁出 · 待报关行复核',
    updatedAt: '2026-10-21',
  },
  {
    id: 'FT-DARAZ-LK-IMPORT-HOME',
    code: 'daraz_lk_import_home_sports',
    name: 'Daraz LK 进口税 · 家居/运动',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: '启用',
    note: '自 TARIFF_PROFILES.home_sports 迁出 · 待报关行复核',
    updatedAt: '2026-10-21',
  },
  {
    id: 'FT-LAZADA-MY-IMPORT',
    code: 'lazada_my_import_tax',
    name: 'Lazada MY 进口税（占位）',
    platform: 'lazada',
    country: 'MY',
    fulfillmentPool: 'lazada_cn_spot_xmn',
    fulfillmentLogistics: '',
    type: 'import_tax',
    status: '草稿',
    note: '首期国别占位税率 · 待报关行复核',
    updatedAt: '2026-10-31',
  },
  {
    id: 'FT-DARAZ-LK-PLATFORM-FEE',
    code: 'daraz_lk_platform_fee',
    name: 'Daraz LK 平台费（佣金/支付）',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type: 'platform_fee',
    status: '启用',
    note: '佣金与支付费占位，测算时可与进口税组合引用',
    updatedAt: '2026-10-31',
  },
  {
    id: 'FT-LAZADA-MY-PLATFORM-FEE',
    code: 'lazada_my_platform_fee',
    name: 'Lazada MY 平台费（佣金/支付）',
    platform: 'lazada',
    country: 'MY',
    fulfillmentPool: 'lazada_cn_spot_xmn',
    fulfillmentLogistics: '',
    type: 'platform_fee',
    status: '启用',
    note: '佣金与支付费占位',
    updatedAt: '2026-10-31',
  },
]

const SEED_VERSIONS: FeeTemplateVersion[] = [
  {
    id: 'FTV-DARAZ-LK-APPAREL-V1',
    templateId: 'FT-DARAZ-LK-IMPORT-APPAREL',
    versionNo: 1,
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    priority: 10,
    formulaProfile: 'apparel',
    components: ratesToComponents('apparel'),
    published: true,
    reviewNeeded: true,
    note: '示例 · 待报关行复核 · HS 示意 6109.10',
    createdAt: '2026-10-21',
  },
  {
    id: 'FTV-DARAZ-LK-ELEC-V1',
    templateId: 'FT-DARAZ-LK-IMPORT-ELECTRONICS',
    versionNo: 1,
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    priority: 10,
    formulaProfile: 'electronics',
    components: ratesToComponents('electronics'),
    published: true,
    reviewNeeded: true,
    note: '示例 · 待报关行复核 · HS 示意 8471.80',
    createdAt: '2026-10-21',
  },
  {
    id: 'FTV-DARAZ-LK-HOME-V1',
    templateId: 'FT-DARAZ-LK-IMPORT-HOME',
    versionNo: 1,
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    priority: 10,
    formulaProfile: 'home_sports',
    components: ratesToComponents('home_sports'),
    published: true,
    reviewNeeded: true,
    note: '示例 · 待报关行复核 · HS 示意 9506.91',
    createdAt: '2026-10-21',
  },
  {
    id: 'FTV-LAZADA-MY-IMPORT-V1',
    templateId: 'FT-LAZADA-MY-IMPORT',
    versionNo: 1,
    effectiveFrom: '2026-10-01',
    effectiveTo: '',
    priority: 5,
    formulaProfile: 'lazada_my_placeholder',
    components: [
      { code: 'import_duty', labelZh: '进口关税（占位）', rate: 0.05, unit: 'pct', baseHint: 'CIF', note: '待复核' },
      { code: 'sst', labelZh: 'SST（占位）', rate: 0.1, unit: 'pct', baseHint: 'CIF+duty', note: '待复核' },
    ],
    published: true,
    reviewNeeded: true,
    note: 'Lazada 首期进口税叠占位 · 待报关行复核',
    createdAt: '2026-10-31',
  },
  {
    id: 'FTV-DARAZ-LK-PFEE-V1',
    templateId: 'FT-DARAZ-LK-PLATFORM-FEE',
    versionNo: 1,
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    priority: 10,
    formulaProfile: 'platform_fee_v1',
    components: [
      { code: 'commission', labelZh: '平台佣金', rate: 0.08, unit: 'pct', baseHint: '售价', note: '占位' },
      { code: 'payment_fee', labelZh: '支付手续费', rate: 0.02, unit: 'pct', baseHint: '售价', note: '占位' },
    ],
    published: true,
    reviewNeeded: false,
    note: '佣金/支付费示例',
    createdAt: '2026-10-31',
  },
  {
    id: 'FTV-LAZADA-MY-PFEE-V1',
    templateId: 'FT-LAZADA-MY-PLATFORM-FEE',
    versionNo: 1,
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    priority: 10,
    formulaProfile: 'platform_fee_v1',
    components: [
      { code: 'commission', labelZh: '平台佣金', rate: 0.06, unit: 'pct', baseHint: '售价', note: '占位' },
      { code: 'payment_fee', labelZh: '支付手续费', rate: 0.025, unit: 'pct', baseHint: '售价', note: '占位' },
    ],
    published: true,
    reviewNeeded: false,
    note: '佣金/支付费示例',
    createdAt: '2026-10-31',
  },
]

const SEED: FeeTemplateStoreState = {
  templates: SEED_TEMPLATES,
  versions: SEED_VERSIONS,
}

const store = createDemoStore<FeeTemplateStoreState>(
  'open-shop.console.demo.fee-templates.v1',
  SEED,
)

export function useFeeTemplateStore() {
  return store.useStore()
}

export function getFeeTemplateStore() {
  return store.get()
}

export function listFeeTemplates(filters?: {
  platform?: string
  country?: string
  fulfillmentPool?: string
  type?: FeeTemplateType | ''
  status?: FeeTemplateStatus | ''
}) {
  const { templates } = store.get()
  return templates.filter((row) => {
    if (filters?.platform && filters.platform !== '全部' && row.platform !== filters.platform) return false
    if (filters?.country && filters.country !== '全部' && row.country !== filters.country) return false
    if (filters?.fulfillmentPool && filters.fulfillmentPool !== '全部' && row.fulfillmentPool !== filters.fulfillmentPool)
      return false
    if (filters?.type && filters.type !== ('' as FeeTemplateType) && row.type !== filters.type) return false
    if (filters?.status && filters.status !== ('' as FeeTemplateStatus) && row.status !== filters.status) return false
    return true
  })
}

export function getFeeTemplate(id: string) {
  return store.get().templates.find((row) => row.id === id || row.code === id)
}

export function listFeeTemplateVersions(templateId: string) {
  return store
    .get()
    .versions.filter((row) => row.templateId === templateId)
    .sort((a, b) => b.versionNo - a.versionNo || b.priority - a.priority)
}

export function upsertFeeTemplate(row: FeeTemplate) {
  const state = store.get()
  const exists = state.templates.some((item) => item.id === row.id)
  store.set({
    ...state,
    templates: exists
      ? state.templates.map((item) => (item.id === row.id ? { ...row, updatedAt: today() } : item))
      : [{ ...row, updatedAt: today() }, ...state.templates],
  })
}

export function addFeeTemplate(input: Omit<FeeTemplate, 'id' | 'updatedAt'> & { id?: string }) {
  const id = input.id ?? `FT-${Date.now()}`
  upsertFeeTemplate({ ...input, id, updatedAt: today() })
  return id
}

export function upsertFeeTemplateVersion(row: FeeTemplateVersion) {
  const state = store.get()
  const exists = state.versions.some((item) => item.id === row.id)
  store.set({
    ...state,
    versions: exists
      ? state.versions.map((item) => (item.id === row.id ? row : item))
      : [row, ...state.versions],
  })
}

export function createFeeTemplateVersionDraft(templateId: string, base?: FeeTemplateVersion) {
  const existing = listFeeTemplateVersions(templateId)
  const versionNo = existing.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1
  const row: FeeTemplateVersion = {
    id: `FTV-${templateId}-V${versionNo}-${Date.now().toString(36)}`,
    templateId,
    versionNo,
    effectiveFrom: today(),
    effectiveTo: '',
    priority: base?.priority ?? 10,
    formulaProfile: base?.formulaProfile ?? 'custom',
    components: base ? base.components.map((c) => ({ ...c })) : [],
    published: false,
    reviewNeeded: true,
    note: '草稿版本',
    createdAt: today(),
  }
  upsertFeeTemplateVersion(row)
  return row
}

export function publishFeeTemplateVersion(versionId: string) {
  const state = store.get()
  const version = state.versions.find((row) => row.id === versionId)
  if (!version) return null
  const next = { ...version, published: true }
  upsertFeeTemplateVersion(next)
  return next
}

export function updateFeeTemplateVersion(
  versionId: string,
  patch: Partial<Omit<FeeTemplateVersion, 'id' | 'templateId'>>,
) {
  const state = store.get()
  const version = state.versions.find((row) => row.id === versionId)
  if (!version) return null
  const next = { ...version, ...patch }
  upsertFeeTemplateVersion(next)
  return next
}

export type ResolveFeeTemplateArgs = {
  platform: string
  country: string
  fulfillmentPool?: string
  fulfillmentLogistics?: string
  type: FeeTemplateType
  asOf?: string
  /** 可选：匹配版本 formulaProfile（如 apparel） */
  formulaProfile?: string
  /** 可选：直接指定模板 code / id */
  templateCodeOrId?: string
}

export type ResolvedFeeTemplate = {
  template: FeeTemplate
  version: FeeTemplateVersion
}

function inEffectiveRange(version: FeeTemplateVersion, asOf: string) {
  if (version.effectiveFrom && asOf < version.effectiveFrom) return false
  if (version.effectiveTo && asOf > version.effectiveTo) return false
  return true
}

function logisticsMatch(templateLogistics: string, wanted?: string) {
  if (!templateLogistics) return true
  if (!wanted) return true
  return templateLogistics.toUpperCase() === wanted.toUpperCase()
}

/**
 * C1-C：允许区间重叠；取同维度下 priority 最高且在有效期内、已发布的版本。
 */
export function resolveFeeTemplateVersion(args: ResolveFeeTemplateArgs): ResolvedFeeTemplate | null {
  const asOf = args.asOf ?? today()
  const state = store.get()
  let templates = state.templates.filter(
    (row) =>
      row.type === args.type &&
      row.platform.toLowerCase() === args.platform.toLowerCase() &&
      row.country.toUpperCase() === args.country.toUpperCase() &&
      row.status !== '停用',
  )
  if (args.templateCodeOrId) {
    templates = templates.filter(
      (row) => row.id === args.templateCodeOrId || row.code === args.templateCodeOrId,
    )
  }
  if (args.fulfillmentPool) {
    templates = templates.filter(
      (row) => !row.fulfillmentPool || row.fulfillmentPool === args.fulfillmentPool,
    )
  }
  templates = templates.filter((row) => logisticsMatch(row.fulfillmentLogistics, args.fulfillmentLogistics))

  const candidates: ResolvedFeeTemplate[] = []
  for (const template of templates) {
    for (const version of state.versions) {
      if (version.templateId !== template.id) continue
      if (!version.published) continue
      if (!inEffectiveRange(version, asOf)) continue
      if (args.formulaProfile && version.formulaProfile !== args.formulaProfile) continue
      candidates.push({ template, version })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (b.version.priority !== a.version.priority) return b.version.priority - a.version.priority
    return b.version.versionNo - a.version.versionNo
  })
  return candidates[0] ?? null
}

export type FeeResolvedTariffRates = {
  id: string
  labelZh: string
  hsHint: string
  customs: number
  cess: number
  pal: number
  vat: number
  sscl: number
  reviewNeeded: boolean
}

export function componentsToTariffRates(
  version: FeeTemplateVersion,
  fallbackId: keyof typeof LK_SEED_RATES = 'apparel',
): FeeResolvedTariffRates {
  const byCode = Object.fromEntries(version.components.map((c) => [c.code, c]))
  const pct = (code: string, fallback: number) => {
    const c = byCode[code]
    if (!c) return fallback
    return c.unit === 'pct' ? c.rate : fallback
  }
  const base = LK_SEED_RATES[fallbackId] ?? LK_SEED_RATES.apparel
  const profileId = version.formulaProfile in LK_SEED_RATES ? version.formulaProfile : fallbackId
  const profileBase = LK_SEED_RATES[profileId as keyof typeof LK_SEED_RATES] ?? base
  return {
    id: profileId,
    labelZh: profileBase.labelZh,
    hsHint: profileBase.hsHint,
    customs: pct('customs', pct('import_duty', profileBase.customs)),
    cess: pct('cess', profileBase.cess),
    pal: pct('pal', profileBase.pal),
    vat: pct('vat', pct('sst', profileBase.vat)),
    sscl: pct('sscl', profileBase.sscl),
    reviewNeeded: version.reviewNeeded,
  }
}

export function getPlatformFeePercents(resolved: ResolvedFeeTemplate | null): {
  commissionPct: number
  paymentFeePct: number
} {
  if (!resolved) return { commissionPct: 8, paymentFeePct: 2 }
  const byCode = Object.fromEntries(resolved.version.components.map((c) => [c.code, c]))
  const toPct = (c?: FeeComponent) => (c ? (c.unit === 'pct' ? c.rate * 100 : c.rate) : 0)
  return {
    commissionPct: toPct(byCode.commission) || 8,
    paymentFeePct: toPct(byCode.payment_fee) || 2,
  }
}

export const FEE_TEMPLATE_TYPE_LABEL: Record<FeeTemplateType, string> = {
  import_tax: '进口税',
  platform_fee: '平台费',
}

export const FULFILLMENT_POOL_OPTIONS = [
  'daraz_lk_sea_lot',
  'lazada_cn_spot_xmn',
  'lazada_cn_spot_sz',
] as const

export const FULFILLMENT_LOGISTICS_OPTIONS = ['', 'FCL', 'LCL', 'AIR_DDP', 'FCL20', 'FCL40'] as const
