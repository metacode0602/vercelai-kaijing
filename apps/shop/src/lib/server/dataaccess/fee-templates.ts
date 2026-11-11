/**
 * 费用模板 dataaccess（模块5）。
 * fee_templates + fee_template_versions；解析取同维度 priority 最高且有效期内已发布版本。
 */
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { feeTemplateMatchRules, feeTemplates, feeTemplateVersions } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  feeTypeLabel,
  formatDateOnly,
  formatStamp,
  parseDateInput,
  publishedFromStatus,
  toDbFeeType,
  toDbHeaderStatus,
  toUiFeeType,
  toUiHeaderStatus,
  toUiVersionStatus,
  type UiFeeTemplateHeaderStatus,
  type UiFeeTemplateType,
  type UiFeeTemplateVersionStatus,
} from '@/lib/server/mappers/fee-templates'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { selectTemplatesByMatchRules } from '@/lib/crossborder/fee-template-match'
import { listCategoryAncestorIds } from '@/lib/server/dataaccess/categories'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type FeeComponentDto = {
  code: string
  labelZh: string
  rate: number
  unit: 'pct' | 'usd' | 'amount' | 'lkr' | 'per_kg' | 'per_unit'
  baseHint?: string
  note?: string
  currency?: string
}

export type FeeTemplateVersionDto = {
  id: string
  templateId: string
  versionNo: number
  effectiveFrom: string
  effectiveTo: string
  priority: number
  formulaProfile: string
  components: FeeComponentDto[]
  published: boolean
  reviewNeeded: boolean
  status: string
  statusLabel: UiFeeTemplateVersionStatus
  submittedBy: string
  submittedAt: string
  reviewedBy: string
  reviewedAt: string
  reviewNote: string
  note: string
  createdAt: string
  updatedAt: string
}

export type FeeTemplateDto = {
  id: string
  code: string
  name: string
  platform: string
  country: string
  fulfillmentPool: string
  fulfillmentLogistics: string
  type: string
  typeLabel: UiFeeTemplateType
  status: string
  statusLabel: UiFeeTemplateHeaderStatus
  note: string
  createdAt: string
  updatedAt: string
  versionCount: number
  topVersion: string
  topPriority: number | string
  logisticsLabel: string
  versions?: FeeTemplateVersionDto[]
}

export type ResolveFeeTemplateInput = {
  platform: string
  country: string
  type: 'import_tax' | 'platform_fee' | string
  fulfillmentPool?: string
  fulfillmentLogistics?: string
  asOf?: string
  formulaProfile?: string
  templateCodeOrId?: string
  /** 商品品类，用于匹配规则 */
  categoryId?: string
  /** SKU HS，用于匹配规则（将规范化后按前缀/全码比较） */
  hsCode?: string
}

export type FeeTemplateMatchRuleDto = {
  id: string
  templateId: string
  categoryId: string | null
  hsCodePattern: string
  priority: number
  note: string
}

export type ResolvedFeeTemplateDto = {
  template: FeeTemplateDto
  version: FeeTemplateVersionDto
}

function normalizeComponents(raw: unknown): FeeComponentDto[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const allowed = new Set(['pct', 'usd', 'amount', 'lkr', 'per_kg', 'per_unit'])
    const unit = allowed.has(String(row.unit)) ? String(row.unit) as FeeComponentDto['unit'] : 'pct'
    return {
      code: String(row.code ?? ''),
      labelZh: String(row.labelZh ?? row.label ?? ''),
      rate: typeof row.rate === 'number' ? row.rate : Number(row.rate) || 0,
      unit,
      baseHint: row.baseHint != null ? String(row.baseHint) : undefined,
      note: row.note != null ? String(row.note) : undefined,
      currency: row.currency != null ? String(row.currency) : undefined,
    }
  })
}

