import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { hsCodes, hsTariffVersions } from '@workspace/db'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export const TARIFF_COUNTRIES = ['LK', 'MY', 'SG', 'TH', 'VN', 'ID', 'PH'] as const
export const TARIFF_CURRENCIES: Record<string, string> = {
  LK: 'LKR',
  MY: 'MYR',
  SG: 'SGD',
  TH: 'THB',
  VN: 'VND',
  ID: 'IDR',
  PH: 'PHP',
}

export function normalizeHsCode(value: string) {
  return value.replace(/[.\s-]/g, '').toUpperCase()
}

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function toNumeric(value: number | null | undefined) {
  return value == null ? null : String(value)
}

export type PlatformHsTariffItem = {
  id: string
  hsCodeId: string | null
  countryCode: string
  code: string
  description: string
  hsCode: string
  version: number
  status: 'draft' | 'active' | 'archived'
  effectiveFrom: string
  effectiveTo: string
  currency: string
  formulaProfile: string
  components: Record<string, unknown>
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
  notes: string
  referenced: boolean
  updatedAt: Date
}

export type PlatformHsTariffInput = {
  countryCode: string
  code?: string
  description?: string
  hsCode: string
  effectiveFrom: string
  effectiveTo?: string
  currency?: string
  formulaProfile?: string
  components?: Record<string, unknown>
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
}

async function referencedIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await db
    .selectDistinct({ sourceId: hsTariffVersions.sourceId })
    .from(hsTariffVersions)
    .where(and(eq(hsTariffVersions.scope, 'tenant'), inArray(hsTariffVersions.sourceId, ids)))
  return new Set(rows.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))
}

function mapRow(
  row: typeof hsTariffVersions.$inferSelect,
  code: { id: string; code: string; description: string } | undefined,
  referenced: boolean,
): PlatformHsTariffItem {
  return {
    id: row.id,
    hsCodeId: code?.id ?? null,
    countryCode: row.countryCode,
    code: code?.code || row.hsCode,
    description: code?.description || '',
    hsCode: row.hsCode,
    version: row.version,
    status: row.status === 'active' ? 'active' : row.status === 'archived' ? 'archived' : 'draft',
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : '',
    currency: row.currency,
    formulaProfile: row.formulaProfile ?? '',
    components: row.components ?? {},
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
    notes: row.notes ?? '',
    referenced,
    updatedAt: row.updatedAt,
  }
}

export async function listPlatformHsTariffs(input: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
  countryCode?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = [eq(hsTariffVersions.ownerKey, 'global')]
  if (input.status === 'draft' || input.status === 'active' || input.status === 'archived') {
    filters.push(eq(hsTariffVersions.status, input.status))
  }
  if (input.countryCode?.trim()) {
    filters.push(eq(hsTariffVersions.countryCode, input.countryCode.trim().toUpperCase()))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(or(ilike(hsTariffVersions.hsCode, value), ilike(hsTariffVersions.notes, value))!)
  }
  const where = and(...filters)
  const totalRows = await db.select({ total: count() }).from(hsTariffVersions).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const rows = await db
    .select()
    .from(hsTariffVersions)
    .where(where)
    .orderBy(hsTariffVersions.countryCode, hsTariffVersions.hsCode, desc(hsTariffVersions.version))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const codes = await db.select().from(hsCodes).where(eq(hsCodes.ownerKey, 'global'))
  const codeMap = new Map(codes.map((row) => [`${row.countryCode}:${row.normalizedCode}`, row]))
  const referenced = await referencedIds(rows.map((row) => row.id))
  return {
    items: rows.map((row) =>
      mapRow(row, codeMap.get(`${row.countryCode}:${row.hsCode}`), referenced.has(row.id)),
    ),
    total,
    page,
    pageSize,
  }
}

