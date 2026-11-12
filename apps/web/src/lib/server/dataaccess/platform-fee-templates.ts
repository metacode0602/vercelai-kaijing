import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  feeTemplateMatchRules,
  feeTemplates,
  feeTemplateVersions,
  platformFeeTemplateMatchRulesCatalog,
  platformFeeTemplatesCatalog,
  platformFeeTemplateVersionsCatalog,
} from '@workspace/db'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export const FEE_TEMPLATE_TYPES = [
  { value: 'import_tax', label: '进口税' },
  { value: 'platform_fee', label: '平台费' },
  { value: 'ocean_freight', label: '海运运费' },
] as const

export type FeeTemplateType = (typeof FEE_TEMPLATE_TYPES)[number]['value']

export type FeeComponent = {
  code: string
  labelZh: string
  rate: number | null
  unit: 'pct' | 'usd' | 'amount' | 'lkr' | 'per_kg' | 'per_unit'
  baseHint?: string
  note?: string
  currency?: string
}

function normalizeComponents(raw: unknown): FeeComponent[] {
  if (!Array.isArray(raw)) return []
  const allowed = new Set(['pct', 'usd', 'amount', 'lkr', 'per_kg', 'per_unit'])
  return raw.map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const rateRaw = row.rate
    const rate =
      rateRaw == null || rateRaw === ''
        ? null
        : typeof rateRaw === 'number'
          ? rateRaw
          : Number(rateRaw)
    return {
      code: String(row.code ?? '').trim(),
      labelZh: String(row.labelZh ?? row.label ?? '').trim(),
      rate: rate != null && Number.isFinite(rate) ? rate : null,
      unit: allowed.has(String(row.unit)) ? (String(row.unit) as FeeComponent['unit']) : 'pct',
      baseHint: row.baseHint != null ? String(row.baseHint) : undefined,
      note: row.note != null ? String(row.note) : undefined,
      currency: row.currency != null ? String(row.currency) : undefined,
    }
  })
}

export type PlatformFeeTemplateItem = {
  id: string
  code: string
  name: string
  platform: string
  country: string
  fulfillmentPool: string
  fulfillmentLogistics: string
  type: FeeTemplateType
  status: 'active' | 'inactive'
  note: string
  sortOrder: number
  versionCount: number
  referenced: boolean
  updatedAt: Date
}

export type PlatformFeeVersionItem = {
  id: string
  templateId: string
  versionNo: number
  effectiveFrom: string
  effectiveTo: string
  priority: number
  formulaProfile: string
  components: FeeComponent[]
  note: string
  status: 'active' | 'inactive'
  referenced: boolean
  updatedAt: Date
}

export type PlatformFeeRuleItem = {
  id: string
  templateId: string
  categoryCode: string
  hsCodePattern: string
  priority: number
  note: string
}

async function referencedTemplateIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await db
    .selectDistinct({ sourceId: feeTemplates.sourceId })
    .from(feeTemplates)
    .where(inArray(feeTemplates.sourceId, ids))
  return new Set(rows.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))
}

async function referencedVersionIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await db
    .selectDistinct({ sourceId: feeTemplateVersions.sourceId })
    .from(feeTemplateVersions)
    .where(inArray(feeTemplateVersions.sourceId, ids))
  return new Set(rows.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))
}