function mapVersion(row: typeof feeTemplateVersions.$inferSelect): FeeTemplateVersionDto {
  const status = row.status || (row.published ? 'published' : 'draft')
  return {
    id: row.id,
    templateId: row.templateId,
    versionNo: row.versionNo,
    effectiveFrom: formatDateOnly(row.effectiveFrom),
    effectiveTo: formatDateOnly(row.effectiveTo),
    priority: row.priority,
    formulaProfile: row.formulaProfile ?? '',
    components: normalizeComponents(row.components),
    published: row.published || status === 'published',
    reviewNeeded: row.reviewNeeded,
    status,
    statusLabel: toUiVersionStatus(status),
    submittedBy: row.submittedBy ?? '',
    submittedAt: formatStamp(row.submittedAt),
    reviewedBy: row.reviewedBy ?? '',
    reviewedAt: formatStamp(row.reviewedAt),
    reviewNote: row.reviewNote ?? '',
    note: row.note ?? '',
    createdAt: formatDateOnly(row.createdAt) || formatStamp(row.createdAt),
    updatedAt: formatDateOnly(row.updatedAt) || formatStamp(row.updatedAt),
  }
}

function mapTemplateHeader(
  row: typeof feeTemplates.$inferSelect,
  meta?: { versionCount?: number; topVersionNo?: number | null; topPriority?: number | null },
): FeeTemplateDto {
  const topVersionNo = meta?.topVersionNo
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    platform: row.platform,
    country: row.country,
    fulfillmentPool: row.fulfillmentPool ?? '',
    fulfillmentLogistics: row.fulfillmentLogistics ?? '',
    type: row.type,
    typeLabel: toUiFeeType(row.type),
    status: row.status,
    statusLabel: toUiHeaderStatus(row.status),
    note: row.note ?? '',
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatDateOnly(row.updatedAt) || formatStamp(row.updatedAt),
    versionCount: meta?.versionCount ?? 0,
    topVersion: topVersionNo != null ? `v${topVersionNo}` : '无已发布',
    topPriority: meta?.topPriority ?? '—',
    logisticsLabel: row.fulfillmentLogistics || '不限',
  }
}

async function loadVersionMeta(db: DbLike, organizationId: string, templateIds: string[]) {
  const meta = new Map<string, { versionCount: number; topVersionNo: number | null; topPriority: number | null }>()
  if (templateIds.length === 0) return meta
  const versions = await db
    .select()
    .from(feeTemplateVersions)
    .where(
      and(
        eq(feeTemplateVersions.organizationId, organizationId),
        inArray(feeTemplateVersions.templateId, templateIds),
      ),
    )
  for (const id of templateIds) {
    meta.set(id, { versionCount: 0, topVersionNo: null, topPriority: null })
  }
  const publishedByTpl = new Map<string, typeof versions>()
  for (const v of versions) {
    const cur = meta.get(v.templateId) ?? { versionCount: 0, topVersionNo: null, topPriority: null }
    cur.versionCount += 1
    meta.set(v.templateId, cur)
    if (v.status === 'published' || v.published) {
      const list = publishedByTpl.get(v.templateId) ?? []
      list.push(v)
      publishedByTpl.set(v.templateId, list)
    }
  }
  for (const [tplId, list] of publishedByTpl) {
    list.sort((a, b) => b.priority - a.priority || b.versionNo - a.versionNo)
    const top = list[0]
    const cur = meta.get(tplId)!
    cur.topVersionNo = top?.versionNo ?? null
    cur.topPriority = top?.priority ?? null
  }
  return meta
}

