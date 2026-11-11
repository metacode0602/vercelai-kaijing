/**
 * 定价建议草稿：按 SKU + 平台 + 站点追加版本，保留历史；软归档。
 * 不写入 listings.price_amount / products.payload / product_variants.attrs。
 * @see docs/design/multi-platform-pricing-calculator-ux-2026-11-11.md §10 / §12.3
 */
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { pricingSuggestionDrafts } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { getSkuByCode } from '@/lib/server/dataaccess/products'
import {
  planDraftArchive,
  planDraftSave,
  type PricingDraftStatus,
} from '@/lib/crossborder/pricing-draft-versioning'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type PricingSuggestionDraftSource = 'calculator' | 'listing_fill' | 'batch'

export type PricingSuggestionDraftDto = {
  id: string
  variantId: string
  sku: string
  platform: string
  site: string
  versionNo: number
  status: PricingDraftStatus
  suggestedRetail: number
  suggestedFreeShipping: number | null
  currency: string
  isEstimate: boolean
  snapshot: Record<string, unknown>
  source: PricingSuggestionDraftSource
  createdBy: string | null
  archivedAt: string | null
  archivedBy: string | null
  createdAt: string
  updatedAt: string
}

function mapDraft(row: typeof pricingSuggestionDrafts.$inferSelect): PricingSuggestionDraftDto {
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.sku,
    platform: row.platform,
    site: row.site,
    versionNo: row.versionNo,
    status: row.status as PricingDraftStatus,
    suggestedRetail: Number(row.suggestedRetail),
    suggestedFreeShipping: row.suggestedFreeShipping != null ? Number(row.suggestedFreeShipping) : null,
    currency: row.currency,
    isEstimate: Boolean(row.isEstimate),
    snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
    source: row.source as PricingSuggestionDraftSource,
    createdBy: row.createdBy ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    archivedBy: row.archivedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function loadVersions(
  db: DbLike,
  organizationId: string,
  variantId: string,
  platform: string,
  site: string,
) {
  return db
    .select()
    .from(pricingSuggestionDrafts)
    .where(
      and(
        eq(pricingSuggestionDrafts.organizationId, organizationId),
        eq(pricingSuggestionDrafts.variantId, variantId),
        sql`lower(${pricingSuggestionDrafts.platform}) = ${platform.toLowerCase()}`,
        sql`upper(${pricingSuggestionDrafts.site}) = ${site.toUpperCase()}`,
      ),
    )
    .orderBy(desc(pricingSuggestionDrafts.versionNo))
}

export type SavePricingDraftInput = {
  sku: string
  platform: string
  site: string
  suggestedRetail: number
  suggestedFreeShipping?: number | null
  currency: string
  isEstimate?: boolean
  snapshot?: Record<string, unknown>
  source: PricingSuggestionDraftSource
}

export async function savePricingSuggestionDraft(
  db: AppDatabase,
  organizationId: string,
  input: SavePricingDraftInput,
  actorId?: string | null,
): Promise<PricingSuggestionDraftDto> {
  if (!Number.isFinite(input.suggestedRetail) || input.suggestedRetail <= 0) {
    throw new Error('建议零售价无效，无法保存草稿')
  }
  const sku = await getSkuByCode(db, organizationId, input.sku)
  if (!sku) throw new Error(`未找到 SKU ${input.sku}`)
  const platform = input.platform.trim().toLowerCase()
  const site = input.site.trim().toUpperCase()
  return db.transaction(async (tx) => {
    const existing = await loadVersions(tx, organizationId, sku.id, platform, site)
    const plan = planDraftSave(
      existing.map((row) => ({ id: row.id, versionNo: row.versionNo, status: row.status as PricingDraftStatus })),
    )
    if (plan.supersedeIds.length) {
      await tx
        .update(pricingSuggestionDrafts)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(
          and(
            eq(pricingSuggestionDrafts.organizationId, organizationId),
            inArray(pricingSuggestionDrafts.id, plan.supersedeIds),
          ),
        )
    }
    const id = createId()
    await tx.insert(pricingSuggestionDrafts).values({
      id,
      organizationId,
      variantId: sku.id,
      sku: sku.sku,
      platform,
      site,
      versionNo: plan.nextVersionNo,
      status: 'current',
      suggestedRetail: String(input.suggestedRetail),
      suggestedFreeShipping:
        input.suggestedFreeShipping != null ? String(input.suggestedFreeShipping) : null,
      currency: input.currency.trim().toUpperCase(),
      isEstimate: Boolean(input.isEstimate),
      snapshot: input.snapshot ?? {},
      source: input.source,
      createdBy: actorId ?? null,
    })
    const [row] = await tx
      .select()
      .from(pricingSuggestionDrafts)
      .where(eq(pricingSuggestionDrafts.id, id))
      .limit(1)
    if (!row) throw new Error('保存定价建议草稿失败')
    return mapDraft(row)
  })
}

export async function listPricingSuggestionHistory(
  db: AppDatabase,
  organizationId: string,
  input: { sku: string; platform: string; site: string; includeArchived?: boolean },
): Promise<PricingSuggestionDraftDto[]> {
  const sku = await getSkuByCode(db, organizationId, input.sku)
  if (!sku) return []
  const rows = await loadVersions(db, organizationId, sku.id, input.platform, input.site)
  return rows
    .filter((row) => input.includeArchived || row.status !== 'archived')
    .map(mapDraft)
}

export async function listPricingSuggestionDrafts(
  db: AppDatabase,
  organizationId: string,
  input: {
    sku?: string
    platform?: string
    site?: string
    includeArchived?: boolean
    page?: number
    pageSize?: number
  } = {},
): Promise<PaginatedResult<PricingSuggestionDraftDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters = [eq(pricingSuggestionDrafts.organizationId, organizationId)]
  if (!input.includeArchived) {
    filters.push(sql`${pricingSuggestionDrafts.status} <> 'archived'`)
  }
  if (input.sku?.trim()) {
    const sku = await getSkuByCode(db, organizationId, input.sku.trim())
    if (!sku) return { items: [], total: 0, page, pageSize }
    filters.push(eq(pricingSuggestionDrafts.variantId, sku.id))
  }
  if (input.platform?.trim()) {
    filters.push(sql`lower(${pricingSuggestionDrafts.platform}) = ${input.platform.trim().toLowerCase()}`)
  }
  if (input.site?.trim()) {
    filters.push(sql`upper(${pricingSuggestionDrafts.site}) = ${input.site.trim().toUpperCase()}`)
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ n: count() }).from(pricingSuggestionDrafts).where(where)
  const rows = await db
    .select()
    .from(pricingSuggestionDrafts)
    .where(where)
    .orderBy(desc(pricingSuggestionDrafts.createdAt), desc(pricingSuggestionDrafts.versionNo))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map(mapDraft),
    total: Number(totalRow?.n ?? 0),
    page,
    pageSize,
  }
}

export async function archivePricingSuggestionDrafts(
  db: AppDatabase,
  organizationId: string,
  input: { sku: string; platform: string; site: string },
  actorId?: string | null,
): Promise<{ archivedCount: number }> {
  const sku = await getSkuByCode(db, organizationId, input.sku)
  if (!sku) throw new Error(`未找到 SKU ${input.sku}`)
  const existing = await loadVersions(db, organizationId, sku.id, input.platform, input.site)
  const plan = planDraftArchive(
    existing.map((row) => ({ id: row.id, versionNo: row.versionNo, status: row.status as PricingDraftStatus })),
  )
  if (plan.archiveIds.length === 0) return { archivedCount: 0 }
  await db
    .update(pricingSuggestionDrafts)
    .set({
      status: 'archived',
      archivedAt: new Date(),
      archivedBy: actorId ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pricingSuggestionDrafts.organizationId, organizationId),
        inArray(pricingSuggestionDrafts.id, plan.archiveIds),
      ),
    )
  return { archivedCount: plan.archiveIds.length }
}
