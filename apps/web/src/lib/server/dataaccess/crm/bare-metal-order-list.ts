import { db } from '@/lib/db'
import { projectsDataAccess } from '@/lib/server/dataaccess/crm/projects'
import { toNumber } from '@/lib/server/mappers/crm'
import type {
  TenantBareMetalOrderListItem,
  TenantBareMetalOrderListResult,
} from '@/lib/types/tenant-billing-list'
import { bareMetalOrder, bareMetalOrderDevice } from '@workspace/db/schema'
import { count, desc, eq, inArray, or } from 'drizzle-orm'

function toIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined
}

function mapOrderToListItem(
  row: typeof bareMetalOrder.$inferSelect,
  lines: (typeof bareMetalOrderDevice.$inferSelect)[],
): TenantBareMetalOrderListItem {
  const primaryModel = lines[0]?.deviceModelText ?? undefined
  const finalAmount = toNumber(row.finalAmount)
  const orderAmount = row.orderAmount != null ? toNumber(row.orderAmount) : finalAmount
  const discountAmount = Math.max(0, orderAmount - finalAmount)
  return {
    id: row.id,
    orderNo: row.orderNo ?? '',
    status: row.status,
    orderAmount,
    amount: finalAmount,
    discountAmount,
    balanceAmount: toNumber(row.balanceAmount),
    couponAmount: toNumber(row.couponAmount),
    dataCenterName: row.idcName ?? undefined,
    deviceCount: row.deviceCount,
    deviceModel: primaryModel,
    gpuCount: row.gpuCount,
    unit: row.billingUnit,
    createdAt: row.orderedAt.toISOString(),
    completedAt: toIso(row.completedAt),
    items: lines.map((line) => ({
      name: line.deviceModelText ?? 'GPU',
      quantity: line.gpuCount,
      unitPrice: line.unitPricePerCardHour ? toNumber(line.unitPricePerCardHour) : 0,
      total: line.lineAmount ? toNumber(line.lineAmount) : 0,
    })),
  }
}

async function loadDevicesByOrderIds(
  orderIds: string[],
): Promise<Map<string, (typeof bareMetalOrderDevice.$inferSelect)[]>> {
  const devicesByOrderId = new Map<string, (typeof bareMetalOrderDevice.$inferSelect)[]>()
  if (orderIds.length === 0) return devicesByOrderId

  const devices = await db
    .select()
    .from(bareMetalOrderDevice)
    .where(inArray(bareMetalOrderDevice.bareMetalOrderId, orderIds))
    .orderBy(bareMetalOrderDevice.lineNo)

  for (const device of devices) {
    const list = devicesByOrderId.get(device.bareMetalOrderId) ?? []
    list.push(device)
    devicesByOrderId.set(device.bareMetalOrderId, list)
  }

  return devicesByOrderId
}

export async function listBareMetalOrdersForTenant(input: {
  tenantId: string
  page: number
  pageSize: number
}): Promise<TenantBareMetalOrderListResult> {
  const page = Math.max(1, input.page)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  const offset = (page - 1) * pageSize
  const whereClause = eq(bareMetalOrder.tenantId, input.tenantId)

  const [totalRow] = await db
    .select({ total: count() })
    .from(bareMetalOrder)
    .where(whereClause)

  const total = Number(totalRow?.total ?? 0)
  if (total === 0) {
    return { items: [], total: 0, page, pageSize }
  }

  const orders = await db
    .select()
    .from(bareMetalOrder)
    .where(whereClause)
    .orderBy(desc(bareMetalOrder.orderedAt))
    .limit(pageSize)
    .offset(offset)

  const devicesByOrderId = await loadDevicesByOrderIds(orders.map((order) => order.id))

  return {
    items: orders.map((row) => mapOrderToListItem(row, devicesByOrderId.get(row.id) ?? [])),
    total,
    page,
    pageSize,
  }
}

export async function listBareMetalOrdersForProject(
  projectId: string,
): Promise<TenantBareMetalOrderListItem[]> {
  const billingTenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
  if (billingTenantIds.length === 0) return []

  const orders = await db
    .select()
    .from(bareMetalOrder)
    .where(
      or(
        eq(bareMetalOrder.projectId, projectId),
        inArray(bareMetalOrder.tenantId, billingTenantIds),
      ),
    )
    .orderBy(desc(bareMetalOrder.orderedAt))

  if (orders.length === 0) return []

  const devicesByOrderId = await loadDevicesByOrderIds(orders.map((order) => order.id))

  return orders.map((row) => mapOrderToListItem(row, devicesByOrderId.get(row.id) ?? []))
}
