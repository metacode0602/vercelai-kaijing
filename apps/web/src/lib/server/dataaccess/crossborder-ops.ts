import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import {
  integrationStates,
  orders,
  organization,
  pendingActions,
  productCandidates,
  shops,
} from '@workspace/db'
import { db } from '@/lib/db'

function pageValues(page?: number, pageSize?: number) {
  const normalizedPage = Math.max(1, Math.trunc(page ?? 1))
  const normalizedSize = Math.min(100, Math.max(1, Math.trunc(pageSize ?? 20)))
  return { page: normalizedPage, pageSize: normalizedSize }
}

export type CrossborderDashboardStats = {
  tenants: number
  activeShops: number
  pendingActions: number
  syncErrors: number
  ordersToday: number
  candidatesNew: number
}

export async function getCrossborderDashboardStats(): Promise<CrossborderDashboardStats> {
  // 今日订单：按下单时间（UTC 自然日）统计
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)

  const [
    tenantRows,
    activeShopRows,
    pendingRows,
    syncErrorRows,
    orderRows,
    candidateRows,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(organization)
      .where(eq(organization.orgType, 'tenant')),
    db
      .select({ value: count() })
      .from(shops)
      .where(and(eq(shops.status, 'active'), isNull(shops.deletedAt))),
    db
      .select({ value: count() })
      .from(pendingActions)
      .where(eq(pendingActions.status, 'pending')),
    db
      .select({ value: count() })
      .from(integrationStates)
      .innerJoin(shops, eq(shops.id, integrationStates.shopId))
      .where(
        and(eq(integrationStates.health, 'error'), isNull(shops.deletedAt)),
      ),
    db
      .select({ value: count() })
      .from(orders)
      .where(gte(orders.placedAt, dayStart)),
    db
      .select({ value: count() })
      .from(productCandidates)
      .where(eq(productCandidates.status, 'new')),
  ])

  return {
    tenants: Number(tenantRows[0]?.value ?? 0),
    activeShops: Number(activeShopRows[0]?.value ?? 0),
    pendingActions: Number(pendingRows[0]?.value ?? 0),
    syncErrors: Number(syncErrorRows[0]?.value ?? 0),
    ordersToday: Number(orderRows[0]?.value ?? 0),
    candidatesNew: Number(candidateRows[0]?.value ?? 0),
  }
}

export type CrossborderSyncHealthItem = {
  shopId: string
  shopName: string
  platform: string
  shopStatus: string
  organizationName: string
  health: string
  lastOrdersSyncAt: Date | null
  lastInventorySyncAt: Date | null
  lastError: string | null
}

export async function listCrossborderSyncHealth(input: {
  page?: number
  pageSize?: number
}): Promise<{
  items: CrossborderSyncHealthItem[]
  total: number
  page: number
  pageSize: number
}> {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const where = isNull(shops.deletedAt)

  const totalRows = await db
    .select({ total: count() })
    .from(shops)
    .where(where)
  const total = Number(totalRows[0]?.total ?? 0)

  const items = await db
    .select({
      shopId: shops.id,
      shopName: shops.name,
      platform: shops.platform,
      shopStatus: shops.status,
      organizationName: organization.name,
      health: sql<string>`coalesce(${integrationStates.health}, 'idle')`,
      lastOrdersSyncAt: integrationStates.lastOrdersSyncAt,
      lastInventorySyncAt: integrationStates.lastInventorySyncAt,
      lastError: integrationStates.lastError,
    })
    .from(shops)
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(where)
    .orderBy(desc(shops.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { items, total, page, pageSize }
}

export type CrossborderPendingActionItem = {
  id: string
  organizationId: string
  organizationName: string
  shopName: string | null
  kind: string
  title: string
  status: string
  createdAt: Date
}

export async function listCrossborderPendingActions(input: {
  page?: number
  pageSize?: number
  status?: string
  q?: string
}): Promise<{
  items: CrossborderPendingActionItem[]
  total: number
  page: number
  pageSize: number
}> {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = []
  if (input.status && input.status !== 'all') {
    filters.push(eq(pendingActions.status, input.status))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(pendingActions.title, value),
        ilike(pendingActions.kind, value),
        ilike(organization.name, value),
      )!,
    )
  }
  const where = filters.length ? and(...filters) : undefined

  const totalRows = await db
    .select({ total: count() })
    .from(pendingActions)
    .innerJoin(
      organization,
      eq(organization.id, pendingActions.organizationId),
    )
    .where(where)
  const total = Number(totalRows[0]?.total ?? 0)

  const items = await db
    .select({
      id: pendingActions.id,
      organizationId: pendingActions.organizationId,
      organizationName: organization.name,
      shopName: shops.name,
      kind: pendingActions.kind,
      title: pendingActions.title,
      status: pendingActions.status,
      createdAt: pendingActions.createdAt,
    })
    .from(pendingActions)
    .innerJoin(
      organization,
      eq(organization.id, pendingActions.organizationId),
    )
    .leftJoin(shops, eq(shops.id, pendingActions.shopId))
    .where(where)
    .orderBy(
      sql`case when ${pendingActions.status} = 'pending' then 0 else 1 end`,
      desc(pendingActions.createdAt),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { items, total, page, pageSize }
}