export async function listFeeTemplates(
  db: DbLike,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    platform?: string
    country?: string
    fulfillmentPool?: string
    type?: string
    status?: string
  } = {},
): Promise<PaginatedResult<FeeTemplateDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(feeTemplates.organizationId, organizationId)]
  if (input.platform && input.platform !== '全部') {
    filters.push(eq(feeTemplates.platform, input.platform))
  }
  if (input.country && input.country !== '全部') {
    filters.push(eq(feeTemplates.country, input.country.toUpperCase()))
  }
  if (input.fulfillmentPool && input.fulfillmentPool !== '全部') {
    filters.push(eq(feeTemplates.fulfillmentPool, input.fulfillmentPool))
  }
  if (input.type && input.type !== '全部') {
    filters.push(eq(feeTemplates.type, toDbFeeType(input.type)))
  }
  if (input.status && input.status !== '全部') {
    filters.push(eq(feeTemplates.status, toDbHeaderStatus(input.status)))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(feeTemplates.code, q),
        ilike(feeTemplates.name, q),
        ilike(feeTemplates.platform, q),
        ilike(feeTemplates.fulfillmentPool, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ value: count() }).from(feeTemplates).where(where)
  const total = Number(totalRow?.value ?? 0)
  const rows = await db
    .select()
    .from(feeTemplates)
    .where(where)
    .orderBy(desc(feeTemplates.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const meta = await loadVersionMeta(
    db,
    organizationId,
    rows.map((r) => r.id),
  )
  return {
    items: rows.map((row) => mapTemplateHeader(row, meta.get(row.id))),
    page,
    pageSize,
    total,
  }
}

export async function feeTemplateStats(db: DbLike, organizationId: string) {
  const rows = await db
    .select({
      status: feeTemplates.status,
      type: feeTemplates.type,
      value: count(),
    })
    .from(feeTemplates)
    .where(eq(feeTemplates.organizationId, organizationId))
    .groupBy(feeTemplates.status, feeTemplates.type)
  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const n = Number(row.value)
    total += n
    const uiStatus = toUiHeaderStatus(row.status)
    byStatus[uiStatus] = (byStatus[uiStatus] ?? 0) + n
    const uiType = feeTypeLabel(row.type)
    byType[uiType] = (byType[uiType] ?? 0) + n
  }
  return { total, byStatus, byType }
}

export async function getFeeTemplate(
  db: DbLike,
  organizationId: string,
  idOrCode: string,
): Promise<FeeTemplateDto | null> {
  const [row] = await db
    .select()
    .from(feeTemplates)
    .where(
      and(
        eq(feeTemplates.organizationId, organizationId),
        or(eq(feeTemplates.id, idOrCode), eq(feeTemplates.code, idOrCode))!,
      ),
    )
    .limit(1)
  if (!row) return null
  const versions = await db
    .select()
    .from(feeTemplateVersions)
    .where(
      and(
        eq(feeTemplateVersions.organizationId, organizationId),
        eq(feeTemplateVersions.templateId, row.id),
      ),
    )
    .orderBy(desc(feeTemplateVersions.versionNo), desc(feeTemplateVersions.priority))
  const published = versions.filter((v) => v.status === 'published' || v.published)
  published.sort((a, b) => b.priority - a.priority || b.versionNo - a.versionNo)
  const top = published[0]
  const dto = mapTemplateHeader(row, {
    versionCount: versions.length,
    topVersionNo: top?.versionNo ?? null,
    topPriority: top?.priority ?? null,
  })
  dto.versions = versions.map(mapVersion)
  return dto
}

export async function createFeeTemplate(
  db: DbLike,
  organizationId: string,
  input: {
    code: string
    name: string
    platform: string
    country: string
    fulfillmentPool?: string
    fulfillmentLogistics?: string
    type: string
    status?: string
    note?: string
    withDraftVersion?: boolean
  },
): Promise<FeeTemplateDto> {
  const code = input.code.trim()
  if (!code) throw new Error('模板编码不能为空')
  const [dup] = await db
    .select({ id: feeTemplates.id })
    .from(feeTemplates)
    .where(and(eq(feeTemplates.organizationId, organizationId), eq(feeTemplates.code, code)))
    .limit(1)
  if (dup) throw new Error(`模板编码 ${code} 已存在`)

  const id = createId()
  const now = new Date()
  const status = toDbHeaderStatus(input.status || '草稿')
  await db.insert(feeTemplates).values({
    id,
    organizationId,
    code,
    name: input.name.trim() || '未命名费用模板',
    platform: input.platform.trim().toLowerCase() || 'daraz',
    country: input.country.trim().toUpperCase() || 'LK',
    fulfillmentPool: input.fulfillmentPool?.trim() || null,
    fulfillmentLogistics: input.fulfillmentLogistics?.trim() || null,
    type: toDbFeeType(input.type),
    status,
    note: input.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  })

  if (input.withDraftVersion !== false) {
    await db.insert(feeTemplateVersions).values({
      id: createId(),
      organizationId,
      templateId: id,
      versionNo: 1,
      effectiveFrom: now,
      effectiveTo: null,
      priority: 10,
      formulaProfile: 'custom',
      components: [],
      published: false,
      reviewNeeded: true,
      status: 'draft',
      note: '草稿版本',
      createdAt: now,
      updatedAt: now,
    })
  }

  const created = await getFeeTemplate(db, organizationId, id)
  if (!created) throw new Error('创建费用模板失败')
  return created
}

