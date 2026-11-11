/**
 * pending_actions（模块16）— 待审队列。
 * 确认/拒绝：
 * - listing_submit（mode=create）：确认后由 payload 创建本地刊登（草稿）；缺字段先补全。
 * - listing_submit（mode=link）：关联已有刊登；拒绝时回退刊登状态到草稿。
 * - 其他 kind：只改站内状态。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { listings, pendingActions, shops } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import * as listingsDa from '@/lib/server/dataaccess/listings'

const KIND_LABEL: Record<string, string> = {
  sourcing_upsert: '选品入库',
  listing_submit: '刊登提交',
  price_change: '改价',
  inventory_push: '库存推送',
  settlement_post: '结算过账',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审',
  confirmed: '已确认',
  executing: '执行中',
  failed: '失败',
  cancelled: '已拒绝',
  expired: '已过期',
}

export type PendingActionDto = {
  id: string
  kind: string
  kindLabel: string
  title: string
  status: string
  statusLabel: string
  shopId: string | null
  shop: string
  createdBy: string
  expiresAt: string
  confirmedBy: string | null
  confirmedAt: string
  lastError: string
  createdAt: string
  updatedAt: string
  /** listing_submit：create=确认后创建本地刊登；link=关联已有刊登。 */
  mode: string | null
  /** listing_submit 关联/生成的本地刊登 ID。 */
  listingId: string | null
  /** mode=create 且待审时的必填补全字段（中文标签）。 */
  missingFields: string[]
}

function readPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

const CREATE_REQUIRED: Array<[string, string]> = [
  ['shopId', '店铺'],
  ['sku', '内部 SKU'],
  ['sellerSku', 'Seller SKU'],
  ['title', '标题'],
  ['sellPrice', '售价'],
]

function missingCreateFields(payload: Record<string, unknown>): string[] {
  const missing: string[] = []
  for (const [key, label] of CREATE_REQUIRED) {
    const value = payload[key]
    if (key === 'sellPrice') {
      if (!(Number(value) > 0)) missing.push(label)
      continue
    }
    if (typeof value !== 'string' || !value.trim()) missing.push(label)
  }
  return missing
}

function mapRow(
  row: typeof pendingActions.$inferSelect,
  shopName: string | null,
): PendingActionDto {
  const payload = readPayload(row.payload)
  const mode = typeof payload.mode === 'string' ? payload.mode : null
  const listingId = typeof payload.listingId === 'string' ? payload.listingId : null
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: KIND_LABEL[row.kind] ?? row.kind,
    title: row.title,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status] ?? row.status,
    shopId: row.shopId,
    shop: shopName || '—',
    createdBy: row.createdBy || '—',
    expiresAt: formatStamp(row.expiresAt),
    confirmedBy: row.confirmedBy,
    confirmedAt: formatStamp(row.confirmedAt),
    lastError: row.lastErrorMessage || row.error || '',
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatStamp(row.updatedAt),
    mode,
    listingId,
    missingFields:
      row.kind === 'listing_submit' && row.status === 'pending' && mode !== 'link'
        ? missingCreateFields(payload)
        : [],
  }
}

export async function listPendingActions(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    kind?: string
    status?: string
    shopId?: string
  } = {},
): Promise<PaginatedResult<PendingActionDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(pendingActions.organizationId, organizationId)]
  if (input.kind?.trim()) filters.push(eq(pendingActions.kind, input.kind.trim()))
  if (input.status?.trim()) filters.push(eq(pendingActions.status, input.status.trim()))
  if (input.shopId?.trim()) filters.push(eq(pendingActions.shopId, input.shopId.trim()))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(ilike(pendingActions.title, q), ilike(pendingActions.kind, q), ilike(pendingActions.createdBy, q))!,
    )
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(pendingActions).where(where)
  const rows = await db
    .select({ action: pendingActions, shopName: shops.name })
    .from(pendingActions)
    .leftJoin(shops, eq(shops.id, pendingActions.shopId))
    .where(where)
    .orderBy(desc(pendingActions.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map(({ action, shopName }) => mapRow(action, shopName)),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function pendingStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: pendingActions.status, value: count() })
    .from(pendingActions)
    .where(eq(pendingActions.organizationId, organizationId))
    .groupBy(pendingActions.status)
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    byStatus[r.status] = Number(r.value)
    total += Number(r.value)
  }
  return {
    total,
    pending: byStatus.pending ?? 0,
    confirmed: byStatus.confirmed ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    failed: byStatus.failed ?? 0,
    kinds: Object.keys(KIND_LABEL),
    statuses: Object.keys(STATUS_LABEL),
    kindLabels: KIND_LABEL,
    statusLabels: STATUS_LABEL,
  }
}

