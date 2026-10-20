import { db } from '@/lib/db'
import type {
  BareMetalOrderDetailDto,
  BareMetalOrderDeviceDto,
  BareMetalOrderListItemDto,
} from '@/lib/types/bare-metal-order-api'
import {
  bareMetalOrder,
  bareMetalOrderDevice,
  bareMetalOrderLog,
  bareMetalOrderPriceSnapshot,
  billingTenant,
  crmProject,
  customer,
  dataCenter,
  gpuCardType,
  supplier,
} from '@workspace/db/schema'
import {
  cstDateEndExclusiveToUtcIso,
  cstDateStartToUtcIso,
} from '@/lib/crm/tenant-billing-import-utils'
import { projectsDataAccess } from '@/lib/server/dataaccess/crm/projects'
import {
  allocateBareMetalDevicePaymentAmounts,
  computeBareMetalDiscountAmount,
  extractBareMetalDevicePayment,
  isBareMetalDeviceRevenuePending,
} from '@/lib/supplier/bare-metal-order-utils'
import { and, count, desc, eq, exists, gte, ilike, inArray, lt, lte, or, sql } from 'drizzle-orm'

export type BareMetalOrderListInput = {
  search?: string
  platformOrderId?: string
  tenantId?: string
  projectId?: string
  dataCenterId?: string
  status?: string
  payStatus?: string
  orderMark?: 'online' | 'offline' | 'all'
  source?: string
  orderedFrom?: string
  orderedTo?: string
  page?: number
  pageSize?: number
}

export type ProjectBareMetalOrderListOptions = {
  page?: number
  pageSize?: number
  orderNo?: string
  gpuCard?: string
  dataCenter?: string
  orderedFrom?: string
  orderedTo?: string
}

function buildProjectBareMetalOrderFilterConditions(
  input: Pick<
    ProjectBareMetalOrderListOptions,
    'orderNo' | 'gpuCard' | 'dataCenter' | 'orderedFrom' | 'orderedTo'
  >,
) {
  const conditions = []

  const orderNo = input.orderNo?.trim()
  if (orderNo) {
    conditions.push(ilike(bareMetalOrder.orderNo, `%${orderNo}%`))
  }

  const gpuCard = input.gpuCard?.trim()
  if (gpuCard) {
    const pattern = `%${gpuCard}%`
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(bareMetalOrderDevice)
          .leftJoin(gpuCardType, eq(gpuCardType.id, bareMetalOrderDevice.gpuCardTypeId))
          .where(
            and(
              eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id),
              or(
                ilike(bareMetalOrderDevice.deviceModelText, pattern),
                ilike(gpuCardType.code, pattern),
                ilike(gpuCardType.name, pattern),
              ),
            ),
          ),
      ),
    )
  }

  const dataCenterQuery = input.dataCenter?.trim()
  if (dataCenterQuery) {
    const pattern = `%${dataCenterQuery}%`
    conditions.push(
      or(ilike(dataCenter.name, pattern), ilike(bareMetalOrder.idcName, pattern))!,
    )
  }

  const orderedFrom = input.orderedFrom?.trim()
  if (orderedFrom) {
    conditions.push(gte(bareMetalOrder.orderedAt, new Date(cstDateStartToUtcIso(orderedFrom))))
  }

  const orderedTo = input.orderedTo?.trim()
  if (orderedTo) {
    conditions.push(lt(bareMetalOrder.orderedAt, new Date(cstDateEndExclusiveToUtcIso(orderedTo))))
  }

  return conditions
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function bareMetalOrderMatchesProject(
  order: { projectId: string | null; tenantId: string },
  projectId: string,
  billingTenantIds: string[],
): boolean {
  if (order.projectId === projectId) return true
  return billingTenantIds.includes(order.tenantId)
}

function summarizeGpuCardSummary(
  lines: Array<{
    deviceModelText: string | null
    gpuCardTypeCode: string | null
    gpuCount: number
  }>,
): string | null {
  if (lines.length === 0) return null
  const grouped = new Map<string, number>()
  for (const line of lines) {
    const label = line.gpuCardTypeCode ?? line.deviceModelText ?? 'GPU'
    grouped.set(label, (grouped.get(label) ?? 0) + line.gpuCount)
  }
  return [...grouped.entries()].map(([label, count]) => `${label} × ${count}`).join('，')
}

function summarizeDeviceModelSummary(
  lines: Array<{ deviceModelText: string | null }>,
): string | null {
  if (lines.length === 0) return null
  const grouped = new Map<string, number>()
  for (const line of lines) {
    const label = line.deviceModelText?.trim()
    if (!label) continue
    grouped.set(label, (grouped.get(label) ?? 0) + 1)
  }
  if (grouped.size === 0) return null
  return [...grouped.entries()].map(([label, count]) => `${label} × ${count}`).join('，')
}