function normalizeInput(input: PlatformHsTariffInput) {
  const countryCode = input.countryCode.trim().toUpperCase()
  if (!TARIFF_COUNTRIES.includes(countryCode as (typeof TARIFF_COUNTRIES)[number])) {
    throw new Error('目前仅支持 LK / MY / SG / TH / VN / ID / PH 的税则结构，不提供 PK / BD / NP / MM 税栈')
  }
  const hsCode = normalizeHsCode(input.hsCode)
  if (!/^[0-9]{4,14}$/.test(hsCode)) {
    throw new Error('HS 编码应为 4–14 位数字（可带点号，将自动规范化）')
  }
  if (!input.effectiveFrom?.trim()) throw new Error('请填写生效日期')
  return {
    countryCode,
    code: input.code?.trim() || hsCode,
    description: input.description?.trim() || '',
    hsCode,
    effectiveFrom: new Date(input.effectiveFrom),
    effectiveTo: input.effectiveTo?.trim() ? new Date(input.effectiveTo) : null,
    currency: (input.currency?.trim() || TARIFF_CURRENCIES[countryCode] || 'USD').toUpperCase(),
    formulaProfile: input.formulaProfile?.trim() || '',
    components: input.components ?? {},
    gdRate: toNumeric(input.gdRate ?? null),
    surchargeRate: toNumeric(input.surchargeRate ?? null),
    palRate: toNumeric(input.palRate ?? null),
    cessRate: toNumeric(input.cessRate ?? null),
    exciseRate: toNumeric(input.exciseRate ?? null),
    vatRate: toNumeric(input.vatRate ?? null),
    ssclRate: toNumeric(input.ssclRate ?? null),
    gdSpecificAmount: toNumeric(input.gdSpecificAmount ?? null),
    gdSpecificUnit: input.gdSpecificUnit?.trim() || null,
    gdSpecificRule: input.gdSpecificRule?.trim() || 'none',
    cessSpecificAmount: toNumeric(input.cessSpecificAmount ?? null),
    cessSpecificUnit: input.cessSpecificUnit?.trim() || null,
    isExact: input.isExact !== false,
    notes: input.notes?.trim() || '',
  }
}

async function ensureGlobalHsCode(input: {
  countryCode: string
  hsCode: string
  code: string
  description: string
}) {
  const [existing] = await db
    .select()
    .from(hsCodes)
    .where(
      and(
        eq(hsCodes.ownerKey, 'global'),
        eq(hsCodes.countryCode, input.countryCode),
        eq(hsCodes.normalizedCode, input.hsCode),
      ),
    )
    .limit(1)
  if (existing) {
    if (input.description && input.description !== existing.description) {
      await db
        .update(hsCodes)
        .set({ description: input.description, code: input.code, updatedAt: new Date() })
        .where(eq(hsCodes.id, existing.id))
    }
    return existing
  }
  const id = createId()
  const [row] = await db
    .insert(hsCodes)
    .values({
      id,
      scope: 'global',
      ownerKey: 'global',
      organizationId: null,
      countryCode: input.countryCode,
      code: input.code,
      normalizedCode: input.hsCode,
      description: input.description,
      status: 'active',
      sourceType: 'manual',
    })
    .returning()
  if (!row) throw new Error('保存 HS 编码失败')
  return row
}

