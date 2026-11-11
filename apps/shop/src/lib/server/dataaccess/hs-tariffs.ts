/**
 * HS 税则主档。与 compliance_hs_rules（SLSI/阻断）分轨，不写商品行。
 * 平台级 organization_id 为空（owner_key=global）；租户覆盖 owner_key=organizationId。
 * 已发布（active）版本不可覆盖，变更须新建版本。软停用走 archived。
 * @see docs/design/multi-platform-pricing-calculator-ux-2026-11-11.md §12.3
 */
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { hsCodes, hsTariffVersions } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { normalizeHsCode } from '@workspace/freight'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export type HsCodeDto = {
  id: string
  scope: string
  ownerKey: string
  organizationId: string | null
  countryCode: string
  code: string
  normalizedCode: string
  description: string
  descriptionEn: string
  parentCode: string
  level: number | null
  unit: string
  status: string
  sourceType: string
}

export type HsTariffDto = {
  id: string
  scope: string
  ownerKey: string
  organizationId: string | null
  countryCode: string
  hsCode: string
  version: number
  status: string
  effectiveFrom: string
  effectiveTo: string
  currency: string
  formulaProfile: string
  upliftRule: Record<string, unknown> | null
  gdRate: number | null
  surchargeRate: number | null
  palRate: number | null
  cessRate: number | null
  exciseRate: number | null
  vatRate: number | null
  ssclRate: number | null
  gdSpecificAmount: number | null
  gdSpecificUnit: string
  gdSpecificRule: string
  cessSpecificAmount: number | null
  cessSpecificUnit: string
  isExact: boolean
  confidence: number | null
  notes: string
  sourceType: string
}

function mapCode(row: typeof hsCodes.$inferSelect): HsCodeDto {
  return {
    id: row.id,
    scope: row.scope,
    ownerKey: row.ownerKey,
    organizationId: row.organizationId,
    countryCode: row.countryCode,
    code: row.code,
    normalizedCode: row.normalizedCode,
    description: row.description,
    descriptionEn: row.descriptionEn ?? '',
    parentCode: row.parentCode ?? '',
    level: row.level,
    unit: row.unit ?? '',
    status: row.status,
    sourceType: row.sourceType,
  }
}

function mapTariff(row: typeof hsTariffVersions.$inferSelect): HsTariffDto {
  return {
    id: row.id,
    scope: row.scope,
    ownerKey: row.ownerKey,
    organizationId: row.organizationId,
    countryCode: row.countryCode,
    hsCode: row.hsCode,
    version: row.version,
    status: row.status,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : '',
    currency: row.currency,
    formulaProfile: row.formulaProfile ?? 'lk_cascade_v1',
    upliftRule: row.upliftRule ?? null,
    gdRate: num(row.gdRate),
    surchargeRate: num(row.surchargeRate),
    palRate: num(row.palRate),
    cessRate: num(row.cessRate),
    exciseRate: num(row.exciseRate),
    vatRate: num(row.vatRate),
    ssclRate: num(row.ssclRate),
    gdSpecificAmount: num(row.gdSpecificAmount),
    gdSpecificUnit: row.gdSpecificUnit ?? '',
    gdSpecificRule: row.gdSpecificRule ?? 'none',
    cessSpecificAmount: num(row.cessSpecificAmount),
    cessSpecificUnit: row.cessSpecificUnit ?? '',
    isExact: row.isExact,
    confidence: num(row.confidence),
    notes: row.notes ?? '',
    sourceType: row.sourceType,
  }
}

function ownerFor(organizationId: string, scope: 'global' | 'tenant') {
  return scope === 'global' ? 'global' : organizationId
}

export async function listHsTariffs(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; countryCode?: string; status?: string } = {},
): Promise<PaginatedResult<HsTariffDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const offset = (page - 1) * pageSize
  const filters: SQL[] = [
    or(eq(hsTariffVersions.ownerKey, organizationId), eq(hsTariffVersions.ownerKey, 'global'))!,
  ]
  if (input.countryCode) filters.push(eq(hsTariffVersions.countryCode, input.countryCode.toUpperCase()))
  if (input.status) filters.push(eq(hsTariffVersions.status, input.status))
  const term = input.q?.trim()
  if (term) {
    const pattern = `%${term}%`
    const search = or(ilike(hsTariffVersions.hsCode, pattern), ilike(hsTariffVersions.notes, pattern))
    if (search) filters.push(search)
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ value: count() }).from(hsTariffVersions).where(where)
  const rows = await db
    .select()
    .from(hsTariffVersions)
    .where(where)
    .orderBy(desc(hsTariffVersions.updatedAt))
    .limit(pageSize)
    .offset(offset)
  return { items: rows.map(mapTariff), total: Number(totalRow?.value ?? 0), page, pageSize }
}