export async function getPendingAction(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select({ action: pendingActions, shopName: shops.name })
    .from(pendingActions)
    .leftJoin(shops, eq(shops.id, pendingActions.shopId))
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
    .limit(1)
  return row ? mapRow(row.action, row.shopName) : null
}

export async function confirmPendingAction(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor?: string,
) {
  const [raw] = await db
    .select({ action: pendingActions, shopName: shops.name })
    .from(pendingActions)
    .leftJoin(shops, eq(shops.id, pendingActions.shopId))
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
    .limit(1)
  if (!raw) throw new Error(`待审单不存在：${id}`)
  const existing = mapRow(raw.action, raw.shopName)
  if (existing.status !== 'pending') throw new Error(`当前状态不可确认：${existing.statusLabel}`)

  const now = new Date()
  const confirmedBy = actor?.trim() || 'console'
  const row = raw.action

  if (row.kind === 'listing_submit') {
    const payload = readPayload(row.payload)
    const mode = typeof payload.mode === 'string' ? payload.mode : 'create'
    let listingId = typeof payload.listingId === 'string' ? payload.listingId : ''

    if (mode === 'create') {
      const missing = missingCreateFields(payload)
      if (missing.length > 0) {
        throw new Error(`待审单缺少必填字段：${missing.join('、')}，请先补全再确认`)
      }
      const created = await listingsDa.createListing(db, organizationId, {
        shopId: String(payload.shopId),
        sku: String(payload.sku),
        sellerSku: String(payload.sellerSku),
        title: String(payload.title),
        sellPrice: Number(payload.sellPrice),
        currency: typeof payload.currency === 'string' && payload.currency ? payload.currency : undefined,
        status: '草稿',
        warehouseCode:
          typeof payload.warehouseCode === 'string' && payload.warehouseCode
            ? payload.warehouseCode
            : undefined,
        logisticsChannel:
          typeof payload.logisticsChannel === 'string' && payload.logisticsChannel
            ? payload.logisticsChannel
            : undefined,
        brandName: typeof payload.brandName === 'string' ? payload.brandName : undefined,
        categoryPath: typeof payload.categoryPath === 'string' ? payload.categoryPath : undefined,
        categoryExternalId:
          typeof payload.categoryExternalId === 'string' ? payload.categoryExternalId : undefined,
        note: typeof payload.note === 'string' ? payload.note : undefined,
        color: typeof payload.color === 'string' ? payload.color : undefined,
        size: typeof payload.size === 'string' ? payload.size : undefined,
      })
      listingId = created.id
      payload.listingId = created.id
    } else {
      if (!listingId) throw new Error('待审单缺少 listingId')
      const [linked] = await db
        .select({ id: listings.id })
        .from(listings)
        .where(and(eq(listings.organizationId, organizationId), eq(listings.id, listingId)))
        .limit(1)
      if (!linked) throw new Error(`待审单关联的刊登不存在：${listingId}`)
      await db
        .update(listings)
        .set({ lastError: null, updatedAt: now })
        .where(eq(listings.id, listingId))
    }

    await db
      .update(pendingActions)
      .set({
        status: 'confirmed',
        confirmedBy,
        confirmedAt: now,
        executedAt: now,
        payload,
        updatedAt: now,
      })
      .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
    const confirmed = await getPendingAction(db, organizationId, id)
    if (!confirmed) throw new Error('确认失败')
    return confirmed
  }

  await db
    .update(pendingActions)
    .set({
      status: 'confirmed',
      confirmedBy,
      confirmedAt: now,
      updatedAt: now,
    })
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
  const result = await getPendingAction(db, organizationId, id)
  if (!result) throw new Error('确认失败')
  return result
}

