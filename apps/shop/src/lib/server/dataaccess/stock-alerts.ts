/**
 * 库存预警（stock_alerts）维护与读取（模块8 · 方案B）。
 *
 * 设计：
 * - `stock_alerts` 按 (organization_id, variant_id) 维护一行；`threshold` 为用户覆盖值，
 *   缺省回退 20；`status` 取 'critical' | 'open' | 'muted' | 'resolved'，由余额派生。
 * - 任何写 `inventory_balances`（on_hand / reserved / qc_hold / damaged）的事务，在事务内
 *   对受影响 variant 调用 `recomputeStockAlert`，保证 `stock_alerts` 与余额强一致。
 * - `muted` 为用户手动忽略：recompute 不改 muted 行的 status，只刷新 triggered_at 留痕。
 *
 * @see docs/design/shop-module8-wms-trpc.md §3.5
 */
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  inventoryBalances,
  productVariants,
  products,
  stockAlerts,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/wms'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
import { scheduleDingTalkIfEnabled } from '@/lib/server/dataaccess/organization-settings'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

/** 缺省补货阈值；`stock_alerts.threshold` 缺省或未配置时回退。 */
export const DEFAULT_STOCK_THRESHOLD = 20

/** 库龄阈值（天）：超过即记入 `aged` 计数与 `open` 告警。 */
export const STOCK_AGE_DAYS_THRESHOLD = 60

export type StockAlertStatus = 'critical' | 'open' | 'muted' | 'resolved' | 'disabled'

/**
 * 重算单个 variant 的预警并 upsert 到 `stock_alerts`。
 * 必须在写 `inventory_balances` 的同一事务内调用，读余额取最新值。
 *
 * 幂等：同 variant 重复调用只覆盖 status / triggered_at / threshold（保留用户覆盖）。
 */
export async function recomputeStockAlert(
  db: DbLike,
  organizationId: string,
  variantId: string,
): Promise<void> {
  const [agg] = await db
    .select({
      onHand: sql<number>`coalesce(sum(${inventoryBalances.onHand}), 0)`.mapWith(Number),
      reserved: sql<number>`coalesce(sum(${inventoryBalances.reserved}), 0)`.mapWith(Number),
      qcHold: sql<number>`coalesce(sum(${inventoryBalances.qcHold}), 0)`.mapWith(Number),
      damaged: sql<number>`coalesce(sum(${inventoryBalances.damaged}), 0)`.mapWith(Number),
    })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, organizationId),
        eq(inventoryBalances.variantId, variantId),
      ),
    )

  const available = Math.max(
    0,
    (agg?.onHand ?? 0) - (agg?.reserved ?? 0) - (agg?.qcHold ?? 0) - (agg?.damaged ?? 0),
  )

  const [existing] = await db
    .select()
    .from(stockAlerts)
    .where(
      and(
        eq(stockAlerts.organizationId, organizationId),
        eq(stockAlerts.variantId, variantId),
      ),
    )
    .limit(1)

  const threshold = existing?.threshold ?? DEFAULT_STOCK_THRESHOLD

  // muted / disabled 行不自动改 status：muted 等用户解除，disabled 为软停用。
  let status: StockAlertStatus
  if (existing?.status === 'muted' || existing?.status === 'disabled') {
    status = existing.status
  } else if (available <= 0) {
    status = 'critical'
  } else if (available < threshold) {
    status = 'open'
  } else {
    status = 'resolved'
  }

  const triggeredAt =
    status === 'critical' || status === 'open'
      ? existing?.triggeredAt ?? new Date()
      : null

  const wasAlerting = existing?.status === 'critical' || existing?.status === 'open'
  const isAlerting = status === 'critical' || status === 'open'

  if (existing) {
    await db
      .update(stockAlerts)
      .set({
        status,
        threshold,
        triggeredAt: triggeredAt,
      })
      .where(eq(stockAlerts.id, existing.id))
  } else {
    await db.insert(stockAlerts).values({
      id: createId(),
      organizationId,
      variantId,
      threshold,
      status,
      triggeredAt: triggeredAt,
    })
  }

  if (isAlerting && !wasAlerting) {
    const [variant] = await db
      .select({ skuCode: productVariants.skuCode, sku: productVariants.sku })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1)
    const sku = variant?.skuCode || variant?.sku || variantId
    const level = status === 'critical' ? '缺货' : '偏低'
    scheduleDingTalkIfEnabled(
      db,
      organizationId,
      `【好市云·库存预警】SKU ${sku} 可用库存${level}（可用 ${available}，阈值 ${threshold}）`,
    )
  }
}