export type UpsertHsTariffInput = {
  id?: string
  countryCode: string
  hsCode: string
  codeDisplay?: string
  description?: string
  effectiveFrom: string
  effectiveTo?: string
  currency?: string
  formulaProfile?: string
  gdRate?: number | null
  surchargeRate?: number | null
  palRate?: number | null
  cessRate?: number | null
  exciseRate?: number | null
  vatRate?: number | null
  ssclRate?: number | null
  gdSpecificAmount?: number | null
  gdSpecificUnit?: string
  gdSpecificRule?: string
  cessSpecificAmount?: number | null
  cessSpecificUnit?: string
  isExact?: boolean
  notes?: string
  actorUserId?: string
}

async function nextVersion(
  db: DbLike,
  ownerKey: string,
  countryCode: string,
  hsCode: string,
): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${hsTariffVersions.version}), 0)` })
    .from(hsTariffVersions)
    .where(
      and(
        eq(hsTariffVersions.ownerKey, ownerKey),
        eq(hsTariffVersions.countryCode, countryCode),
        eq(hsTariffVersions.hsCode, hsCode),
      ),
    )
  return Number(row?.value ?? 0) + 1
}

async function ensureHsCode(
  db: DbLike,
  organizationId: string,
  input: { countryCode: string; hsCode: string; codeDisplay?: string; description?: string; actorUserId?: string },
) {
  const [existing] = await db
    .select()
    .from(hsCodes)
    .where(
      and(
        eq(hsCodes.ownerKey, organizationId),
        eq(hsCodes.countryCode, input.countryCode),
        eq(hsCodes.normalizedCode, input.hsCode),
      ),
    )
    .limit(1)
  if (existing) return existing
  const id = createId()
  await db.insert(hsCodes).values({
    id,
    scope: 'tenant',
    ownerKey: organizationId,
    organizationId,
    countryCode: input.countryCode,
    code: input.codeDisplay?.trim() || input.hsCode,
    normalizedCode: input.hsCode,
    description: input.description?.trim() || '',
    status: 'active',
    sourceType: 'manual',
    createdBy: input.actorUserId,
    updatedBy: input.actorUserId,
  })
  const [row] = await db.select().from(hsCodes).where(eq(hsCodes.id, id)).limit(1)
  return row!
}

export async function createHsTariffDraft(
  db: AppDatabase,
  organizationId: string,
  input: UpsertHsTariffInput,
): Promise<HsTariffDto> {
  const countryCode = input.countryCode.trim().toUpperCase()
  const hsCode = normalizeHsCode(input.hsCode)
  if (!hsCode) throw new Error('请填写 HS 编码')
  if (!input.effectiveFrom) throw new Error('请填写生效日期')
  return db.transaction(async (tx) => {
    await ensureHsCode(tx, organizationId, {
      countryCode,
      hsCode,
      codeDisplay: input.codeDisplay,
      description: input.description,
      actorUserId: input.actorUserId,
    })
    const version = await nextVersion(tx, organizationId, countryCode, hsCode)
    const id = createId()
    await tx.insert(hsTariffVersions).values({
      id,
      scope: 'tenant',
      ownerKey: organizationId,
      organizationId,
      countryCode,
      hsCode,
      version,
      status: 'draft',
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      currency: (input.currency || 'LKR').toUpperCase(),
      formulaProfile: input.formulaProfile || 'lk_cascade_v1',
      gdRate: input.gdRate != null ? String(input.gdRate) : null,
      surchargeRate: input.surchargeRate != null ? String(input.surchargeRate) : null,
      palRate: input.palRate != null ? String(input.palRate) : null,
      cessRate: input.cessRate != null ? String(input.cessRate) : null,
      exciseRate: input.exciseRate != null ? String(input.exciseRate) : null,
      vatRate: input.vatRate != null ? String(input.vatRate) : null,
      ssclRate: input.ssclRate != null ? String(input.ssclRate) : null,
      gdSpecificAmount: input.gdSpecificAmount != null ? String(input.gdSpecificAmount) : null,
      gdSpecificUnit: input.gdSpecificUnit || null,
      gdSpecificRule: input.gdSpecificRule || 'none',
      cessSpecificAmount: input.cessSpecificAmount != null ? String(input.cessSpecificAmount) : null,
      cessSpecificUnit: input.cessSpecificUnit || null,
      isExact: input.isExact !== false,
      notes: input.notes ?? '',
      sourceType: 'manual',
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    })
    const [row] = await tx.select().from(hsTariffVersions).where(eq(hsTariffVersions.id, id)).limit(1)
    if (!row) throw new Error('创建税则草稿失败')
    return mapTariff(row)
  })
}

export async function updateHsTariffDraft(
  db: AppDatabase,
  organizationId: string,
  input: UpsertHsTariffInput & { id: string },
): Promise<HsTariffDto> {
  const [existing] = await db
    .select()
    .from(hsTariffVersions)
    .where(and(eq(hsTariffVersions.id, input.id), eq(hsTariffVersions.organizationId, organizationId)))
    .limit(1)
  if (!existing) throw new Error('未找到税则版本')
  if (existing.status !== 'draft') throw new Error('已发布或已归档的税则不可直接修改，请新建版本')
  const countryCode = (input.countryCode || existing.countryCode).trim().toUpperCase()
  const hsCode = normalizeHsCode(input.hsCode || existing.hsCode)
  await db
    .update(hsTariffVersions)
    .set({
      countryCode,
      hsCode,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : existing.effectiveFrom,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : existing.effectiveTo,
      currency: (input.currency || existing.currency).toUpperCase(),
      formulaProfile: input.formulaProfile || existing.formulaProfile,
      gdRate: input.gdRate != null ? String(input.gdRate) : existing.gdRate,
      surchargeRate: input.surchargeRate != null ? String(input.surchargeRate) : existing.surchargeRate,
      palRate: input.palRate != null ? String(input.palRate) : existing.palRate,
      cessRate: input.cessRate != null ? String(input.cessRate) : existing.cessRate,
      exciseRate: input.exciseRate != null ? String(input.exciseRate) : existing.exciseRate,
      vatRate: input.vatRate != null ? String(input.vatRate) : existing.vatRate,
      ssclRate: input.ssclRate != null ? String(input.ssclRate) : existing.ssclRate,
      gdSpecificAmount: input.gdSpecificAmount != null ? String(input.gdSpecificAmount) : existing.gdSpecificAmount,
      gdSpecificUnit: input.gdSpecificUnit ?? existing.gdSpecificUnit,
      gdSpecificRule: input.gdSpecificRule ?? existing.gdSpecificRule,
      cessSpecificAmount: input.cessSpecificAmount != null ? String(input.cessSpecificAmount) : existing.cessSpecificAmount,
      cessSpecificUnit: input.cessSpecificUnit ?? existing.cessSpecificUnit,
      isExact: input.isExact ?? existing.isExact,
      notes: input.notes ?? existing.notes,
      updatedBy: input.actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(hsTariffVersions.id, existing.id))
  const [row] = await db.select().from(hsTariffVersions).where(eq(hsTariffVersions.id, existing.id)).limit(1)
  if (!row) throw new Error('更新税则草稿失败')
  return mapTariff(row)
}

export async function setHsTariffStatus(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; status: 'draft' | 'active' | 'archived'; actorUserId?: string },
): Promise<HsTariffDto> {
  const [existing] = await db
    .select()
    .from(hsTariffVersions)
    .where(and(eq(hsTariffVersions.id, input.id), eq(hsTariffVersions.organizationId, organizationId)))
    .limit(1)
  if (!existing) throw new Error('未找到税则版本')
  // 平台级行不属于租户，禁止租户改状态
  if (existing.ownerKey !== organizationId) throw new Error('不能修改平台级税则')
  const publishedAt = input.status === 'active' ? new Date() : existing.publishedAt
  await db
    .update(hsTariffVersions)
    .set({
      status: input.status,
      publishedAt,
      publishedBy: input.status === 'active' ? input.actorUserId ?? existing.publishedBy : existing.publishedBy,
      updatedBy: input.actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(hsTariffVersions.id, existing.id))
  const [row] = await db.select().from(hsTariffVersions).where(eq(hsTariffVersions.id, existing.id)).limit(1)
  if (!row) throw new Error('更新税则状态失败')
  return mapTariff(row)
}

function inRange(from: Date, to: Date | null, asOf: Date) {
  if (from > asOf) return false
  if (to && to < asOf) return false
  return true
}

/** 精确匹配 HS + 目的国；租户覆盖优先于平台级。不回退父码税率。 */
export async function resolveHsTariff(
  db: DbLike,
  organizationId: string,
  input: { hsCode: string; countryCode: string; asOf?: string },
): Promise<HsTariffDto | null> {
  const hsCode = normalizeHsCode(input.hsCode)
  const countryCode = input.countryCode.trim().toUpperCase()
  if (!hsCode || !countryCode) return null
  const asOf = input.asOf ? new Date(input.asOf) : new Date()
  const rows = await db
    .select()
    .from(hsTariffVersions)
    .where(
      and(
        eq(hsTariffVersions.hsCode, hsCode),
        eq(hsTariffVersions.countryCode, countryCode),
        eq(hsTariffVersions.status, 'active'),
        or(eq(hsTariffVersions.ownerKey, organizationId), eq(hsTariffVersions.ownerKey, 'global'))!,
      ),
    )
    .orderBy(desc(hsTariffVersions.effectiveFrom), desc(hsTariffVersions.version))
  const effective = rows.filter((r) => inRange(r.effectiveFrom, r.effectiveTo, asOf))
  const tenant = effective.find((r) => r.ownerKey === organizationId)
  const global = effective.find((r) => r.ownerKey === 'global')
  const picked = tenant ?? global
  return picked ? mapTariff(picked) : null
}

export { mapCode, mapTariff, ownerFor }
