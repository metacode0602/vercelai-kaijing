/**
 * 费用模板（进口税 / 平台费 / 海运）类型与纯函数助手。
 * 主路径：tRPC → dataaccess/fee-templates → PostgreSQL。
 * 本文件仅保留类型 / 常量 / components→税率映射；不含任何 localStorage 或写死税率回退。
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
  unit: 'pct' | 'usd' | 'amount' | 'lkr' | 'per_kg' | 'per_unit'
  currency?: string
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
  status?: 'draft' | 'in_review' | 'published' | 'disabled'
}

export type ResolvedFeeTemplate = {
  template: FeeTemplate
  version: FeeTemplateVersion
}

/**
 * 公式档案标签（仅用于 UI 展示 formulaProfile 档位名，不含任何税率）。
 * 正式税率只来自已发布费用模板版本的 components。
 */
export const TARIFF_PROFILE_META: Record<
  string,
  { labelZh: string; hsHint: string }
> = {
  apparel: { labelZh: '服装', hsHint: '6109.10' },
  electronics: { labelZh: '3C 电子', hsHint: '8471.80' },
  home_sports: { labelZh: '家居/运动', hsHint: '9506.91' },
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
  /** 模板版本中缺失的组件 code（正式保存必须阻断） */
  missingCodes: string[]
}

/** 进口税正式测算必需的组件 code（缺一不可发布）。 */
export const REQUIRED_IMPORT_TAX_CODES = [
  'customs',
  'cess',
  'pal',
  'vat',
  'sscl',
] as const

/**
 * 将费用模板版本 components 映射为税率。
 * 缺失组件记 0 并列入 missingCodes（禁止回退任何写死税率）。
 */
export function componentsToTariffRates(
  version: Pick<FeeTemplateVersion, 'components' | 'formulaProfile' | 'reviewNeeded'>,
  fallbackId = 'apparel',
): FeeResolvedTariffRates {
  const byCode = Object.fromEntries(version.components.map((c) => [c.code, c]))
  const missingCodes: string[] = []
  const pct = (codes: string[]): number => {
    for (const code of codes) {
      const c = byCode[code]
      if (c && c.unit === 'pct') return c.rate
      if (c && c.unit === 'usd') continue
    }
    return 0
  }
  const hasAny = (codes: string[]): boolean => codes.some((code) => Boolean(byCode[code]))

  const customsCodes = ['customs', 'import_duty']
  const vatCodes = ['vat', 'sst']
  if (!hasAny(customsCodes)) missingCodes.push('customs')
  if (!hasAny(['cess'])) missingCodes.push('cess')
  if (!hasAny(['pal'])) missingCodes.push('pal')
  if (!hasAny(vatCodes)) missingCodes.push('vat')
  if (!hasAny(['sscl'])) missingCodes.push('sscl')

  const profileId = version.formulaProfile in TARIFF_PROFILE_META ? version.formulaProfile : fallbackId
  const meta = TARIFF_PROFILE_META[profileId] ?? TARIFF_PROFILE_META[fallbackId] ?? TARIFF_PROFILE_META.apparel!
  return {
    id: profileId,
    labelZh: meta.labelZh,
    hsHint: meta.hsHint,
    customs: pct(customsCodes),
    cess: pct(['cess']),
    pal: pct(['pal']),
    vat: pct(vatCodes),
    sscl: pct(['sscl']),
    reviewNeeded: version.reviewNeeded || missingCodes.length > 0,
    missingCodes,
  }
}

/**
 * 平台费费率。未解析返回 0（由调用方决定草稿展示值；正式保存由 blockReasons 阻断）。
 * 缺组件不回退 8%/2% 等写死值。
 */
export function getPlatformFeePercents(resolved: ResolvedFeeTemplate | null): {
  commissionPct: number
  paymentFeePct: number
} {
  if (!resolved) return { commissionPct: 0, paymentFeePct: 0 }
  const byCode = Object.fromEntries(resolved.version.components.map((c) => [c.code, c]))
  const toPct = (c?: FeeComponent) => (c ? (c.unit === 'pct' ? c.rate * 100 : c.rate) : 0)
  return {
    commissionPct: toPct(byCode.commission),
    paymentFeePct: toPct(byCode.payment_fee),
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