export async function listPlatformFeeTemplates(input: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
  type?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = []
  if (input.status === 'active' || input.status === 'inactive') {
    filters.push(eq(platformFeeTemplatesCatalog.status, input.status))
  }
  if (input.type === 'import_tax' || input.type === 'platform_fee' || input.type === 'ocean_freight') {
    filters.push(eq(platformFeeTemplatesCatalog.type, input.type))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(platformFeeTemplatesCatalog.code, value),
        ilike(platformFeeTemplatesCatalog.name, value),
        ilike(platformFeeTemplatesCatalog.platform, value),
        ilike(platformFeeTemplatesCatalog.country, value),
      )!,
    )
  }
  const where = filters.length ? and(...filters) : undefined
  const totalRows = await db.select({ total: count() }).from(platformFeeTemplatesCatalog).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const rows = await db
    .select()
    .from(platformFeeTemplatesCatalog)
    .where(where)
    .orderBy(platformFeeTemplatesCatalog.sortOrder, platformFeeTemplatesCatalog.code)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const referenced = await referencedTemplateIds(rows.map((row) => row.id))
  const versionCounts =
    rows.length === 0
      ? []
      : await db
          .select({
            templateId: platformFeeTemplateVersionsCatalog.templateId,
            total: count(),
          })
          .from(platformFeeTemplateVersionsCatalog)
          .where(inArray(platformFeeTemplateVersionsCatalog.templateId, rows.map((row) => row.id)))
          .groupBy(platformFeeTemplateVersionsCatalog.templateId)
  const countMap = new Map(versionCounts.map((row) => [row.templateId, Number(row.total)]))
  return {
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      platform: row.platform,
      country: row.country,
      fulfillmentPool: row.fulfillmentPool ?? '',
      fulfillmentLogistics: row.fulfillmentLogistics ?? '',
      type: (row.type === 'platform_fee' || row.type === 'ocean_freight' ? row.type : 'import_tax') as FeeTemplateType,
      status: row.status === 'inactive' ? ('inactive' as const) : ('active' as const),
      note: row.note ?? '',
      sortOrder: Number(row.sortOrder ?? 0),
      versionCount: countMap.get(row.id) ?? 0,
      referenced: referenced.has(row.id),
      updatedAt: row.updatedAt,
    })),
    total,
    page,
    pageSize,
  }
}

export type PlatformFeeTemplateInput = {
  code: string
  name: string
  platform: string
  country: string
  fulfillmentPool?: string
  fulfillmentLogistics?: string
  type: FeeTemplateType
  status?: 'active' | 'inactive'
  note?: string
  sortOrder?: number
}

function normalizeHeader(input: PlatformFeeTemplateInput) {
  const code = input.code.trim()
  if (!/^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(code)) {
    throw new Error('模板编码应以字母开头，可含数字和下划线，如 daraz_lk_platform_fee')
  }
  const name = input.name.trim()
  if (!name) throw new Error('模板名称不能为空')
  const platform = input.platform.trim().toLowerCase()
  if (!platform) throw new Error('请填写平台')
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('国家应为两位代码，如 LK')
  const type = input.type
  if (!['import_tax', 'platform_fee', 'ocean_freight'].includes(type)) {
    throw new Error('类型须为进口税、平台费或海运运费')
  }
  return {
    code,
    name,
    platform,
    country,
    fulfillmentPool: input.fulfillmentPool?.trim() || null,
    fulfillmentLogistics: input.fulfillmentLogistics?.trim() || null,
    type,
    status: input.status === 'inactive' ? ('inactive' as const) : ('active' as const),
    note: input.note?.trim() || '',
    sortOrder: input.sortOrder ?? 0,
  }
}

async function nextHeaderSort() {
  const rows = await db
    .select({ max: sql<number | null>`max(${platformFeeTemplatesCatalog.sortOrder})` })
    .from(platformFeeTemplatesCatalog)
  return Number(rows[0]?.max ?? 0) + 10
}