async function loadDeviceLineSummariesByOrderId(orderIds: string[]): Promise<{
  gpuCardSummaries: Map<string, string>
  deviceModelSummaries: Map<string, string>
}> {
  if (orderIds.length === 0) {
    return { gpuCardSummaries: new Map(), deviceModelSummaries: new Map() }
  }

  const deviceRows = await db
    .select({
      bareMetalOrderId: bareMetalOrderDevice.bareMetalOrderId,
      deviceModelText: bareMetalOrderDevice.deviceModelText,
      gpuCardTypeCode: gpuCardType.code,
      gpuCount: bareMetalOrderDevice.gpuCount,
      lineNo: bareMetalOrderDevice.lineNo,
    })
    .from(bareMetalOrderDevice)
    .leftJoin(gpuCardType, eq(gpuCardType.id, bareMetalOrderDevice.gpuCardTypeId))
    .where(inArray(bareMetalOrderDevice.bareMetalOrderId, orderIds))
    .orderBy(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrderDevice.lineNo)

  const linesByOrderId = new Map<string, typeof deviceRows>()
  for (const row of deviceRows) {
    const list = linesByOrderId.get(row.bareMetalOrderId) ?? []
    list.push(row)
    linesByOrderId.set(row.bareMetalOrderId, list)
  }

  const gpuCardSummaries = new Map<string, string>()
  const deviceModelSummaries = new Map<string, string>()
  for (const orderId of orderIds) {
    const lines = linesByOrderId.get(orderId) ?? []
    const gpuSummary = summarizeGpuCardSummary(lines)
    const deviceModelSummary = summarizeDeviceModelSummary(lines)
    if (gpuSummary) gpuCardSummaries.set(orderId, gpuSummary)
    if (deviceModelSummary) deviceModelSummaries.set(orderId, deviceModelSummary)
  }
  return { gpuCardSummaries, deviceModelSummaries }
}

function mapListRow(row: {
  order: typeof bareMetalOrder.$inferSelect
  tenantName: string | null
  projectName: string | null
  dataCenterName: string | null
}): BareMetalOrderListItemDto {
  const { order } = row
  return {
    id: order.id,
    orderNo: order.orderNo,
    platformOrderId: order.platformOrderId,
    orderMark: order.orderMark as BareMetalOrderListItemDto['orderMark'],
    source: order.source,
    status: order.status,
    payStatus: order.payStatus,
    tenantId: order.tenantId,
    tenantName: row.tenantName,
    platformTenantId: order.platformTenantId,
    projectId: order.projectId,
    projectName: row.projectName,
    dataCenterId: order.dataCenterId,
    dataCenterName: row.dataCenterName,
    idcName: order.idcName,
    deviceCount: order.deviceCount,
    gpuCount: order.gpuCount,
    purchaseQty: order.purchaseQty,
    purchaseQtyText: order.purchaseQtyText,
    billingUnit: order.billingUnit,
    finalAmount: order.finalAmount,
    orderAmount: order.orderAmount,
    discountAmount:
      order.orderAmount != null
        ? computeBareMetalDiscountAmount({
            orderAmount: order.orderAmount,
            finalAmount: order.finalAmount,
          }).toFixed(4)
        : null,
    balanceAmount: order.balanceAmount,
    couponAmount: order.couponAmount,
    orderedAt: toIso(order.orderedAt)!,
    rentStartsAt: toIso(order.rentStartsAt),
    rentEndsAt: toIso(order.rentEndsAt),
  }
}

