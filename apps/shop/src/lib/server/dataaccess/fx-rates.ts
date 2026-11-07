/**
 * fx_rates（F33）— 组织隔离汇率；历史不覆盖删除，软停用。
 */
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { fxRates } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
import { validateFxRateInput } from '@/lib/settings/fx-rate-rules'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type FxRateDto = {
  id: string
  platform: string
  marketplace: string
  marketplaceCode: string
  baseCurrency: string
  quoteCurrency: string
  rate: number
  effectiveDate: string
  source: string
  status: '启用' | '停用'
  dbStatus: string
  note: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: typeof fxRates.$inferSelect): FxRateDto {
  const rate = Number(row.rate)
  return {
    id: row.id,
    platform: row.platform || '',
    marketplace: row.marketplaceCode || '',
    marketplaceCode: row.marketplaceCode || '',
    baseCurrency: row.baseCurrency,
    quoteCurrency: row.quoteCurrency,
    rate: Number.isFinite(rate) ? rate : 0,
    effectiveDate: row.effectiveDate,
    source: row.source,
    status: row.status === 'disabled' ? '停用' : '启用',
    dbStatus: row.status,
    note: row.note ?? '',
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatStamp(row.updatedAt),
  }
}

export async function listFxRates(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; platform?: string; includeDisabled?: boolean } = {},
): Promise<PaginatedResult<FxRateDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(fxRates.organizationId, organizationId)]
  if (!input.includeDisabled) {
    filters.push(eq(fxRates.status, 'active'))
  }
  if (input.platform?.trim()) {
    filters.push(eq(fxRates.platform, input.platform.trim()))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(fxRates.platform, q),
        ilike(fxRates.marketplaceCode, q),
        ilike(fxRates.baseCurrency, q),
        ilike(fxRates.quoteCurrency, q),
        ilike(fxRates.source, q),
        ilike(fxRates.note, q),
      )!,
    )
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(fxRates).where(where)
  const rows = await db
    .select()
    .from(fxRates)
    .where(where)
    .orderBy(desc(fxRates.effectiveDate), desc(fxRates.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items: rows.map(mapRow), total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function getFxRate(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.organizationId, organizationId), eq(fxRates.id, id)))
    .limit(1)
  return row ? mapRow(row) : null
}

export async function createFxRate(
  db: DbLike,
  organizationId: string,
  input: {
    platform?: string
    marketplaceCode?: string
    baseCurrency: string
    quoteCurrency: string
    rate: number | string
    effectiveDate: string
    source?: string
    note?: string
    actorUserId?: string
    actorLabel?: string
  },
) {
  const v = validateFxRateInput(input)
  const id = createId()
  const now = new Date()
  await db.insert(fxRates).values({
    id,
    organizationId,
    platform: v.platform,
    marketplaceCode: v.marketplaceCode,
    baseCurrency: v.baseCurrency,
    quoteCurrency: v.quoteCurrency,
    rate: v.rate,
    effectiveDate: v.effectiveDate,
    source: v.source,
    status: 'active',
    note: v.note,
    createdAt: now,
    updatedAt: now,
  })
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'fx_rate.create',
    entityType: 'fx_rate',
    entityId: id,
    result: 'ok',
    detail: `${v.baseCurrency}/${v.quoteCurrency} @ ${v.rate} (${v.effectiveDate})`,
    after: { ...v, id },
  })
  return getFxRate(db as AppDatabase, organizationId, id)
}