export async function rejectPendingAction(
  db: AppDatabase,
  organizationId: string,
  id: string,
  reason?: string,
  actor?: string,
) {
  const [raw] = await db
    .select({ action: pendingActions })
    .from(pendingActions)
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
    .limit(1)
  if (!raw) throw new Error(`待审单不存在：${id}`)
  const existing = mapRow(raw.action, null)
  if (existing.status !== 'pending') throw new Error(`当前状态不可拒绝：${existing.statusLabel}`)

  const now = new Date()
  const nowActor = actor?.trim() || 'console'

  if (raw.action.kind === 'listing_submit') {
    const payload = readPayload(raw.action.payload)
    const mode = typeof payload.mode === 'string' ? payload.mode : 'create'
    const listingId = typeof payload.listingId === 'string' ? payload.listingId : ''
    if (mode === 'link' && listingId) {
      // 关联已有刊登：拒绝 → 回退待审，保持可再次提交。
      await db
        .update(listings)
        .set({
          status: 'draft',
          publishState: 'unpublished',
          updatedAt: now,
        })
        .where(and(eq(listings.organizationId, organizationId), eq(listings.id, listingId)))
    }
  }

  await db
    .update(pendingActions)
    .set({
      status: 'cancelled',
      confirmedBy: nowActor,
      confirmedAt: now,
      error: reason?.trim() || '人工拒绝',
      lastErrorMessage: reason?.trim() || '人工拒绝',
      updatedAt: now,
    })
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
  const row = await getPendingAction(db, organizationId, id)
  if (!row) throw new Error('拒绝失败')
  return row
}

export type CompleteListingSubmitInput = {
  shopId?: string
  sku?: string
  sellerSku?: string
  title?: string
  sellPrice?: number
  currency?: string
  brandName?: string
  categoryPath?: string
  categoryExternalId?: string
  note?: string
  color?: string
  size?: string
  warehouseCode?: string
  logisticsChannel?: string
}

/**
 * 补全 listing_submit（mode=create）待审单 payload；只允许在 pending 状态修改。
 */
export async function completeListingSubmit(
  db: AppDatabase,
  organizationId: string,
  id: string,
  patch: CompleteListingSubmitInput,
): Promise<PendingActionDto> {
  const [raw] = await db
    .select({ action: pendingActions })
    .from(pendingActions)
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
    .limit(1)
  if (!raw) throw new Error(`待审单不存在：${id}`)
  const row = raw.action
  if (row.kind !== 'listing_submit') throw new Error('仅刊登提交待审单可补全')
  if (row.status !== 'pending') throw new Error(`当前状态不可补全：${mapRow(row, null).statusLabel}`)
  const payload = readPayload(row.payload)
  const mode = typeof payload.mode === 'string' ? payload.mode : 'create'
  if (mode === 'link') throw new Error('该待审单关联已有刊登，无需补全')

  const next: Record<string, unknown> = { ...payload }
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) next[key] = value
  }
  assign('shopId', patch.shopId?.trim())
  assign('sku', patch.sku?.trim())
  assign('sellerSku', patch.sellerSku?.trim())
  assign('title', patch.title?.trim())
  if (patch.sellPrice !== undefined) next.sellPrice = patch.sellPrice
  assign('currency', patch.currency?.trim())
  assign('brandName', patch.brandName?.trim())
  assign('categoryPath', patch.categoryPath?.trim())
  assign('categoryExternalId', patch.categoryExternalId?.trim())
  assign('note', patch.note)
  assign('color', patch.color?.trim())
  assign('size', patch.size?.trim())
  assign('warehouseCode', patch.warehouseCode?.trim())
  assign('logisticsChannel', patch.logisticsChannel?.trim())

  const now = new Date()
  await db
    .update(pendingActions)
    .set({ payload: next, updatedAt: now })
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
  const updated = await getPendingAction(db, organizationId, id)
  if (!updated) throw new Error('补全后读取失败')
  return updated
}