async function nextVersion(countryCode: string, hsCode: string) {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${hsTariffVersions.version}), 0)` })
    .from(hsTariffVersions)
    .where(
      and(
        eq(hsTariffVersions.ownerKey, 'global'),
        eq(hsTariffVersions.countryCode, countryCode),
        eq(hsTariffVersions.hsCode, hsCode),
      ),
    )
  return Number(row?.value ?? 0) + 1
}

async function loadMapped(id: string): Promise<PlatformHsTariffItem> {
  const [row] = await db.select().from(hsTariffVersions).where(eq(hsTariffVersions.id, id)).limit(1)
  if (!row) throw new Error('税则版本不存在')
  const [code] = await db
    .select()
    .from(hsCodes)
    .where(
      and(
        eq(hsCodes.ownerKey, 'global'),
        eq(hsCodes.countryCode, row.countryCode),
        eq(hsCodes.normalizedCode, row.hsCode),
      ),
    )
    .limit(1)
  const referenced = await referencedIds([row.id])
  return mapRow(row, code, referenced.has(row.id))
}

export async function createPlatformHsTariff(input: PlatformHsTariffInput) {
  const values = normalizeInput(input)
  await ensureGlobalHsCode(values)
  const version = await nextVersion(values.countryCode, values.hsCode)
  const [row] = await db
    .insert(hsTariffVersions)
    .values({
      id: createId(),
      scope: 'global',
      ownerKey: 'global',
      organizationId: null,
      countryCode: values.countryCode,
      hsCode: values.hsCode,
      version,
      status: 'draft',
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo,
      currency: values.currency,
      formulaProfile: values.formulaProfile || null,
      components: values.components,
      gdRate: values.gdRate,
      surchargeRate: values.surchargeRate,
      palRate: values.palRate,
      cessRate: values.cessRate,
      exciseRate: values.exciseRate,
      vatRate: values.vatRate,
      ssclRate: values.ssclRate,
      gdSpecificAmount: values.gdSpecificAmount,
      gdSpecificUnit: values.gdSpecificUnit,
      gdSpecificRule: values.gdSpecificRule,
      cessSpecificAmount: values.cessSpecificAmount,
      cessSpecificUnit: values.cessSpecificUnit,
      isExact: values.isExact,
      notes: values.notes,
      sourceType: 'manual',
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return loadMapped(row.id)
}

export async function updatePlatformHsTariff(input: { id: string } & PlatformHsTariffInput) {
  const [existing] = await db
    .select()
    .from(hsTariffVersions)
    .where(and(eq(hsTariffVersions.id, input.id), eq(hsTariffVersions.ownerKey, 'global')))
    .limit(1)
  if (!existing) throw new Error('税则目录项不存在')
  if (existing.status !== 'draft') throw new Error('已发布或已归档的税则不可直接修改，请新建版本或先改为草稿')
  const values = normalizeInput(input)
  await ensureGlobalHsCode(values)
  await db
    .update(hsTariffVersions)
    .set({
      countryCode: values.countryCode,
      hsCode: values.hsCode,
      effectiveFrom: values.effectiveFrom,
      effectiveTo: values.effectiveTo,
      currency: values.currency,
      formulaProfile: values.formulaProfile || existing.formulaProfile,
      components: values.components,
      gdRate: values.gdRate,
      surchargeRate: values.surchargeRate,
      palRate: values.palRate,
      cessRate: values.cessRate,
      exciseRate: values.exciseRate,
      vatRate: values.vatRate,
      ssclRate: values.ssclRate,
      gdSpecificAmount: values.gdSpecificAmount,
      gdSpecificUnit: values.gdSpecificUnit,
      gdSpecificRule: values.gdSpecificRule,
      cessSpecificAmount: values.cessSpecificAmount,
      cessSpecificUnit: values.cessSpecificUnit,
      isExact: values.isExact,
      notes: values.notes,
      updatedAt: new Date(),
    })
    .where(eq(hsTariffVersions.id, existing.id))
  return loadMapped(existing.id)
}

export async function setPlatformHsTariffStatus(input: {
  id: string
  status: 'draft' | 'active' | 'archived'
}) {
  const [existing] = await db
    .select()
    .from(hsTariffVersions)
    .where(and(eq(hsTariffVersions.id, input.id), eq(hsTariffVersions.ownerKey, 'global')))
    .limit(1)
  if (!existing) throw new Error('税则目录项不存在')
  const now = new Date()
  await db
    .update(hsTariffVersions)
    .set({
      status: input.status,
      publishedAt: input.status === 'active' ? now : existing.publishedAt,
      updatedAt: now,
    })
    .where(eq(hsTariffVersions.id, existing.id))
  return loadMapped(existing.id)
}

export async function deletePlatformHsTariff(id: string) {
  const [existing] = await db
    .select()
    .from(hsTariffVersions)
    .where(and(eq(hsTariffVersions.id, id), eq(hsTariffVersions.ownerKey, 'global')))
    .limit(1)
  if (!existing) throw new Error('税则目录项不存在')
  const referenced = await referencedIds([id])
  if (referenced.has(id)) {
    throw new Error('已有组织引用此税则，请改为归档停用，不能删除')
  }
  await db.delete(hsTariffVersions).where(eq(hsTariffVersions.id, id))
  return { id }
}