export async function updateFeeTemplate(
  db: DbLike,
  organizationId: string,
  id: string,
  patch: {
    name?: string
    platform?: string
    country?: string
    fulfillmentPool?: string
    fulfillmentLogistics?: string
    status?: string
    note?: string
  },
): Promise<FeeTemplateDto> {
  const existing = await getFeeTemplate(db, organizationId, id)
  if (!existing) throw new Error(`费用模板不存在：${id}`)
  const now = new Date()
  await db
    .update(feeTemplates)
    .set({
      name: patch.name?.trim() ?? existing.name,
      platform: patch.platform?.trim().toLowerCase() ?? existing.platform,
      country: patch.country?.trim().toUpperCase() ?? existing.country,
      fulfillmentPool:
        patch.fulfillmentPool !== undefined
          ? patch.fulfillmentPool.trim() || null
          : existing.fulfillmentPool || null,
      fulfillmentLogistics:
        patch.fulfillmentLogistics !== undefined
          ? patch.fulfillmentLogistics.trim() || null
          : existing.fulfillmentLogistics || null,
      status: patch.status !== undefined ? toDbHeaderStatus(patch.status) : existing.status,
      note: patch.note !== undefined ? patch.note.trim() || null : existing.note || null,
      updatedAt: now,
    })
    .where(and(eq(feeTemplates.organizationId, organizationId), eq(feeTemplates.id, existing.id)))
  const updated = await getFeeTemplate(db, organizationId, existing.id)
  if (!updated) throw new Error('更新费用模板失败')
  return updated
}

export async function createFeeTemplateVersion(
  db: DbLike,
  organizationId: string,
  input: {
    templateId: string
    baseVersionId?: string
    effectiveFrom?: string
    effectiveTo?: string
    priority?: number
    formulaProfile?: string
    components?: FeeComponentDto[]
    note?: string
    reviewNeeded?: boolean
  },
): Promise<FeeTemplateVersionDto> {
  const template = await getFeeTemplate(db, organizationId, input.templateId)
  if (!template) throw new Error(`费用模板不存在：${input.templateId}`)
  const versions = template.versions ?? []
  const versionNo = versions.reduce((max, row) => Math.max(max, row.versionNo), 0) + 1
  const base = input.baseVersionId
    ? versions.find((v) => v.id === input.baseVersionId)
    : versions[0]
  const now = new Date()
  const effectiveFrom = parseDateInput(input.effectiveFrom) ?? now
  const effectiveTo = parseDateInput(input.effectiveTo ?? '')
  const id = createId()
  await db.insert(feeTemplateVersions).values({
    id,
    organizationId,
    templateId: template.id,
    versionNo,
    effectiveFrom,
    effectiveTo,
    priority: input.priority ?? base?.priority ?? 10,
    formulaProfile: input.formulaProfile ?? base?.formulaProfile ?? 'custom',
    components: (input.components ?? base?.components ?? []) as Record<string, unknown>[],
    published: false,
    reviewNeeded: input.reviewNeeded ?? true,
    status: 'draft',
    note: input.note ?? (base ? `基于 v${base.versionNo} 的草稿` : '草稿版本'),
    createdAt: now,
    updatedAt: now,
  })
  await db
    .update(feeTemplates)
    .set({ updatedAt: now })
    .where(and(eq(feeTemplates.organizationId, organizationId), eq(feeTemplates.id, template.id)))
  const [row] = await db
    .select()
    .from(feeTemplateVersions)
    .where(eq(feeTemplateVersions.id, id))
    .limit(1)
  if (!row) throw new Error('创建版本失败')
  return mapVersion(row)
}