export async function updateFxRate(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    platform?: string
    marketplaceCode?: string
    baseCurrency?: string
    quoteCurrency?: string
    rate?: number | string
    effectiveDate?: string
    source?: string
    note?: string
    actorUserId?: string
    actorLabel?: string
  },
) {
  const existing = await getFxRate(db as AppDatabase, organizationId, input.id)
  if (!existing) throw new Error('汇率不存在')
  const v = validateFxRateInput({
    platform: input.platform ?? existing.platform,
    marketplaceCode: input.marketplaceCode ?? existing.marketplaceCode,
    baseCurrency: input.baseCurrency ?? existing.baseCurrency,
    quoteCurrency: input.quoteCurrency ?? existing.quoteCurrency,
    rate: input.rate ?? existing.rate,
    effectiveDate: input.effectiveDate ?? existing.effectiveDate,
    source: input.source ?? existing.source,
    note: input.note ?? existing.note,
  })
  await db
    .update(fxRates)
    .set({
      platform: v.platform,
      marketplaceCode: v.marketplaceCode,
      baseCurrency: v.baseCurrency,
      quoteCurrency: v.quoteCurrency,
      rate: v.rate,
      effectiveDate: v.effectiveDate,
      source: v.source,
      note: v.note,
      updatedAt: new Date(),
    })
    .where(and(eq(fxRates.organizationId, organizationId), eq(fxRates.id, input.id)))
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'fx_rate.update',
    entityType: 'fx_rate',
    entityId: input.id,
    result: 'ok',
    detail: `更新 ${v.baseCurrency}/${v.quoteCurrency}`,
    before: existing as unknown as Record<string, unknown>,
    after: v,
  })
  return getFxRate(db as AppDatabase, organizationId, input.id)
}

/** Soft-disable (preferred over hard delete). */
export async function setFxRateActive(
  db: DbLike,
  organizationId: string,
  input: { id: string; active: boolean; actorUserId?: string; actorLabel?: string },
) {
  const existing = await getFxRate(db as AppDatabase, organizationId, input.id)
  if (!existing) throw new Error('汇率不存在')
  const status = input.active ? 'active' : 'disabled'
  await db
    .update(fxRates)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(fxRates.organizationId, organizationId), eq(fxRates.id, input.id)))
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: input.active ? 'fx_rate.enable' : 'fx_rate.disable',
    entityType: 'fx_rate',
    entityId: input.id,
    result: 'ok',
    detail: input.active ? '启用汇率' : '软停用汇率（历史行保留）',
  })
  return getFxRate(db as AppDatabase, organizationId, input.id)
}


export type FxImportRowInput = {
  platform?: string
  marketplaceCode?: string
  baseCurrency: string
  quoteCurrency: string
  rate: number | string
  effectiveDate: string
  note?: string
}

export async function importFxRateRows(
  db: AppDatabase,
  organizationId: string,
  input: {
    rows: FxImportRowInput[]
    actorUserId?: string
    actorLabel?: string
  },
) {
  if (!input.rows.length) throw new Error('没有可导入的行')
  let success = 0
  const errors: Array<{ index: number; message: string }> = []
  // 逐行提交：单行失败不影响其它行（避免 PG 事务因一行错误整批回滚）
  for (let i = 0; i < input.rows.length; i += 1) {
    const row = input.rows[i]!
    try {
      await createFxRate(db, organizationId, {
        ...row,
        source: 'import',
        actorUserId: input.actorUserId,
        actorLabel: input.actorLabel,
      })
      success += 1
    } catch (error) {
      errors.push({
        index: i + 1,
        message: error instanceof Error ? error.message : '导入失败',
      })
    }
  }
  return {
    total: input.rows.length,
    success,
    failed: errors.length,
    errors: errors.slice(0, 20),
    note:
      errors.length === 0
        ? `已导入 ${success} 条汇率（source=import）。`
        : `成功 ${success} 条，失败 ${errors.length} 条（失败行未写入）。`,
  }
}

/** 按币对 + asOf 解析最新有效汇率（effectiveDate <= asOf）。 */
export async function resolveFxRate(
  db: AppDatabase,
  organizationId: string,
  input: {
    baseCurrency: string
    quoteCurrency: string
    asOf?: string
    platform?: string
  },
): Promise<FxRateDto | null> {
  const base = input.baseCurrency.trim().toUpperCase()
  const quote = input.quoteCurrency.trim().toUpperCase()
  const asOf = (input.asOf || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const filters: SQL[] = [
    eq(fxRates.organizationId, organizationId),
    eq(fxRates.status, 'active'),
    eq(fxRates.baseCurrency, base),
    eq(fxRates.quoteCurrency, quote),
    sql`${fxRates.effectiveDate} <= ${asOf}`,
  ]
  if (input.platform?.trim()) {
    filters.push(eq(fxRates.platform, input.platform.trim()))
  }
  const [row] = await db
    .select()
    .from(fxRates)
    .where(and(...filters)!)
    .orderBy(desc(fxRates.effectiveDate), desc(fxRates.createdAt))
    .limit(1)
  return row ? mapRow(row) : null
}
