/**
 * 费用模板（进口税 / 平台费）类型与纯函数助手。
 * 主路径已切 tRPC → dataaccess/fee-templates → PostgreSQL
 * （见 routers/feeTemplates、console/fee-templates、成本测算 resolve）。
 * 本文件仅保留类型 / 常量 / components→税率映射；勿再写 localStorage。
 * @see apps/shop/content/design/fee-templates-ued.md
 * @see docs/design/shop-module5-fee-templates-trpc.md
 */

export type FeeTemplateType = 'import_tax' | 'platform_fee' | 'ocean_freight'
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
  /** UED v1.1 审核状态（DB 主路径）；原型字段可选 */
  status?: 'draft' | 'in_review' | 'published' | 'disabled'
}

export type FeeTemplateStoreState = {
  templates: FeeTemplate[]
  versions: FeeTemplateVersion[]
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

/** 自原 TARIFF_PROFILES 迁出的 LK 税率初值（待报关行复核）；供映射 fallback。 */
export const LK_SEED_RATES: Record<
  string,
  { customs: number; cess: number; pal: number; vat: number; sscl: number; hsHint: string; labelZh: string }
> = {
  apparel: { customs: 0.15, cess: 0.1, pal: 0.1, vat: 0.18, sscl: 0.025, hsHint: '6109.10', labelZh: '服装（示例）' },
  electronics: { customs: 0.1, cess: 0.05, pal: 0.1, vat: 0.18, sscl: 0.025, hsHint: '8471.80', labelZh: '3C 电子（示例）' },
  home_sports: { customs: 0.12, cess: 0.08, pal: 0.1, vat: 0.18, sscl: 0.025, hsHint: '9506.91', labelZh: '家居/运动（示例）' },
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
  version: Pick<FeeTemplateVersion, 'components' | 'formulaProfile' | 'reviewNeeded'>,
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
  ocean_freight: '海运运费',
}

export const FULFILLMENT_POOL_OPTIONS = [
  'daraz_lk_sea_lot',
  'lazada_cn_spot_xmn',
  'lazada_cn_spot_sz',
] as const

export const FULFILLMENT_LOGISTICS_OPTIONS = ['', 'FCL', 'LCL', 'AIR_DDP', 'FCL20', 'FCL40'] as const

function warnDeprecated(fn: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[fee-template-store] ${fn} 已停用 localStorage。请改用 trpc.feeTemplates.* / dataaccess resolve。`,
    )
  }
}

/** @deprecated 主路径已禁用 localStorage */
export function useFeeTemplateStore(): FeeTemplateStoreState {
  warnDeprecated('useFeeTemplateStore()')
  return { templates: [], versions: [] }
}

/** @deprecated */
export function getFeeTemplateStore(): FeeTemplateStoreState {
  return { templates: [], versions: [] }
}

/** @deprecated */
export function listFeeTemplates(): FeeTemplate[] {
  warnDeprecated('listFeeTemplates()')
  return []
}

/** @deprecated */
export function getFeeTemplate(_id: string): FeeTemplate | undefined {
  return undefined
}

/** @deprecated */
export function listFeeTemplateVersions(_templateId: string): FeeTemplateVersion[] {
  return []
}

/** @deprecated */
export function upsertFeeTemplate(_row: FeeTemplate) {
  warnDeprecated('upsertFeeTemplate()')
}

/** @deprecated */
export function addFeeTemplate(
  _input: Omit<FeeTemplate, 'id' | 'updatedAt'> & { id?: string },
): string {
  warnDeprecated('addFeeTemplate()')
  return ''
}

/** @deprecated */
export function upsertFeeTemplateVersion(_row: FeeTemplateVersion) {
  warnDeprecated('upsertFeeTemplateVersion()')
}

/** @deprecated */
export function createFeeTemplateVersionDraft(
  _templateId: string,
  _base?: FeeTemplateVersion,
): FeeTemplateVersion {
  warnDeprecated('createFeeTemplateVersionDraft()')
  return {
    id: '',
    templateId: '',
    versionNo: 0,
    effectiveFrom: '',
    effectiveTo: '',
    priority: 10,
    formulaProfile: 'custom',
    components: [],
    published: false,
    reviewNeeded: true,
    note: '',
    createdAt: '',
  }
}

/** @deprecated */
export function publishFeeTemplateVersion(_versionId: string): FeeTemplateVersion | null {
  warnDeprecated('publishFeeTemplateVersion()')
  return null
}

/** @deprecated */
export function updateFeeTemplateVersion(
  _versionId: string,
  _patch: Partial<Omit<FeeTemplateVersion, 'id' | 'templateId'>>,
): FeeTemplateVersion | null {
  warnDeprecated('updateFeeTemplateVersion()')
  return null
}

/**
 * @deprecated 客户端 localStorage 解析已停用。
 * 主路径请用 trpc.feeTemplates.resolve 或 server dataaccess.resolveFeeTemplateVersion。
 * 同步调用恒返回 null，计算器回退 TARIFF_PROFILES 并标记 resolvedFrom。
 */
export function resolveFeeTemplateVersion(_args: ResolveFeeTemplateArgs): ResolvedFeeTemplate | null {
  warnDeprecated('resolveFeeTemplateVersion()')
  return null
}

/** 将 tRPC resolve 结果适配为计算器所用 ResolvedFeeTemplate 形状 */
export function adaptResolvedFromDto(dto: {
  template: {
    id: string
    code: string
    name: string
    platform: string
    country: string
    fulfillmentPool: string
    fulfillmentLogistics: string
    type: string
    statusLabel?: string
    status?: string
    note: string
    updatedAt: string
  }
  version: {
    id: string
    templateId: string
    versionNo: number
    effectiveFrom: string
    effectiveTo: string
    priority: number
    formulaProfile: string
    components: FeeComponent[]
    published: boolean
    reviewNeeded: boolean
    note: string
    createdAt: string
    status?: string
  }
}): ResolvedFeeTemplate {
  const statusLabel = dto.template.statusLabel
  const status: FeeTemplateStatus =
    statusLabel === '启用' || statusLabel === '停用' || statusLabel === '草稿'
      ? statusLabel
      : dto.template.status === 'active'
        ? '启用'
        : dto.template.status === 'disabled'
          ? '停用'
          : '草稿'
  return {
    template: {
      id: dto.template.id,
      code: dto.template.code,
      name: dto.template.name,
      platform: dto.template.platform,
      country: dto.template.country,
      fulfillmentPool: dto.template.fulfillmentPool,
      fulfillmentLogistics: dto.template.fulfillmentLogistics,
      type: dto.template.type === 'platform_fee' ? 'platform_fee' : dto.template.type === 'ocean_freight' ? 'ocean_freight' : 'import_tax',
      status,
      note: dto.template.note,
      updatedAt: dto.template.updatedAt,
    },
    version: {
      id: dto.version.id,
      templateId: dto.version.templateId,
      versionNo: dto.version.versionNo,
      effectiveFrom: dto.version.effectiveFrom,
      effectiveTo: dto.version.effectiveTo,
      priority: dto.version.priority,
      formulaProfile: dto.version.formulaProfile,
      components: dto.version.components,
      published: dto.version.published,
      reviewNeeded: dto.version.reviewNeeded,
      note: dto.version.note,
      createdAt: dto.version.createdAt,
      status:
        dto.version.status === 'in_review' ||
        dto.version.status === 'published' ||
        dto.version.status === 'disabled' ||
        dto.version.status === 'draft'
          ? dto.version.status
          : undefined,
    },
  }
}