export async function updateFeeTemplateVersion(
  db: DbLike,
  organizationId: string,
  versionId: string,
  patch: {
    effectiveFrom?: string
    effectiveTo?: string | null
    priority?: number
    formulaProfile?: string
    components?: FeeComponentDto[]
    note?: string
    reviewNeeded?: boolean
  },
): Promise<FeeTemplateVersionDto> {
  const [row] = await db
    .select()
    .from(feeTemplateVersions)
    .where(
      and(
        eq(feeTemplateVersions.organizationId, organizationId),
        eq(feeTemplateVersions.id, versionId),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`版本不存在：${versionId}`)
  if (row.status === 'in_review') throw new Error('审核中的版本不可编辑')
  if (row.status === 'published' || row.status === 'disabled') {
    throw new Error('已发布/已停用版本不可编辑；请新建草稿版本')
  }
  const now = new Date()
  const effectiveFrom =
    patch.effectiveFrom !== undefined ? parseDateInput(patch.effectiveFrom) : row.effectiveFrom
  if (!effectiveFrom) throw new Error('生效起日期无效')
  let effectiveTo = row.effectiveTo
  if (patch.effectiveTo !== undefined) {
    effectiveTo = patch.effectiveTo ? parseDateInput(patch.effectiveTo) : null
  }
  await db
    .update(feeTemplateVersions)
    .set({
      effectiveFrom,
      effectiveTo,
      priority: patch.priority ?? row.priority,
      formulaProfile:
        patch.formulaProfile !== undefined ? patch.formulaProfile : row.formulaProfile,
      components:
        patch.components !== undefined
          ? (patch.components as Record<string, unknown>[])
          : row.components,
      note: patch.note !== undefined ? patch.note : row.note,
      reviewNeeded: patch.reviewNeeded ?? row.reviewNeeded,
      updatedAt: now,
    })
    .where(eq(feeTemplateVersions.id, versionId))
  await db
    .update(feeTemplates)
    .set({ updatedAt: now })
    .where(
      and(eq(feeTemplates.organizationId, organizationId), eq(feeTemplates.id, row.templateId)),
    )
  const [updated] = await db
    .select()
    .from(feeTemplateVersions)
    .where(eq(feeTemplateVersions.id, versionId))
    .limit(1)
  if (!updated) throw new Error('更新版本失败')
  return mapVersion(updated)
}

async function loadVersionRow(db: DbLike, organizationId: string, versionId: string) {
  const [row] = await db
    .select()
    .from(feeTemplateVersions)
    .where(
      and(
        eq(feeTemplateVersions.organizationId, organizationId),
        eq(feeTemplateVersions.id, versionId),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`版本不存在：${versionId}`)
  return row
}

export async function submitFeeTemplateVersion(
  db: DbLike,
  organizationId: string,
  versionId: string,
  actor?: string,
): Promise<FeeTemplateVersionDto> {
  const row = await loadVersionRow(db, organizationId, versionId)
  if (row.status !== 'draft') throw new Error('仅草稿版本可提交审核')
  const now = new Date()
  await db
    .update(feeTemplateVersions)
    .set({
      status: 'in_review',
      published: false,
      submittedBy: actor?.trim() || 'console',
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(feeTemplateVersions.id, versionId))
  return mapVersion(await loadVersionRow(db, organizationId, versionId))
}

export async function publishFeeTemplateVersion(
  db: DbLike,
  organizationId: string,
  versionId: string,
  actor?: string,
  reviewNote?: string,
): Promise<FeeTemplateVersionDto> {
  const row = await loadVersionRow(db, organizationId, versionId)
  if (row.status !== 'draft' && row.status !== 'in_review') {
    throw new Error('仅草稿或审核中的版本可发布')
  }
  const now = new Date()
  await db
    .update(feeTemplateVersions)
    .set({
      status: 'published',
      published: true,
      reviewedBy: actor?.trim() || 'console',
      reviewedAt: now,
      reviewNote: reviewNote?.trim() || row.reviewNote,
      updatedAt: now,
    })
    .where(eq(feeTemplateVersions.id, versionId))
  // 发布后模板头自动启用
  await db
    .update(feeTemplates)
    .set({ status: 'active', updatedAt: now })
    .where(
      and(
        eq(feeTemplates.organizationId, organizationId),
        eq(feeTemplates.id, row.templateId),
        sql`${feeTemplates.status} <> 'disabled'`,
      ),
    )
  return mapVersion(await loadVersionRow(db, organizationId, versionId))
}

export async function rejectFeeTemplateVersion(
  db: DbLike,
  organizationId: string,
  versionId: string,
  reviewNote: string,
  actor?: string,
): Promise<FeeTemplateVersionDto> {
  const row = await loadVersionRow(db, organizationId, versionId)
  if (row.status !== 'in_review') throw new Error('仅审核中的版本可驳回')
  if (!reviewNote?.trim()) throw new Error('驳回必须填写审核意见')
  const now = new Date()
  await db
    .update(feeTemplateVersions)
    .set({
      status: 'draft',
      published: false,
      reviewedBy: actor?.trim() || 'console',
      reviewedAt: now,
      reviewNote: reviewNote.trim(),
      updatedAt: now,
    })
    .where(eq(feeTemplateVersions.id, versionId))
  return mapVersion(await loadVersionRow(db, organizationId, versionId))
}

export async function disableFeeTemplateVersion(
  db: DbLike,
  organizationId: string,
  versionId: string,
  actor?: string,
): Promise<FeeTemplateVersionDto> {
  const row = await loadVersionRow(db, organizationId, versionId)
  if (row.status !== 'published') throw new Error('仅已发布版本可停用')
  const now = new Date()
  await db
    .update(feeTemplateVersions)
    .set({
      status: 'disabled',
      published: false,
      reviewedBy: actor?.trim() || row.reviewedBy,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(feeTemplateVersions.id, versionId))
  return mapVersion(await loadVersionRow(db, organizationId, versionId))
}

export async function disableFeeTemplate(
  db: DbLike,
  organizationId: string,
  id: string,
): Promise<FeeTemplateDto> {
  return updateFeeTemplate(db, organizationId, id, { status: '停用' })
}

export async function duplicateFeeTemplate(
  db: DbLike,
  organizationId: string,
  id: string,
  newCode?: string,
): Promise<FeeTemplateDto> {
  const source = await getFeeTemplate(db, organizationId, id)
  if (!source) throw new Error(`费用模板不存在：${id}`)
  const code = (newCode?.trim() || `${source.code}_copy`).slice(0, 64)
  const created = await createFeeTemplate(db, organizationId, {
    code,
    name: `${source.name}（副本）`,
    platform: source.platform,
    country: source.country,
    fulfillmentPool: source.fulfillmentPool,
    fulfillmentLogistics: source.fulfillmentLogistics,
    type: source.type,
    status: '草稿',
    note: source.note,
    withDraftVersion: false,
  })
  const top = source.versions?.[0]
  if (top) {
    await createFeeTemplateVersion(db, organizationId, {
      templateId: created.id,
      components: top.components,
      formulaProfile: top.formulaProfile,
      priority: top.priority,
      note: `复制自 ${source.code} v${top.versionNo}`,
      reviewNeeded: true,
    })
  } else {
    await createFeeTemplateVersion(db, organizationId, { templateId: created.id })
  }
  const result = await getFeeTemplate(db, organizationId, created.id)
  if (!result) throw new Error('复制费用模板失败')
  return result
}

function inEffectiveRange(effectiveFrom: string, effectiveTo: string, asOf: string) {
  if (effectiveFrom && asOf < effectiveFrom) return false
  if (effectiveTo && asOf > effectiveTo) return false
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
export async function resolveFeeTemplateVersion(
  db: DbLike,
  organizationId: string,
  args: ResolveFeeTemplateInput,
): Promise<ResolvedFeeTemplateDto | null> {
  const asOf = (args.asOf && args.asOf.trim()) || new Date().toISOString().slice(0, 10)
  const type = toDbFeeType(args.type)
  const filters: SQL[] = [
    eq(feeTemplates.organizationId, organizationId),
    eq(feeTemplates.type, type),
    sql`lower(${feeTemplates.platform}) = ${args.platform.toLowerCase()}`,
    sql`upper(${feeTemplates.country}) = ${args.country.toUpperCase()}`,
    sql`${feeTemplates.status} <> 'disabled'`,
  ]
  if (args.templateCodeOrId) {
    filters.push(
      or(
        eq(feeTemplates.id, args.templateCodeOrId),
        eq(feeTemplates.code, args.templateCodeOrId),
      )!,
    )
  }
  const templates = await db
    .select()
    .from(feeTemplates)
    .where(and(...filters))

  let matched = templates
  if (args.fulfillmentPool) {
    matched = matched.filter(
      (row) => !row.fulfillmentPool || row.fulfillmentPool === args.fulfillmentPool,
    )
  }
  matched = matched.filter((row) =>
    logisticsMatch(row.fulfillmentLogistics ?? '', args.fulfillmentLogistics),
  )
  if (matched.length === 0) return null

  const matchRules = await db
    .select()
    .from(feeTemplateMatchRules)
    .where(
      and(
        eq(feeTemplateMatchRules.organizationId, organizationId),
        inArray(feeTemplateMatchRules.templateId, matched.map((row) => row.id)),
      ),
    )
  const categoryAncestorIds = args.categoryId
    ? await listCategoryAncestorIds(db, organizationId, args.categoryId)
    : []
  const selected = selectTemplatesByMatchRules(
    matched.map((row) => ({ id: row.id, platform: row.platform, country: row.country })),
    matchRules.map((rule) => ({
      templateId: rule.templateId,
      categoryId: rule.categoryId,
      hsCodePattern: rule.hsCodePattern,
      priority: rule.priority,
    })),
    {
      platform: args.platform,
      country: args.country,
      categoryId: args.categoryId,
      categoryAncestorIds,
      hsCode: args.hsCode,
    },
  )
  if (selected.length === 0) return null
  const selectedIds = new Set(selected.map((item) => item.template.id))
  matched = matched.filter((row) => selectedIds.has(row.id))

  const templateIds = matched.map((t) => t.id)
  const versions = await db
    .select()
    .from(feeTemplateVersions)
    .where(
      and(
        eq(feeTemplateVersions.organizationId, organizationId),
        inArray(feeTemplateVersions.templateId, templateIds),
        or(
          eq(feeTemplateVersions.status, 'published'),
          eq(feeTemplateVersions.published, true),
        )!,
      ),
    )

  const byId = new Map(matched.map((t) => [t.id, t]))
  const collect = (requireProfile: boolean) => {
    const candidates: ResolvedFeeTemplateDto[] = []
    for (const version of versions) {
      const template = byId.get(version.templateId)
      if (!template) continue
      const dtoVersion = mapVersion(version)
      if (dtoVersion.status !== 'published' && !dtoVersion.published) continue
      if (!inEffectiveRange(dtoVersion.effectiveFrom, dtoVersion.effectiveTo, asOf)) continue
      if (
        requireProfile &&
        args.formulaProfile &&
        dtoVersion.formulaProfile !== args.formulaProfile
      ) {
        continue
      }
      candidates.push({
        template: mapTemplateHeader(template),
        version: dtoVersion,
      })
    }
    candidates.sort((a, b) => {
      if (b.version.priority !== a.version.priority) return b.version.priority - a.version.priority
      return b.version.versionNo - a.version.versionNo
    })
    return candidates[0] ?? null
  }
  // 测算优先按 formulaProfile 命中，未命中再放宽（对齐原 store 行为）
  if (args.formulaProfile) {
    const strict = collect(true)
    if (strict) return strict
  }
  return collect(false)
}

export async function feeTemplateMeta() {
  return {
    headerStatuses: ['草稿', '启用', '停用'],
    versionStatuses: ['草稿', '审核中', '已发布', '已停用'],
    types: [
      { label: '进口税', value: 'import_tax' },
      { label: '平台费', value: 'platform_fee' },
      { label: '海运运费', value: 'ocean_freight' },
    ],
    fulfillmentPools: ['daraz_lk_sea_lot', 'lazada_cn_spot_xmn', 'lazada_cn_spot_sz'],
    fulfillmentLogistics: ['', 'FCL', 'LCL', 'AIR_DDP', 'FCL20', 'FCL40'],
    platforms: ['daraz', 'lazada'],
    countries: ['LK', 'MY', 'ID', 'TH', 'PH', 'VN'],
  }
}

function mapMatchRule(row: typeof feeTemplateMatchRules.$inferSelect): FeeTemplateMatchRuleDto {
  return {
    id: row.id,
    templateId: row.templateId,
    categoryId: row.categoryId,
    hsCodePattern: row.hsCodePattern ?? '',
    priority: row.priority,
    note: row.note ?? '',
  }
}

export async function listFeeTemplateMatchRules(
  db: DbLike,
  organizationId: string,
  templateId: string,
): Promise<FeeTemplateMatchRuleDto[]> {
  const rows = await db
    .select()
    .from(feeTemplateMatchRules)
    .where(
      and(
        eq(feeTemplateMatchRules.organizationId, organizationId),
        eq(feeTemplateMatchRules.templateId, templateId),
      ),
    )
    .orderBy(desc(feeTemplateMatchRules.priority))
  return rows.map(mapMatchRule)
}

export async function replaceFeeTemplateMatchRules(
  db: AppDatabase,
  organizationId: string,
  templateId: string,
  rules: Array<{ categoryId?: string | null; hsCodePattern?: string; priority?: number; note?: string }>,
): Promise<FeeTemplateMatchRuleDto[]> {
  const [header] = await db
    .select({ id: feeTemplates.id })
    .from(feeTemplates)
    .where(and(eq(feeTemplates.id, templateId), eq(feeTemplates.organizationId, organizationId)))
    .limit(1)
  if (!header) throw new Error('未找到费用模板')
  return db.transaction(async (tx) => {
    await tx
      .delete(feeTemplateMatchRules)
      .where(
        and(
          eq(feeTemplateMatchRules.organizationId, organizationId),
          eq(feeTemplateMatchRules.templateId, templateId),
        ),
      )
    if (rules.length) {
      await tx.insert(feeTemplateMatchRules).values(
        rules.map((rule) => ({
          id: createId(),
          organizationId,
          templateId,
          categoryId: rule.categoryId || null,
          hsCodePattern: rule.hsCodePattern?.replace(/[.\s]/g, '').toUpperCase() || null,
          priority: rule.priority ?? 10,
          note: rule.note ?? null,
        })),
      )
    }
    return listFeeTemplateMatchRules(tx, organizationId, templateId)
  })
}

export async function addFeeTemplateMatchRule(
  db: AppDatabase,
  organizationId: string,
  input: { templateId: string; categoryId?: string | null; hsCodePattern?: string; priority?: number; note?: string },
): Promise<FeeTemplateMatchRuleDto[]> {
  const existing = await listFeeTemplateMatchRules(db, organizationId, input.templateId)
  return replaceFeeTemplateMatchRules(db, organizationId, input.templateId, [
    ...existing.map((rule) => ({
      categoryId: rule.categoryId,
      hsCodePattern: rule.hsCodePattern,
      priority: rule.priority,
      note: rule.note,
    })),
    {
      categoryId: input.categoryId ?? null,
      hsCodePattern: input.hsCodePattern,
      priority: input.priority ?? 20,
      note: input.note,
    },
  ])
}
