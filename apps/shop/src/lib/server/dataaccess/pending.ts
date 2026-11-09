/**
 * pending_actions（模块16）— 待审队列。
 * 确认/拒绝只改站内状态；平台执行仍依赖 OpenAPI 联调。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { pendingActions, shops } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

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
}

function mapRow(
  row: typeof pendingActions.$inferSelect,
  shopName: string | null,
): PendingActionDto {
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
  const existing = await getPendingAction(db, organizationId, id)
  if (!existing) throw new Error(`待审单不存在：${id}`)
  if (existing.status !== 'pending') throw new Error(`当前状态不可确认：${existing.statusLabel}`)
  const now = new Date()
  await db
    .update(pendingActions)
    .set({
      status: 'confirmed',
      confirmedBy: actor?.trim() || 'console',
      confirmedAt: now,
      updatedAt: now,
    })
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
  const row = await getPendingAction(db, organizationId, id)
  if (!row) throw new Error('确认失败')
  return row
}

export async function rejectPendingAction(
  db: AppDatabase,
  organizationId: string,
  id: string,
  reason?: string,
  actor?: string,
) {
  const existing = await getPendingAction(db, organizationId, id)
  if (!existing) throw new Error(`待审单不存在：${id}`)
  if (existing.status !== 'pending') throw new Error(`当前状态不可拒绝：${existing.statusLabel}`)
  const now = new Date()
  await db
    .update(pendingActions)
    .set({
      status: 'cancelled',
      confirmedBy: actor?.trim() || 'console',
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