export async function createPlatformFeeTemplate(input: PlatformFeeTemplateInput) {
  const values = normalizeHeader(input)
  const [dup] = await db
    .select({ id: platformFeeTemplatesCatalog.id })
    .from(platformFeeTemplatesCatalog)
    .where(eq(platformFeeTemplatesCatalog.code, values.code))
    .limit(1)
  if (dup) throw new Error(`费用模板 ${values.code} 已存在`)
  const [row] = await db
    .insert(platformFeeTemplatesCatalog)
    .values({
      id: createId(),
      ...values,
      sortOrder: values.sortOrder || (await nextHeaderSort()),
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return row
}

export async function updatePlatformFeeTemplate(input: { id: string } & PlatformFeeTemplateInput) {
  const values = normalizeHeader(input)
  const [existing] = await db
    .select()
    .from(platformFeeTemplatesCatalog)
    .where(eq(platformFeeTemplatesCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('默认费用模板不存在')
  const [dup] = await db
    .select({ id: platformFeeTemplatesCatalog.id })
    .from(platformFeeTemplatesCatalog)
    .where(and(eq(platformFeeTemplatesCatalog.code, values.code), sql`${platformFeeTemplatesCatalog.id} <> ${input.id}`))
    .limit(1)
  if (dup) throw new Error(`费用模板 ${values.code} 已存在`)
  const [row] = await db
    .update(platformFeeTemplatesCatalog)
    .set({ ...values, sortOrder: values.sortOrder || existing.sortOrder, updatedAt: new Date() })
    .where(eq(platformFeeTemplatesCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return row
}

export async function deletePlatformFeeTemplate(id: string) {
  const [existing] = await db
    .select({ id: platformFeeTemplatesCatalog.id, name: platformFeeTemplatesCatalog.name })
    .from(platformFeeTemplatesCatalog)
    .where(eq(platformFeeTemplatesCatalog.id, id))
    .limit(1)
  if (!existing) throw new Error('默认费用模板不存在')
  const referenced = await referencedTemplateIds([id])
  if (referenced.has(id)) {
    throw new Error('已有组织引用此费用模板，请改为停用，不能删除')
  }
  await db.delete(platformFeeTemplatesCatalog).where(eq(platformFeeTemplatesCatalog.id, id))
  return { id }
}

export async function listPlatformFeeVersions(templateId: string) {
  const rows = await db
    .select()
    .from(platformFeeTemplateVersionsCatalog)
    .where(eq(platformFeeTemplateVersionsCatalog.templateId, templateId))
    .orderBy(desc(platformFeeTemplateVersionsCatalog.versionNo))
  const referenced = await referencedVersionIds(rows.map((row) => row.id))
  return rows.map((row) => ({
    id: row.id,
    templateId: row.templateId,
    versionNo: row.versionNo,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : '',
    priority: row.priority,
    formulaProfile: row.formulaProfile ?? '',
    components: normalizeComponents(row.components),
    note: row.note ?? '',
    status: row.status === 'inactive' ? ('inactive' as const) : ('active' as const),
    referenced: referenced.has(row.id),
    updatedAt: row.updatedAt,
  }))
}

export type PlatformFeeVersionInput = {
  templateId: string
  effectiveFrom: string
  effectiveTo?: string
  priority?: number
  formulaProfile?: string
  components?: Array<{
    code: string
    labelZh: string
    rate?: number | null
    unit?: FeeComponent['unit']
    baseHint?: string
    note?: string
    currency?: string
  }>
  note?: string
  status?: 'active' | 'inactive'
}

async function nextVersionNo(templateId: string) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${platformFeeTemplateVersionsCatalog.versionNo})` })
    .from(platformFeeTemplateVersionsCatalog)
    .where(eq(platformFeeTemplateVersionsCatalog.templateId, templateId))
  return Number(row?.max ?? 0) + 1
}

function normalizeVersion(input: PlatformFeeVersionInput) {
  if (!input.effectiveFrom?.trim()) throw new Error('请填写生效日期')
  return {
    effectiveFrom: new Date(input.effectiveFrom),
    effectiveTo: input.effectiveTo?.trim() ? new Date(input.effectiveTo) : null,
    priority: input.priority ?? 10,
    formulaProfile: input.formulaProfile?.trim() || null,
    components: normalizeComponents(input.components ?? []),
    note: input.note?.trim() || '',
    status: input.status === 'inactive' ? ('inactive' as const) : ('active' as const),
  }
}

export async function createPlatformFeeVersion(input: PlatformFeeVersionInput) {
  const [header] = await db
    .select({ id: platformFeeTemplatesCatalog.id })
    .from(platformFeeTemplatesCatalog)
    .where(eq(platformFeeTemplatesCatalog.id, input.templateId))
    .limit(1)
  if (!header) throw new Error('默认费用模板不存在')
  const values = normalizeVersion(input)
  const [row] = await db
    .insert(platformFeeTemplateVersionsCatalog)
    .values({
      id: createId(),
      templateId: input.templateId,
      versionNo: await nextVersionNo(input.templateId),
      ...values,
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return row
}

export async function updatePlatformFeeVersion(input: { id: string } & Omit<PlatformFeeVersionInput, 'templateId'>) {
  const [existing] = await db
    .select()
    .from(platformFeeTemplateVersionsCatalog)
    .where(eq(platformFeeTemplateVersionsCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('费用模板版本不存在')
  const values = normalizeVersion({ ...input, templateId: existing.templateId })
  const [row] = await db
    .update(platformFeeTemplateVersionsCatalog)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(platformFeeTemplateVersionsCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return row
}

export async function deletePlatformFeeVersion(id: string) {
  const referenced = await referencedVersionIds([id])
  if (referenced.has(id)) {
    throw new Error('已有组织引用此版本，请改为停用，不能删除')
  }
  const [existing] = await db
    .select({ id: platformFeeTemplateVersionsCatalog.id })
    .from(platformFeeTemplateVersionsCatalog)
    .where(eq(platformFeeTemplateVersionsCatalog.id, id))
    .limit(1)
  if (!existing) throw new Error('费用模板版本不存在')
  await db.delete(platformFeeTemplateVersionsCatalog).where(eq(platformFeeTemplateVersionsCatalog.id, id))
  return { id }
}

export async function listPlatformFeeRules(templateId: string) {
  const rows = await db
    .select()
    .from(platformFeeTemplateMatchRulesCatalog)
    .where(eq(platformFeeTemplateMatchRulesCatalog.templateId, templateId))
    .orderBy(desc(platformFeeTemplateMatchRulesCatalog.priority))
  return rows.map((row) => ({
    id: row.id,
    templateId: row.templateId,
    categoryCode: row.categoryCode ?? '',
    hsCodePattern: row.hsCodePattern ?? '',
    priority: row.priority,
    note: row.note ?? '',
  }))
}

export type PlatformFeeRuleInput = {
  templateId: string
  categoryCode?: string
  hsCodePattern?: string
  priority?: number
  note?: string
}

export async function createPlatformFeeRule(input: PlatformFeeRuleInput) {
  const [header] = await db
    .select({ id: platformFeeTemplatesCatalog.id })
    .from(platformFeeTemplatesCatalog)
    .where(eq(platformFeeTemplatesCatalog.id, input.templateId))
    .limit(1)
  if (!header) throw new Error('默认费用模板不存在')
  const [row] = await db
    .insert(platformFeeTemplateMatchRulesCatalog)
    .values({
      id: createId(),
      templateId: input.templateId,
      categoryCode: input.categoryCode?.trim() || null,
      hsCodePattern: input.hsCodePattern?.trim() || null,
      priority: input.priority ?? 10,
      note: input.note?.trim() || '',
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return row
}

export async function updatePlatformFeeRule(input: { id: string } & Omit<PlatformFeeRuleInput, 'templateId'>) {
  const [existing] = await db
    .select()
    .from(platformFeeTemplateMatchRulesCatalog)
    .where(eq(platformFeeTemplateMatchRulesCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('匹配规则不存在')
  const [row] = await db
    .update(platformFeeTemplateMatchRulesCatalog)
    .set({
      categoryCode: input.categoryCode?.trim() || null,
      hsCodePattern: input.hsCodePattern?.trim() || null,
      priority: input.priority ?? existing.priority,
      note: input.note?.trim() || '',
      updatedAt: new Date(),
    })
    .where(eq(platformFeeTemplateMatchRulesCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return row
}

export async function deletePlatformFeeRule(id: string) {
  const refs = await db
    .select({ id: feeTemplateMatchRules.id })
    .from(feeTemplateMatchRules)
    .where(eq(feeTemplateMatchRules.sourceId, id))
    .limit(1)
  if (refs.length > 0) {
    throw new Error('已有组织引用此匹配规则，不能删除')
  }
  const [existing] = await db
    .select({ id: platformFeeTemplateMatchRulesCatalog.id })
    .from(platformFeeTemplateMatchRulesCatalog)
    .where(eq(platformFeeTemplateMatchRulesCatalog.id, id))
    .limit(1)
  if (!existing) throw new Error('匹配规则不存在')
  await db.delete(platformFeeTemplateMatchRulesCatalog).where(eq(platformFeeTemplateMatchRulesCatalog.id, id))
  return { id }
}