/**
 * 批量重算：在事务末尾对一组受影响 variant 各调一次 recompute。
 * 用 Set 去重，避免同一事务内多次写同一行。
 */
export async function recomputeStockAlerts(
  db: DbLike,
  organizationId: string,
  variantIds: Iterable<string>,
): Promise<void> {
  const seen = new Set<string>()
  for (const id of variantIds) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    await recomputeStockAlert(db, organizationId, id)
  }
}

/**
 * 侧栏徽章 / 列表页 KPI：当前 critical 预警数。
 * 直接读 `stock_alerts`，O(alerts) 行，不聚合 balances。
 */
export async function countCriticalAlerts(
  db: AppDatabase,
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)`.mapWith(Number) })
    .from(stockAlerts)
    .where(
      and(
        eq(stockAlerts.organizationId, organizationId),
        eq(stockAlerts.status, 'critical'),
      ),
    )
  return Number(row?.c ?? 0)
}

// ---------------------------------------------------------------------------
// 管理面 CRUD（设置 · 库存预警阈值）
// ---------------------------------------------------------------------------

export type StockAlertDto = {
  id: string
  variantId: string
  sku: string
  title: string
  warehouseCode: string | null
  threshold: number
  status: StockAlertStatus
  /** 实时可用（聚合 inventory_balances 派生），与列表页口径一致。 */
  available: number
  /** 按当前余额 + 阈值实时派生的告警，忽略 muted。 */
  alert: 'critical' | 'open' | null
  muted: boolean
  triggeredAt: string
  updatedAt: string
}

function mapAlertStatus(status: string): StockAlertStatus {
  if (
    status === 'muted' ||
    status === 'critical' ||
    status === 'open' ||
    status === 'resolved' ||
    status === 'disabled'
  ) {
    return status
  }
  return 'open'
}

function deriveAlert(available: number, threshold: number): 'critical' | 'open' | null {
  if (available <= 0) return 'critical'
  if (available < threshold) return 'open'
  return null
}

/**
 * 列表：以 stock_alerts 为基表，LEFT JOIN balances 聚合取实时 available。
 * 服务端分页；支持 q（SKU/标题）与 status 过滤。
 */
export async function listStockAlerts(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<StockAlertDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)

  let variantFilter: ReturnType<typeof inArray> | undefined
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    const variants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .leftJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          or(
            ilike(productVariants.skuCode, q),
            ilike(productVariants.sku, q),
            ilike(products.title, q),
          ),
        ),
      )
    if (variants.length === 0) return { items: [], total: 0, page, pageSize }
    variantFilter = inArray(
      stockAlerts.variantId,
      variants.map((v) => v.id),
    )
  }

  const filters: SQL[] = [eq(stockAlerts.organizationId, organizationId)]
  if (variantFilter) filters.push(variantFilter)
  if (input.status && input.status !== 'all' && input.status !== '全部') {
    filters.push(eq(stockAlerts.status, input.status))
  } else {
    filters.push(sql`${stockAlerts.status} <> 'disabled'`)
  }
  const where = and(...filters)

  const [totalRow] = await db.select({ c: count() }).from(stockAlerts).where(where)

  const rows = await db
    .select({
      alert: stockAlerts,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      title: products.title,
      available: sql<number>`coalesce(
        sum(greatest(0,
          ${inventoryBalances.onHand} - ${inventoryBalances.reserved}
          - ${inventoryBalances.qcHold} - ${inventoryBalances.damaged}
        )), 0
      )`.mapWith(Number),
    })
    .from(stockAlerts)
    .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(
      inventoryBalances,
      and(
        eq(inventoryBalances.organizationId, stockAlerts.organizationId),
        eq(inventoryBalances.variantId, stockAlerts.variantId),
      ),
    )
    .where(where)
    .groupBy(stockAlerts.id, productVariants.skuCode, productVariants.sku, products.title)
    .orderBy(desc(stockAlerts.triggeredAt), desc(stockAlerts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const items: StockAlertDto[] = rows.map((r) => {
    const available = Number(r.available ?? 0)
    const threshold = Number(r.alert.threshold)
    const status = mapAlertStatus(r.alert.status)
    return {
      id: r.alert.id,
      variantId: r.alert.variantId,
      sku: r.skuCode || r.sku || '',
      title: r.title || r.skuCode || r.sku || '',
      warehouseCode: r.alert.warehouseCode,
      threshold,
      status,
      available,
      alert: status === 'muted' ? null : deriveAlert(available, threshold),
      muted: status === 'muted',
      triggeredAt: r.alert.triggeredAt ? formatStamp(r.alert.triggeredAt) : '',
      updatedAt: '',
    }
  })

  return { items, total: Number(totalRow?.c ?? 0), page, pageSize }
}

export async function getStockAlert(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<StockAlertDto | null> {
  const [row] = await db
    .select({
      alert: stockAlerts,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      title: products.title,
      available: sql<number>`coalesce(
        sum(greatest(0,
          ${inventoryBalances.onHand} - ${inventoryBalances.reserved}
          - ${inventoryBalances.qcHold} - ${inventoryBalances.damaged}
        )), 0
      )`.mapWith(Number),
    })
    .from(stockAlerts)
    .innerJoin(productVariants, eq(productVariants.id, stockAlerts.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(
      inventoryBalances,
      and(
        eq(inventoryBalances.organizationId, stockAlerts.organizationId),
        eq(inventoryBalances.variantId, stockAlerts.variantId),
      ),
    )
    .where(and(eq(stockAlerts.organizationId, organizationId), eq(stockAlerts.id, id)))
    .groupBy(stockAlerts.id, productVariants.skuCode, productVariants.sku, products.title)
    .limit(1)
  if (!row) return null
  const available = Number(row.available ?? 0)
  const threshold = Number(row.alert.threshold)
  const status = mapAlertStatus(row.alert.status)
  return {
    id: row.alert.id,
    variantId: row.alert.variantId,
    sku: row.skuCode || row.sku || '',
    title: row.title || row.skuCode || row.sku || '',
    warehouseCode: row.alert.warehouseCode,
    threshold,
    status,
    available,
    alert: status === 'muted' ? null : deriveAlert(available, threshold),
    muted: status === 'muted',
    triggeredAt: row.alert.triggeredAt ? formatStamp(row.alert.triggeredAt) : '',
    updatedAt: '',
  }
}

async function sumAvailable(
  db: DbLike,
  organizationId: string,
  variantId: string,
): Promise<number> {
  const [row] = await db
    .select({
      onHand: sql<number>`coalesce(sum(${inventoryBalances.onHand}), 0)`.mapWith(Number),
      reserved: sql<number>`coalesce(sum(${inventoryBalances.reserved}), 0)`.mapWith(Number),
      qcHold: sql<number>`coalesce(sum(${inventoryBalances.qcHold}), 0)`.mapWith(Number),
      damaged: sql<number>`coalesce(sum(${inventoryBalances.damaged}), 0)`.mapWith(Number),
    })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, organizationId),
        eq(inventoryBalances.variantId, variantId),
      ),
    )
  return Math.max(
    0,
    Number(row?.onHand ?? 0) - Number(row?.reserved ?? 0) - Number(row?.qcHold ?? 0) - Number(row?.damaged ?? 0),
  )
}

/**
 * 新建或更新某 variant 的预警阈值。
 * - 阈值变更后立即重算 status（实时生效：列表页下次查询即用新阈值派生 alert）。
 * - 写 audit_events，before/after 记录旧/新阈值，满足"历史预警值的显示"。
 */
export async function upsertStockAlert(
  db: AppDatabase,
  organizationId: string,
  input: {
    variantId: string
    threshold: number
    actorUserId?: string
    actorLabel?: string
    reason?: string
  },
): Promise<StockAlertDto> {
  const threshold = Math.max(0, Math.floor(input.threshold))
  const [existing] = await db
    .select()
    .from(stockAlerts)
    .where(
      and(
        eq(stockAlerts.organizationId, organizationId),
        eq(stockAlerts.variantId, input.variantId),
      ),
    )
    .limit(1)

  const available = await sumAvailable(db, organizationId, input.variantId)
  const newStatus: StockAlertStatus =
    existing?.status === 'muted'
      ? 'muted'
      : available <= 0
        ? 'critical'
        : available < threshold
          ? 'open'
          : 'resolved'
  const triggeredAt =
    newStatus === 'critical' || newStatus === 'open'
      ? existing?.triggeredAt ?? new Date()
      : null

  if (existing) {
    const before = {
      threshold: Number(existing.threshold),
      status: existing.status,
      available,
    }
    await db
      .update(stockAlerts)
      .set({ threshold, status: newStatus, triggeredAt })
      .where(eq(stockAlerts.id, existing.id))
    const after = { threshold, status: newStatus, available }
    await appendAuditEvent(db, organizationId, {
      actorUserId: input.actorUserId,
      actorLabel: input.actorLabel,
      action: 'stock_alert.update_threshold',
      entityType: 'stock_alert',
      entityId: existing.id,
      result: 'ok',
      detail: `SKU 预警阈值 ${before.threshold} → ${threshold}（可用 ${available}）${input.reason ? `；原因：${input.reason}` : ''}`,
      before,
      after,
    })
    return (await getStockAlert(db, organizationId, existing.id))!
  }

  const id = createId()
  await db.insert(stockAlerts).values({
    id,
    organizationId,
    variantId: input.variantId,
    threshold,
    status: newStatus,
    triggeredAt,
  })
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'stock_alert.create',
    entityType: 'stock_alert',
    entityId: id,
    result: 'ok',
    detail: `新建 SKU 预警阈值 ${threshold}（可用 ${available} → ${newStatus}）${input.reason ? `；原因：${input.reason}` : ''}`,
    after: { threshold, status: newStatus, available, variantId: input.variantId },
  })
  return (await getStockAlert(db, organizationId, id))!
}

/**
 * 静音 / 取消静音：muted 行不参与告警通知与徽章，但保留阈值与历史。
 */
export async function setStockAlertMuted(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; muted: boolean; reason?: string; actorUserId?: string; actorLabel?: string },
): Promise<StockAlertDto> {
  const [existing] = await db
    .select()
    .from(stockAlerts)
    .where(and(eq(stockAlerts.organizationId, organizationId), eq(stockAlerts.id, input.id)))
    .limit(1)
  if (!existing) throw new Error('预警配置不存在')

  const available = await sumAvailable(db, organizationId, existing.variantId)
  const nextStatus: StockAlertStatus = input.muted
    ? 'muted'
    : available <= 0
      ? 'critical'
      : available < Number(existing.threshold)
        ? 'open'
        : 'resolved'
  const triggeredAt =
    nextStatus === 'critical' || nextStatus === 'open'
      ? existing.triggeredAt ?? new Date()
      : null

  const before = { status: existing.status, muted: existing.status === 'muted' }
  await db
    .update(stockAlerts)
    .set({ status: nextStatus, triggeredAt })
    .where(eq(stockAlerts.id, existing.id))
  const after = { status: nextStatus, muted: input.muted }
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: input.muted ? 'stock_alert.mute' : 'stock_alert.unmute',
    entityType: 'stock_alert',
    entityId: existing.id,
    result: 'ok',
    detail: `${input.muted ? '静音' : '取消静音'} SKU 预警（阈值 ${existing.threshold}，可用 ${available}）${input.reason ? `；原因：${input.reason}` : ''}`,
    before,
    after,
  })
  return (await getStockAlert(db, organizationId, existing.id))!
}

/**
 * 软停用预警配置（variant 不再需要阈值监控时）。不物理删除，recompute 不会复活；再次 upsert 阈值会重新启用。历史审计保留。
 */
export async function deleteStockAlert(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; reason?: string; actorUserId?: string; actorLabel?: string },
): Promise<void> {
  const [existing] = await db
    .select()
    .from(stockAlerts)
    .where(and(eq(stockAlerts.organizationId, organizationId), eq(stockAlerts.id, input.id)))
    .limit(1)
  if (!existing) throw new Error('预警配置不存在')
  await db
    .update(stockAlerts)
    .set({ status: 'disabled', triggeredAt: null })
    .where(eq(stockAlerts.id, existing.id))
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'stock_alert.disable',
    entityType: 'stock_alert',
    entityId: existing.id,
    result: 'ok',
    detail: `停用 SKU 预警配置（阈值 ${existing.threshold}，原状态 ${existing.status}）${input.reason ? `；原因：${input.reason}` : ''}`,
    before: { threshold: Number(existing.threshold), status: existing.status, variantId: existing.variantId },
    after: { status: 'disabled' },
  })
}