export const bareMetalOrderDataAccess = {
  async list(input: BareMetalOrderListInput = {}): Promise<{
    items: BareMetalOrderListItemDto[]
    total: number
  }> {
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 20
    const offset = (page - 1) * pageSize
    const conditions = []

    const q = input.search?.trim()
    if (q) {
      const pattern = `%${q}%`
      conditions.push(
        or(
          ilike(bareMetalOrder.orderNo, pattern),
          ilike(bareMetalOrder.platformOrderId, pattern),
          ilike(billingTenant.name, pattern),
          ilike(crmProject.name, pattern),
          ilike(bareMetalOrder.idcName, pattern),
        )!,
      )
    }

    if (input.platformOrderId?.trim()) {
      conditions.push(ilike(bareMetalOrder.platformOrderId, `%${input.platformOrderId.trim()}%`))
    }
    if (input.tenantId) conditions.push(eq(bareMetalOrder.tenantId, input.tenantId))
    if (input.projectId) conditions.push(eq(bareMetalOrder.projectId, input.projectId))
    if (input.dataCenterId) conditions.push(eq(bareMetalOrder.dataCenterId, input.dataCenterId))
    if (input.status && input.status !== 'all') {
      conditions.push(eq(bareMetalOrder.status, input.status))
    }
    if (input.payStatus && input.payStatus !== 'all') {
      conditions.push(eq(bareMetalOrder.payStatus, input.payStatus))
    }
    if (input.orderMark && input.orderMark !== 'all') {
      conditions.push(eq(bareMetalOrder.orderMark, input.orderMark))
    }
    if (input.source && input.source !== 'all') {
      conditions.push(eq(bareMetalOrder.source, input.source))
    }
    if (input.orderedFrom) {
      conditions.push(gte(bareMetalOrder.orderedAt, new Date(input.orderedFrom)))
    }
    if (input.orderedTo) {
      conditions.push(lte(bareMetalOrder.orderedAt, new Date(input.orderedTo)))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const [countRow] = await db
      .select({ total: count() })
      .from(bareMetalOrder)
      .leftJoin(billingTenant, eq(billingTenant.id, bareMetalOrder.tenantId))
      .leftJoin(crmProject, eq(crmProject.id, bareMetalOrder.projectId))
      .where(whereClause)

    const rows = await db
      .select({
        order: bareMetalOrder,
        tenantName: billingTenant.name,
        projectName: crmProject.name,
        dataCenterName: dataCenter.name,
      })
      .from(bareMetalOrder)
      .leftJoin(billingTenant, eq(billingTenant.id, bareMetalOrder.tenantId))
      .leftJoin(crmProject, eq(crmProject.id, bareMetalOrder.projectId))
      .leftJoin(dataCenter, eq(dataCenter.id, bareMetalOrder.dataCenterId))
      .where(whereClause)
      .orderBy(desc(bareMetalOrder.orderedAt))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map(mapListRow),
      total: Number(countRow?.total ?? 0),
    }
  },

  async getById(id: string): Promise<BareMetalOrderDetailDto | null> {
    const [head] = await db
      .select({
        order: bareMetalOrder,
        tenantName: billingTenant.name,
        projectName: crmProject.name,
        dataCenterName: dataCenter.name,
        customerName: customer.name,
        supplierName: supplier.name,
      })
      .from(bareMetalOrder)
      .leftJoin(billingTenant, eq(billingTenant.id, bareMetalOrder.tenantId))
      .leftJoin(crmProject, eq(crmProject.id, bareMetalOrder.projectId))
      .leftJoin(dataCenter, eq(dataCenter.id, bareMetalOrder.dataCenterId))
      .leftJoin(customer, eq(customer.id, bareMetalOrder.customerId))
      .leftJoin(supplier, eq(supplier.id, bareMetalOrder.supplierId))
      .where(eq(bareMetalOrder.id, id))
      .limit(1)

    if (!head) return null

    const deviceRows = await db
      .select({
        device: bareMetalOrderDevice,
        gpuCardTypeCode: gpuCardType.code,
      })
      .from(bareMetalOrderDevice)
      .leftJoin(gpuCardType, eq(gpuCardType.id, bareMetalOrderDevice.gpuCardTypeId))
      .where(eq(bareMetalOrderDevice.bareMetalOrderId, id))
      .orderBy(bareMetalOrderDevice.lineNo)

    const devices: BareMetalOrderDeviceDto[] = deviceRows.map(({ device, gpuCardTypeCode }) => {
      const payment = extractBareMetalDevicePayment(device.platformPayload)
      const rentStartsAt = toIso(device.rentStartsAt)
      const rentEndsAt = toIso(device.rentEndsAt)
      const revenuePending =
        payment?.revenuePending ??
        isBareMetalDeviceRevenuePending({
          deviceStatus: device.deviceStatus,
          rentStartsAt: device.rentStartsAt,
        })

      return {
        id: device.id,
        lineNo: device.lineNo,
        allocationStatus: device.allocationStatus,
        deviceModelText: device.deviceModelText,
        gpuCardTypeId: device.gpuCardTypeId,
        gpuCardTypeCode,
        gpuCount: device.gpuCount,
        durationHours: device.durationHours,
        unitPricePerCardHour: device.unitPricePerCardHour,
        lineAmount: device.lineAmount,
        rentStartsAt,
        rentEndsAt,
        supplierDeviceId: device.supplierDeviceId,
        platformDeviceId: device.platformDeviceId,
        deviceStatus: device.deviceStatus,
        revenuePending,
        discountAmount: payment?.discountAmount ?? null,
        balanceAmount: payment?.balanceAmount ?? null,
        couponAmount: payment?.couponAmount ?? null,
      }
    })

    const needsAllocation = devices.some(
      (d) => d.balanceAmount == null || d.couponAmount == null,
    )
    if (needsAllocation) {
      const paymentShares = allocateBareMetalDevicePaymentAmounts({
        devices,
        balanceAmount: head.order.balanceAmount,
        couponAmount: head.order.couponAmount,
      })
      for (let i = 0; i < devices.length; i++) {
        const device = devices[i]!
        if (device.balanceAmount != null && device.couponAmount != null) continue
        const share = paymentShares[i]
        if (!share) continue
        device.balanceAmount = share.balanceAmount
        device.couponAmount = share.couponAmount
      }
    }

    const base = mapListRow(head)
    const { order } = head

    // Fetch price snapshot
    const [priceSnapshotRow] = await db
      .select()
      .from(bareMetalOrderPriceSnapshot)
      .where(eq(bareMetalOrderPriceSnapshot.bareMetalOrderId, id))
      .limit(1)

    // Fetch recent order logs (last 20)
    const logRows = await db
      .select()
      .from(bareMetalOrderLog)
      .where(eq(bareMetalOrderLog.bareMetalOrderId, id))
      .orderBy(desc(bareMetalOrderLog.occurredAt))
      .limit(20)

    return {
      ...base,
      orderAmount: order.orderAmount,
      refundAmount: order.refundAmount,
      balanceAmount: order.balanceAmount,
      couponAmount: order.couponAmount,
      paidAt: toIso(order.paidAt),
      completedAt: toIso(order.completedAt),
      purchaseQty: order.purchaseQty,
      idcCode: order.idcCode,
      supplierId: order.supplierId,
      supplierName: head.supplierName,
      customerId: order.customerId,
      customerName: head.customerName,
      importBatchId: order.importBatchId,
      matchFlags: (order.matchFlags ?? {}) as Record<string, unknown>,
      remark: order.remark,
      devices,
      sshEnabled: order.sshEnabled,
      sshPublicKey: order.sshPublicKey,
      autoRenew: order.autoRenew,
      nextBillingAt: toIso(order.nextBillingAt),
      renewCount: order.renewCount,
      overdueRetries: order.overdueRetries,
      overdueAt: toIso(order.overdueAt),
      workspaceId: order.workspaceId,
      description: order.description,
      priceSnapshot: priceSnapshotRow
        ? {
            id: priceSnapshotRow.id,
            unitPricePerCardHour: priceSnapshotRow.unitPricePerCardHour,
            gpuCount: priceSnapshotRow.gpuCount,
            orderAmount: priceSnapshotRow.orderAmount,
            currency: priceSnapshotRow.currency,
            priceSource: priceSnapshotRow.priceSource,
          }
        : null,
      logs: logRows.map((log) => ({
        id: log.id,
        eventType: log.eventType,
        previousStatus: log.previousStatus,
        newStatus: log.newStatus,
        description: log.description,
        detail: (log.detail as Record<string, unknown>) ?? null,
        operatorId: log.operatorId,
        operatorSource: log.operatorSource,
        occurredAt: toIso(log.occurredAt)!,
      })),
    }
  },

  async listByProject(
    projectId: string,
    options?: ProjectBareMetalOrderListOptions,
  ): Promise<{ items: BareMetalOrderListItemDto[]; total: number }> {
    const billingTenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    if (billingTenantIds.length === 0) return { items: [], total: 0 }

    const page = options?.page ?? 1
    const pageSize = options?.pageSize ?? 20
    const offset = (page - 1) * pageSize
    const scopeClause = or(
      eq(bareMetalOrder.projectId, projectId),
      inArray(bareMetalOrder.tenantId, billingTenantIds),
    )
    const filterConditions = buildProjectBareMetalOrderFilterConditions(options ?? {})
    const whereClause =
      filterConditions.length > 0 ? and(scopeClause, ...filterConditions) : scopeClause

    const [countRow] = await db
      .select({ total: count() })
      .from(bareMetalOrder)
      .leftJoin(dataCenter, eq(dataCenter.id, bareMetalOrder.dataCenterId))
      .where(whereClause)

    const rows = await db
      .select({
        order: bareMetalOrder,
        tenantName: billingTenant.name,
        projectName: crmProject.name,
        dataCenterName: dataCenter.name,
      })
      .from(bareMetalOrder)
      .leftJoin(billingTenant, eq(billingTenant.id, bareMetalOrder.tenantId))
      .leftJoin(crmProject, eq(crmProject.id, bareMetalOrder.projectId))
      .leftJoin(dataCenter, eq(dataCenter.id, bareMetalOrder.dataCenterId))
      .where(whereClause)
      .orderBy(desc(bareMetalOrder.orderedAt))
      .limit(pageSize)
      .offset(offset)

    const items = rows.map(mapListRow)
    const { gpuCardSummaries, deviceModelSummaries } = await loadDeviceLineSummariesByOrderId(
      items.map((item) => item.id),
    )

    return {
      items: items.map((item) => ({
        ...item,
        gpuCardSummary: gpuCardSummaries.get(item.id) ?? null,
        deviceModelSummary: deviceModelSummaries.get(item.id) ?? null,
      })),
      total: Number(countRow?.total ?? 0),
    }
  },
}
