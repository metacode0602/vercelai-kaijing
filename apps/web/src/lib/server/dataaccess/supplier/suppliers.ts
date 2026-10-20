import { db } from '@/lib/db'
import { isRevenueSharePricingMode } from '@/lib/supplier/pricing-mode'
import type {
  ContractPricingMode,
  DataCenter,
  DataCenterDetail,
  DataCenterDevice,
  DataCenterStats,
  GPUCardType,
  GpuInventoryDetail,
  Supplier,
  SupplierBill,
  SupplierContract,
  SupplierPricingHistory,
  SupplierPricingRecord,
} from '@/lib/data/types'
import {
  mapDataCenterRow,
  mapGpuCardTypeRow,
  mapGpuInventoryRow,
  mapPhysicalDeviceListRows,
  mapSupplierBillDetailRow,
  mapSupplierBillRow,
  mapSupplierContractRow,
  mapSupplierPricingHistoryRow,
  mapSupplierPricingRecordRow,
  mapSupplierRow,
} from '@/lib/server/mappers/supply'
import { toNumber } from '@/lib/server/mappers/crm'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import {
  dataCenter,
  gpuCardType,
  supplier,
  supplierBill,
  supplierBillDetail,
  computeNode,
  supplierContract,
  supplierDevice,
  supplierGpuInventory,
  supplierPricingHistory,
  supplierPricingRecord,
  userStaff,
  entityStateTransitionLog,
} from '@workspace/db/schema'
import { resolveGpuCardTypeRole } from '@/lib/supplier/gpu-card-type-metrics'
import { normalizeDeviceOpsStatus } from '@/lib/supplier/device-import-utils'
import { and, count, eq, gt, ilike, inArray, ne, or, sql, sum } from 'drizzle-orm'
import { DEVICE_OPS_STATUS_SEEDS } from '@workspace/db/schema'
import { createId } from '@paralleldrive/cuid2'
import { notifyBillPaid } from '@workspace/shared-supplier/notifications'
import type { OpsStatusBreakdownItem, PhysicalDeviceRoleStats } from '@/lib/data/types'

/** markBillPaid 的操作者上下文，用于结算审计留痕 */
export type MarkBillPaidActor = {
  /** 付款操作人（user_staff.id），无法解析时为 null */
  operatorStaffId: string | null
  /** 实际付款人（自由文本，如财务姓名/账户名），落 supplier_bill.paid_by */
  paidBy: string | null
  /** 银行回单号 / 支付流水号 */
  paymentReference?: string | null
  /** 调整/扣罚说明，落 supplier_bill.adjustment_reason */
  adjustmentReason?: string | null
}

function emptyPhysicalDeviceRoleStats(): PhysicalDeviceRoleStats {
  return { total: 0, online: 0, maintenance: 0 }
}

type DataCenterInventoryCounts = { total: number; online: number; cpu: number }

function emptyDataCenterInventoryCounts(): DataCenterInventoryCounts {
  return { total: 0, online: 0, cpu: 0 }
}

function aggregateInventoryCountsByDataCenter(
  rows: Array<{
    dataCenterId: string
    quantity: number | null
    onlineQuantity: number | null
    cardTypeName: string
    cardTypeCode: string | null
    cardTypeDeviceRole: string | null
  }>,
): Map<string, DataCenterInventoryCounts> {
  const countMap = new Map<string, DataCenterInventoryCounts>()

  for (const row of rows) {
    const quantity = Number(row.quantity ?? 0)
    const onlineQuantity = Number(row.onlineQuantity ?? 0)
    const isCpuDevice =
      resolveGpuCardTypeRole({
        name: row.cardTypeName,
        code: row.cardTypeCode,
        deviceRole: row.cardTypeDeviceRole,
      }) === 'infra'

    const bucket = countMap.get(row.dataCenterId) ?? emptyDataCenterInventoryCounts()
    if (isCpuDevice) {
      bucket.cpu += quantity
    } else {
      bucket.total += quantity
      bucket.online += onlineQuantity
    }
    countMap.set(row.dataCenterId, bucket)
  }

  return countMap
}

async function fetchInventoryCountsByDataCenter(params: {
  supplierId?: string
  supplierIds?: string[]
  dataCenterId?: string
  dataCenterIds?: string[]
}): Promise<Map<string, DataCenterInventoryCounts>> {
  const conditions = []
  if (params.dataCenterId) {
    conditions.push(eq(supplierGpuInventory.dataCenterId, params.dataCenterId))
  }
  if (params.dataCenterIds?.length) {
    conditions.push(inArray(supplierGpuInventory.dataCenterId, params.dataCenterIds))
  }
  if (params.supplierId) {
    conditions.push(eq(supplierGpuInventory.supplierId, params.supplierId))
  }
  if (params.supplierIds?.length) {
    conditions.push(inArray(supplierGpuInventory.supplierId, params.supplierIds))
  }

  const invRows = await db
    .select({
      dataCenterId: supplierGpuInventory.dataCenterId,
      quantity: supplierGpuInventory.quantity,
      onlineQuantity: supplierGpuInventory.onlineQuantity,
      cardTypeName: gpuCardType.name,
      cardTypeCode: gpuCardType.code,
      cardTypeDeviceRole: gpuCardType.deviceRole,
    })
    .from(supplierGpuInventory)
    .innerJoin(gpuCardType, eq(supplierGpuInventory.gpuCardTypeId, gpuCardType.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  return aggregateInventoryCountsByDataCenter(invRows)
}

const KNOWN_DEVICE_OPS_STATUSES = DEVICE_OPS_STATUS_SEEDS.map((s) => s.stateCode)

function buildOpsStatusBreakdown(
  deviceRows: Array<{ opsStatus: string | null }>,
): OpsStatusBreakdownItem[] {
  const counts = new Map<string, number>()
  for (const row of deviceRows) {
    const normalized = normalizeDeviceOpsStatus(row.opsStatus ?? '预留闲置中')
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }

  const breakdown: OpsStatusBreakdownItem[] = KNOWN_DEVICE_OPS_STATUSES.map((opsStatus) => ({
    opsStatus,
    count: counts.get(opsStatus) ?? 0,
  }))

  let otherCount = 0
  for (const [opsStatus, count] of counts) {
    if (!KNOWN_DEVICE_OPS_STATUSES.includes(opsStatus)) {
      otherCount += count
    }
  }
  if (otherCount > 0) {
    breakdown.push({ opsStatus: '其他', count: otherCount })
  }

  return breakdown
}

function buildPhysicalDeviceStats(
  deviceRows: Array<{
    lifecycleStatus: string | null
    inMaintenance: boolean | null
    opsStatus: string | null
    cardTypeName: string
    cardTypeCode: string | null
    cardTypeDeviceRole: string | null
  }>,
) {
  const gpu = emptyPhysicalDeviceRoleStats()
  const cpu = emptyPhysicalDeviceRoleStats()

  for (const row of deviceRows) {
    const isCpuDevice =
      resolveGpuCardTypeRole({
        name: row.cardTypeName,
        code: row.cardTypeCode,
        deviceRole: row.cardTypeDeviceRole,
      }) === 'infra'
    const bucket = isCpuDevice ? cpu : gpu
    bucket.total += 1
    if (row.lifecycleStatus === '在线') bucket.online += 1
    if (row.lifecycleStatus === '维护中' || row.inMaintenance) bucket.maintenance += 1
  }

  return {
    total: deviceRows.length,
    online: deviceRows.filter((d) => d.lifecycleStatus === '在线').length,
    maintenance: deviceRows.filter(
      (d) => d.lifecycleStatus === '维护中' || d.inMaintenance,
    ).length,
    gpu,
    cpu,
    opsStatusBreakdown: buildOpsStatusBreakdown(deviceRows),
  }
}

function newId() {
  return crypto.randomUUID()
}

function deriveManualSupplierCode(id: string, shortName: string, existingCodes: Set<string>): string {
  const slug = shortName
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '')
    .slice(0, 12)
    .toUpperCase()
  const base = slug ? `SUP-${slug}` : `SUP-CRM-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
  let code = base
  let n = 2
  while (existingCodes.has(code)) {
    code = `${base}-${n}`
    n++
  }
  return code
}

export type SupplierListFilters = {
  externalTenantId?: string
  search?: string
  status?: string
  /** 按计价方式过滤 supplier.default_cooperation_mode */
  pricingMode?: string
  page?: number
  pageSize?: number
}

export type SupplierListOverviewStats = {
  total: number
  cooperating: number
  totalDataCenters: number
  totalDevices: number
  monthlySettlement: number
}

export type SupplierListResult = {
  items: Supplier[]
  total: number
  page: number
  pageSize: number
  overviewStats: SupplierListOverviewStats
}

export type DataCenterListFilters = {
  supplierId?: string
  search?: string
  status?: string
  cooperationStatus?: string
  containerInstanceRegion?: string
  page?: number
  pageSize?: number
}

export type DataCenterListResult = {
  items: DataCenter[]
  total: number
  page: number
  pageSize: number
}

export type GpuInventoryListFilters = {
  supplierId?: string
  dataCenterId?: string
  search?: string
  status?: string
  isInternalTest?: 'all' | 'yes' | 'no'
  page?: number
  pageSize?: number
}

export type GpuInventoryListResult = {
  items: DataCenterDevice[]
  total: number
  page: number
  pageSize: number
  stats: {
    totalQuantity: number
    totalOnline: number
    maintenance: number
    internalTest: number
  }
}

export const suppliersDataAccess = {
  /** 不分页拉取全部供应商（导入/绑定等内部场景） */
  async listAll(input: Omit<SupplierListFilters, 'page' | 'pageSize'> = {}): Promise<Supplier[]> {
    const all: Supplier[] = []
    let page = 1
    for (;;) {
      const result = await this.list({ ...input, page, pageSize: 100 })
      all.push(...result.items)
      if (page * 100 >= result.total || result.items.length === 0) break
      page += 1
    }
    return all
  },

  async list(input: SupplierListFilters = {}): Promise<SupplierListResult> {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const conditions = []
    if (input.externalTenantId) {
      conditions.push(eq(supplier.externalTenantId, input.externalTenantId))
    }
    if (input.status && input.status !== 'all') {
      conditions.push(eq(supplier.status, input.status))
    } else if (input.status === 'all') {
      conditions.push(ne(supplier.status, 'suspended'))
    }
    if (input.pricingMode && input.pricingMode !== 'all') {
      conditions.push(eq(supplier.defaultCooperationMode, input.pricingMode))
    }
    if (input.search?.trim()) {
      const q = `%${input.search.trim()}%`
      conditions.push(
        or(
          ilike(supplier.name, q),
          ilike(supplier.shortName, q),
          ilike(userStaff.displayName, q),
          ilike(supplier.externalTenantId, q),
        )!,
      )
    }
    const where = conditions.length ? and(...conditions) : undefined

    const overviewBaseConditions = []
    if (input.externalTenantId) {
      overviewBaseConditions.push(eq(supplier.externalTenantId, input.externalTenantId))
    }
    const overviewWhere =
      overviewBaseConditions.length > 0 ? and(...overviewBaseConditions) : undefined

    const [totalRow, pageRows, overviewTotalRow, cooperatingRow, dcTotalRow, deviceTotalRow] =
      await Promise.all([
        db
          .select({ value: count() })
          .from(supplier)
          .leftJoin(userStaff, eq(supplier.businessManagerStaffId, userStaff.id))
          .where(where),
        db
          .select({
            row: supplier,
            businessManagerName: userStaff.displayName,
          })
          .from(supplier)
          .leftJoin(userStaff, eq(supplier.businessManagerStaffId, userStaff.id))
          .where(where)
          .orderBy(sql`${supplier.updatedAt} DESC`)
          .limit(pageSize)
          .offset(offset),
        db.select({ value: count() }).from(supplier).where(overviewWhere),
        db
          .select({ value: count() })
          .from(supplier)
          .where(
            overviewWhere
              ? and(overviewWhere, eq(supplier.status, 'cooperating'))
              : eq(supplier.status, 'cooperating'),
          ),
        overviewWhere
          ? db
              .select({ value: count() })
              .from(dataCenter)
              .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
              .where(overviewWhere)
          : db.select({ value: count() }).from(dataCenter),
        overviewWhere
          ? db
              .select({ value: count() })
              .from(supplierDevice)
              .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
              .where(overviewWhere)
          : db.select({ value: count() }).from(supplierDevice),
      ])

    const supplierIds = pageRows.map((r) => r.row.id)
    const [dcCounts, deviceCounts] =
      supplierIds.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .select({ supplierId: dataCenter.supplierId, value: count() })
              .from(dataCenter)
              .where(inArray(dataCenter.supplierId, supplierIds))
              .groupBy(dataCenter.supplierId),
            db
              .select({ supplierId: supplierDevice.supplierId, value: count() })
              .from(supplierDevice)
              .where(inArray(supplierDevice.supplierId, supplierIds))
              .groupBy(supplierDevice.supplierId),
          ])

    const dcMap = new Map(dcCounts.map((r) => [r.supplierId, Number(r.value)]))
    const devMap = new Map(deviceCounts.map((r) => [r.supplierId, Number(r.value)]))

    return {
      items: pageRows.map(({ row, businessManagerName }) =>
        mapSupplierRow(row, businessManagerName, {
          dataCenterCount: dcMap.get(row.id) ?? 0,
          totalDeviceCount: devMap.get(row.id) ?? 0,
        }),
      ),
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
      overviewStats: {
        total: Number(overviewTotalRow[0]?.value ?? 0),
        cooperating: Number(cooperatingRow[0]?.value ?? 0),
        totalDataCenters: Number(dcTotalRow[0]?.value ?? 0),
        totalDevices: Number(deviceTotalRow[0]?.value ?? 0),
        monthlySettlement: 0,
      },
    }
  },

  async getById(id: string): Promise<Supplier | null> {
    const [hit] = await db
      .select({
        row: supplier,
        businessManagerName: userStaff.displayName,
      })
      .from(supplier)
      .leftJoin(userStaff, eq(supplier.businessManagerStaffId, userStaff.id))
      .where(eq(supplier.id, id))
      .limit(1)

    if (!hit) return null

    const [dcRow] = await db
      .select({ value: count() })
      .from(dataCenter)
      .where(eq(dataCenter.supplierId, id))

    const [devRow] = await db
      .select({ supplierId: supplierGpuInventory.supplierId, value: sum(supplierGpuInventory.quantity) })
      .from(supplierGpuInventory)
      .where(eq(supplierGpuInventory.supplierId, id))
      .groupBy(supplierGpuInventory.supplierId)

    const [latestBill] = await db
      .select({ finalAmount: supplierBill.finalAmount })
      .from(supplierBill)
      .where(eq(supplierBill.supplierId, id))
      .orderBy(sql`${supplierBill.billMonth} DESC`)
      .limit(1)

    const mapped = mapSupplierRow(hit.row, hit.businessManagerName, {
      dataCenterCount: Number(dcRow?.value ?? 0),
      totalDeviceCount: Number(devRow?.value ?? 0),
    })
    if (latestBill?.finalAmount != null) {
      mapped.monthlySettlement = toNumber(latestBill.finalAmount)
    }
    return mapped
  },

  async listDataCentersBySupplier(supplierId: string): Promise<DataCenter[]> {
    const supplierRow = await db.query.supplier.findFirst({
      where: eq(supplier.id, supplierId),
      columns: { id: true, name: true },
    })
    if (!supplierRow) return []

    const dcRows = await db
      .select()
      .from(dataCenter)
      .where(eq(dataCenter.supplierId, supplierId))
      .orderBy(sql`${dataCenter.createdAt} DESC`)

    const invCounts = await fetchInventoryCountsByDataCenter({ supplierId })

    return dcRows.map((row) =>
      mapDataCenterRow(row, supplierRow.name, invCounts.get(row.id)),
    )
  },

  async listDataCentersBySupplierIds(supplierIds: string[]): Promise<DataCenter[]> {
    if (supplierIds.length === 0) return []

    const supplierRows = await db
      .select({ id: supplier.id, name: supplier.name })
      .from(supplier)
      .where(inArray(supplier.id, supplierIds))
    const nameMap = new Map(supplierRows.map((r) => [r.id, r.name]))

    const dcRows = await db
      .select()
      .from(dataCenter)
      .where(inArray(dataCenter.supplierId, supplierIds))
      .orderBy(sql`${dataCenter.createdAt} DESC`)

    const invCounts = await fetchInventoryCountsByDataCenter({ supplierIds })

    return dcRows.map((row) =>
      mapDataCenterRow(row, nameMap.get(row.supplierId) ?? '', invCounts.get(row.id)),
    )
  },

  async listAllDataCenters(params: DataCenterListFilters = {}): Promise<DataCenterListResult> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const conditions = []
    if (params.supplierId) {
      conditions.push(eq(dataCenter.supplierId, params.supplierId))
    }
    if (params.status && params.status !== 'all') {
      conditions.push(eq(dataCenter.status, params.status))
    }
    if (params.cooperationStatus && params.cooperationStatus !== 'all') {
      conditions.push(eq(dataCenter.cooperationStatus, params.cooperationStatus))
    }
    if (params.containerInstanceRegion?.trim()) {
      const q = `%${params.containerInstanceRegion.trim()}%`
      conditions.push(ilike(dataCenter.containerInstanceRegion, q))
    }
    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`
      conditions.push(
        or(
          ilike(dataCenter.name, q),
          ilike(dataCenter.code, q),
          ilike(supplier.name, q),
          ilike(dataCenter.address, q),
          ilike(dataCenter.location, q),
          ilike(dataCenter.containerInstanceRegion, q),
        )!,
      )
    }
    const where = conditions.length ? and(...conditions) : undefined

    const [totalRow, dcRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(dataCenter)
        .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
        .where(where),
      db
        .select({
          dataCenter,
          supplierName: supplier.name,
        })
        .from(dataCenter)
        .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
        .where(where)
        .orderBy(sql`${dataCenter.createdAt} DESC`)
        .limit(pageSize)
        .offset(offset),
    ])

    const dcIds = dcRows.map((r) => r.dataCenter.id)
    const invCounts =
      dcIds.length === 0
        ? new Map()
        : await fetchInventoryCountsByDataCenter({
            dataCenterIds: dcIds,
          })

    return {
      items: dcRows.map((row) =>
        mapDataCenterRow(row.dataCenter, row.supplierName, invCounts.get(row.dataCenter.id)),
      ),
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
    }
  },

  async getDataCenterStats(params?: { supplierId?: string }): Promise<DataCenterStats> {
    const dcConditions = params?.supplierId
      ? eq(dataCenter.supplierId, params.supplierId)
      : undefined

    const dcRows = await db
      .select({ status: dataCenter.status })
      .from(dataCenter)
      .where(dcConditions)

    const invCounts = await fetchInventoryCountsByDataCenter(
      params?.supplierId ? { supplierId: params.supplierId } : {},
    )
    let totalGpu = 0
    let onlineGpu = 0
    for (const counts of invCounts.values()) {
      totalGpu += counts.total
      onlineGpu += counts.online
    }

    return {
      total: dcRows.length,
      online: dcRows.filter((r) => r.status === 'online').length,
      offline: dcRows.filter((r) => r.status === 'offline').length,
      maintenance: dcRows.filter((r) => r.status === 'maintenance').length,
      totalGpu,
      onlineGpu,
    }
  },

  async getDataCenterDetail(dataCenterId: string): Promise<DataCenterDetail | null> {
    const [hit] = await db
      .select({
        dataCenter: dataCenter,
        supplierName: supplier.name,
      })
      .from(dataCenter)
      .innerJoin(supplier, eq(dataCenter.supplierId, supplier.id))
      .where(eq(dataCenter.id, dataCenterId))
      .limit(1)

    if (!hit) return null

    const invCounts = await fetchInventoryCountsByDataCenter({ dataCenterId })
    const inventoryCounts = invCounts.get(dataCenterId) ?? emptyDataCenterInventoryCounts()

    const mappedDataCenter = mapDataCenterRow(hit.dataCenter, hit.supplierName, inventoryCounts)

    const [cardTypeCountRow] = await db
      .select({ value: count() })
      .from(supplierGpuInventory)
      .where(
        and(
          eq(supplierGpuInventory.dataCenterId, dataCenterId),
          gt(supplierGpuInventory.quantity, 0),
        ),
      )

    const deviceRows = await db
      .select({
        lifecycleStatus: supplierDevice.lifecycleStatus,
        inMaintenance: supplierDevice.inMaintenance,
        opsStatus: supplierDevice.opsStatus,
        cardTypeName: gpuCardType.name,
        cardTypeCode: gpuCardType.code,
        cardTypeDeviceRole: gpuCardType.deviceRole,
      })
      .from(supplierDevice)
      .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .where(eq(supplierDevice.dataCenterId, dataCenterId))

    const physicalDeviceStats = buildPhysicalDeviceStats(deviceRows)

    return {
      dataCenter: mappedDataCenter,
      physicalDeviceStats,
      inventoryStats: {
        cardTypeCount: Number(cardTypeCountRow?.value ?? 0),
        totalGpu: inventoryCounts.total,
        onlineGpu: inventoryCounts.online,
      },
    }
  },

  async listGpuInventory(params: GpuInventoryListFilters = {}): Promise<GpuInventoryListResult> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const conditions = [gt(supplierGpuInventory.quantity, 0)]
    if (params.supplierId) {
      conditions.push(eq(supplierGpuInventory.supplierId, params.supplierId))
    }
    if (params.dataCenterId) {
      conditions.push(eq(supplierGpuInventory.dataCenterId, params.dataCenterId))
    }
    if (params.status && params.status !== 'all') {
      conditions.push(eq(supplierGpuInventory.status, params.status))
    }
    if (params.isInternalTest === 'yes') {
      conditions.push(eq(supplierGpuInventory.isInternalTest, true))
    } else if (params.isInternalTest === 'no') {
      conditions.push(eq(supplierGpuInventory.isInternalTest, false))
    }
    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`
      conditions.push(
        or(
          ilike(dataCenter.name, q),
          ilike(gpuCardType.name, q),
          ilike(supplier.shortName, q),
          ilike(supplier.name, q),
        )!,
      )
    }
    const where = and(...conditions)
    const statsConditions = [gt(supplierGpuInventory.quantity, 0)]
    if (params.supplierId) {
      statsConditions.push(eq(supplierGpuInventory.supplierId, params.supplierId))
    }
    if (params.dataCenterId) {
      statsConditions.push(eq(supplierGpuInventory.dataCenterId, params.dataCenterId))
    }
    const statsWhere = and(...statsConditions)

    const [totalRow, statsRow, rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(supplierGpuInventory)
        .innerJoin(dataCenter, eq(supplierGpuInventory.dataCenterId, dataCenter.id))
        .innerJoin(gpuCardType, eq(supplierGpuInventory.gpuCardTypeId, gpuCardType.id))
        .innerJoin(supplier, eq(supplierGpuInventory.supplierId, supplier.id))
        .where(where),
      db
        .select({
          totalQuantity: sum(supplierGpuInventory.quantity),
          totalOnline: sum(supplierGpuInventory.onlineQuantity),
          maintenance: sql<number>`count(*) filter (where ${supplierGpuInventory.status} = 'maintenance')`,
          internalTest: sql<number>`count(*) filter (where ${supplierGpuInventory.isInternalTest} = true)`,
        })
        .from(supplierGpuInventory)
        .where(statsWhere),
      db
        .select({
          inventory: supplierGpuInventory,
          dataCenterName: dataCenter.name,
          cardTypeName: gpuCardType.name,
          cardTypeCode: gpuCardType.code,
          cardTypeDeviceRole: gpuCardType.deviceRole,
          supplierShortName: supplier.shortName,
        })
        .from(supplierGpuInventory)
        .innerJoin(dataCenter, eq(supplierGpuInventory.dataCenterId, dataCenter.id))
        .innerJoin(gpuCardType, eq(supplierGpuInventory.gpuCardTypeId, gpuCardType.id))
        .innerJoin(supplier, eq(supplierGpuInventory.supplierId, supplier.id))
        .where(where)
        .orderBy(supplier.shortName, dataCenter.name, gpuCardType.name)
        .limit(pageSize)
        .offset(offset),
    ])

    return {
      items: rows.map(
        ({
          inventory,
          dataCenterName,
          cardTypeName,
          cardTypeCode,
          cardTypeDeviceRole,
          supplierShortName,
        }) =>
          mapGpuInventoryRow(inventory, {
            dataCenterName,
            cardTypeName,
            cardTypeCode,
            cardTypeDeviceRole,
            supplierShortName,
          }),
      ),
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
      stats: {
        totalQuantity: Number(statsRow[0]?.totalQuantity ?? 0),
        totalOnline: Number(statsRow[0]?.totalOnline ?? 0),
        maintenance: Number(statsRow[0]?.maintenance ?? 0),
        internalTest: Number(statsRow[0]?.internalTest ?? 0),
      },
    }
  },

  /** 不分页：机房详情等内部场景 */
  async listGpuInventoryAll(params?: { supplierId?: string }): Promise<DataCenterDevice[]> {
    const conditions = [gt(supplierGpuInventory.quantity, 0)]
    if (params?.supplierId) {
      conditions.push(eq(supplierGpuInventory.supplierId, params.supplierId))
    }

    const rows = await db
      .select({
        inventory: supplierGpuInventory,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
        cardTypeCode: gpuCardType.code,
        cardTypeDeviceRole: gpuCardType.deviceRole,
        supplierShortName: supplier.shortName,
      })
      .from(supplierGpuInventory)
      .innerJoin(dataCenter, eq(supplierGpuInventory.dataCenterId, dataCenter.id))
      .innerJoin(gpuCardType, eq(supplierGpuInventory.gpuCardTypeId, gpuCardType.id))
      .innerJoin(supplier, eq(supplierGpuInventory.supplierId, supplier.id))
      .where(and(...conditions))
      .orderBy(supplier.shortName, dataCenter.name, gpuCardType.name)

    return rows.map(
      ({
        inventory,
        dataCenterName,
        cardTypeName,
        cardTypeCode,
        cardTypeDeviceRole,
        supplierShortName,
      }) =>
        mapGpuInventoryRow(inventory, {
          dataCenterName,
          cardTypeName,
          cardTypeCode,
          cardTypeDeviceRole,
          supplierShortName,
        }),
    )
  },

  async getGpuInventoryDetail(
    inventoryId: string,
    options?: { page?: number; pageSize?: number },
  ): Promise<GpuInventoryDetail | null> {
    const [hit] = await db
      .select({
        inventory: supplierGpuInventory,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
        cardTypeCode: gpuCardType.code,
        cardTypeDeviceRole: gpuCardType.deviceRole,
        supplierShortName: supplier.shortName,
      })
      .from(supplierGpuInventory)
      .innerJoin(dataCenter, eq(supplierGpuInventory.dataCenterId, dataCenter.id))
      .innerJoin(gpuCardType, eq(supplierGpuInventory.gpuCardTypeId, gpuCardType.id))
      .innerJoin(supplier, eq(supplierGpuInventory.supplierId, supplier.id))
      .where(eq(supplierGpuInventory.id, inventoryId))
      .limit(1)

    if (!hit) return null

    const inventory = mapGpuInventoryRow(hit.inventory, {
      dataCenterName: hit.dataCenterName,
      cardTypeName: hit.cardTypeName,
      cardTypeCode: hit.cardTypeCode,
      cardTypeDeviceRole: hit.cardTypeDeviceRole,
      supplierShortName: hit.supplierShortName,
    })

    const page = Math.max(1, options?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const deviceWhere = and(
      eq(supplierDevice.supplierId, inventory.supplierId),
      eq(supplierDevice.dataCenterId, inventory.dataCenterId),
      eq(supplierDevice.gpuCardTypeId, inventory.cardTypeId),
      ne(supplierDevice.lifecycleStatus, '退订'),
    )

    const [totalRow, statsDeviceRows, deviceRows] = await Promise.all([
      db.select({ value: count() }).from(supplierDevice).where(deviceWhere),
      db
        .select({
          lifecycleStatus: supplierDevice.lifecycleStatus,
          inMaintenance: supplierDevice.inMaintenance,
          opsStatus: supplierDevice.opsStatus,
          cardTypeName: gpuCardType.name,
          cardTypeCode: gpuCardType.code,
          cardTypeDeviceRole: gpuCardType.deviceRole,
        })
        .from(supplierDevice)
        .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
        .where(deviceWhere),
      db
        .select({
          device: supplierDevice,
          supplierShortName: supplier.shortName,
          cardTypeName: gpuCardType.name,
          cardTypeCode: gpuCardType.code,
          cardTypeDeviceRole: gpuCardType.deviceRole,
          clusterName: computeNode.clusterName,
          nodeRole: computeNode.nodeRole,
          expectedService: computeNode.expectedService,
        })
        .from(supplierDevice)
        .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
        .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
        .leftJoin(computeNode, eq(computeNode.supplierDeviceId, supplierDevice.id))
        .where(deviceWhere)
        .orderBy(sql`${supplierDevice.updatedAt} DESC`)
        .limit(pageSize)
        .offset(offset),
    ])

    const physicalDevices = mapPhysicalDeviceListRows(deviceRows)
    const physicalDeviceStats = buildPhysicalDeviceStats(statsDeviceRows)

    return {
      inventory,
      physicalDevices,
      physicalDeviceStats,
      physicalDevicesTotal: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
    }
  },

  async listContractsBySupplier(supplierId: string): Promise<SupplierContract[]> {
    const supplierRow = await db.query.supplier.findFirst({
      where: eq(supplier.id, supplierId),
      columns: { id: true, name: true },
    })
    if (!supplierRow) return []

    const contractRows = await db
      .select()
      .from(supplierContract)
      .where(eq(supplierContract.supplierId, supplierId))
      .orderBy(sql`${supplierContract.createdAt} DESC`)

    return contractRows.map((row) => mapSupplierContractRow(row, supplierRow.name))
  },

  async listAllContracts(): Promise<SupplierContract[]> {
    const rows = await db
      .select({
        contract: supplierContract,
        supplierShortName: supplier.shortName,
      })
      .from(supplierContract)
      .innerJoin(supplier, eq(supplierContract.supplierId, supplier.id))
      .orderBy(sql`${supplierContract.createdAt} DESC`)

    return rows.map(({ contract, supplierShortName }) =>
      mapSupplierContractRow(contract, supplierShortName),
    )
  },

  async listBillsBySupplier(supplierId: string): Promise<SupplierBill[]> {
    const supplierRow = await db.query.supplier.findFirst({
      where: eq(supplier.id, supplierId),
      columns: { id: true, name: true },
    })
    if (!supplierRow) return []

    const billRows = await db
      .select()
      .from(supplierBill)
      .where(eq(supplierBill.supplierId, supplierId))
      .orderBy(sql`${supplierBill.billMonth} DESC`)

    if (billRows.length === 0) return []

    const billIds = billRows.map((b) => b.id)
    const detailRows = await db
      .select({
        detail: supplierBillDetail,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
      })
      .from(supplierBillDetail)
      .innerJoin(dataCenter, eq(supplierBillDetail.dataCenterId, dataCenter.id))
      .innerJoin(gpuCardType, eq(supplierBillDetail.gpuCardTypeId, gpuCardType.id))
      .where(inArray(supplierBillDetail.billId, billIds))

    const detailsByBill = new Map<string, SupplierBill['details']>()
    for (const { detail, dataCenterName, cardTypeName } of detailRows) {
      const list = detailsByBill.get(detail.billId) ?? []
      list.push(mapSupplierBillDetailRow(detail, { dataCenterName, cardTypeName }))
      detailsByBill.set(detail.billId, list)
    }

    return billRows.map((row) =>
      mapSupplierBillRow(row, supplierRow.name, detailsByBill.get(row.id) ?? []),
    )
  },

  async markBillPaid(
    billId: string,
    actor: MarkBillPaidActor,
  ): Promise<SupplierBill> {
    // 状态守卫 + 审计 + 通知必须原子：任一步失败都要整体回滚，
    // 否则会出现「账单已标记已付款但没有审计记录/供应商没收到通知」。
    const paidAt = new Date()
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(supplierBill)
        .set({
          status: 'paid',
          paidAt,
          paidBy: actor.paidBy,
          paymentReference: actor.paymentReference ?? null,
          adjustmentReason: actor.adjustmentReason ?? null,
        })
        // status='confirmed' 守卫写在 SQL 里，不能只在 JS 里先查后判：
        // 供应商可能同时点「确认」，或两个运营同时点「标记已付款」，
        // 缺守卫会出现重复付款标记 / 把已付款账单改回。
        .where(
          and(
            eq(supplierBill.id, billId),
            eq(supplierBill.status, 'confirmed'),
          ),
        )
        .returning({
          id: supplierBill.id,
          supplierId: supplierBill.supplierId,
          billMonth: supplierBill.billMonth,
          finalAmount: supplierBill.finalAmount,
        })

      const bill = rows[0]
      if (!bill) return null

      await tx.insert(entityStateTransitionLog).values({
        id: createId(),
        entityType: 'supplier_bill',
        entityId: bill.id,
        fromState: 'confirmed',
        toState: 'paid',
        operatorStaffId: actor.operatorStaffId ?? null,
        reasonCode: 'PAYMENT_SETTLED',
        occurredAt: paidAt,
        payload: {
          billMonth: bill.billMonth,
          finalAmount: bill.finalAmount,
          paymentReference: actor.paymentReference ?? null,
        },
      })

      await notifyBillPaid(
        tx,
        bill.supplierId,
        bill.billMonth,
        bill.finalAmount,
        paidAt,
        actor.paymentReference ?? null,
      )

      return bill
    })

    if (!updated) {
      // 未命中：账单不存在，或状态不是 confirmed。查询只为给出可操作的错误提示。
      const [existing] = await db
        .select({ status: supplierBill.status })
        .from(supplierBill)
        .where(eq(supplierBill.id, billId))
        .limit(1)

      if (!existing) {
        throw new Error('账单不存在')
      }
      throw new Error(`账单当前状态为 ${existing.status}，只有已确认（confirmed）的账单可以标记为已结算`)
    }

    const bills = await this.listBillsBySupplier(updated.supplierId)
    const result = bills.find((b) => b.id === billId)
    if (!result) {
      throw new Error('账单更新后读取失败')
    }
    return result
  },

  async listPricingRecordsBySupplier(supplierId: string): Promise<SupplierPricingRecord[]> {
    const supplierRow = await db.query.supplier.findFirst({
      where: eq(supplier.id, supplierId),
      columns: { id: true, name: true },
    })
    if (!supplierRow) return []

    const rows = await db
      .select({
        record: supplierPricingRecord,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
        updatedByName: userStaff.displayName,
      })
      .from(supplierPricingRecord)
      .innerJoin(dataCenter, eq(supplierPricingRecord.dataCenterId, dataCenter.id))
      .innerJoin(gpuCardType, eq(supplierPricingRecord.gpuCardTypeId, gpuCardType.id))
      .leftJoin(userStaff, eq(supplierPricingRecord.updatedByStaffId, userStaff.id))
      .where(eq(supplierPricingRecord.supplierId, supplierId))
      .orderBy(dataCenter.name, gpuCardType.name)

    return rows.map(({ record, dataCenterName, cardTypeName, updatedByName }) =>
      mapSupplierPricingRecordRow(
        record,
        { supplierName: supplierRow.name, dataCenterName, cardTypeName },
        updatedByName,
      ),
    )
  },

  async listPricingHistoryBySupplier(supplierId: string): Promise<SupplierPricingHistory[]> {
    const supplierRow = await db.query.supplier.findFirst({
      where: eq(supplier.id, supplierId),
      columns: { id: true, name: true },
    })
    if (!supplierRow) return []

    const rows = await db
      .select({
        history: supplierPricingHistory,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
        changedByName: userStaff.displayName,
      })
      .from(supplierPricingHistory)
      .innerJoin(dataCenter, eq(supplierPricingHistory.dataCenterId, dataCenter.id))
      .innerJoin(gpuCardType, eq(supplierPricingHistory.gpuCardTypeId, gpuCardType.id))
      .innerJoin(userStaff, eq(supplierPricingHistory.changedByStaffId, userStaff.id))
      .where(eq(supplierPricingHistory.supplierId, supplierId))
      .orderBy(sql`${supplierPricingHistory.changedAt} DESC`)

    return rows.map(({ history, dataCenterName, cardTypeName, changedByName }) =>
      mapSupplierPricingHistoryRow(history, {
        supplierName: supplierRow.name,
        dataCenterName,
        cardTypeName,
        changedBy: changedByName ?? '—',
      }),
    )
  },

  async listActiveGpuCardTypes(): Promise<GPUCardType[]> {
    const rows = await db
      .select()
      .from(gpuCardType)
      .where(eq(gpuCardType.status, 'active'))
      .orderBy(gpuCardType.name)

    return rows.map(mapGpuCardTypeRow)
  },

  async assertSupplierExists(supplierId: string): Promise<{ id: string; name: string }> {
    const row = await db.query.supplier.findFirst({
      where: eq(supplier.id, supplierId),
      columns: { id: true, name: true },
    })
    if (!row) {
      throw new Error('供应商不存在')
    }
    return row
  },

  async create(input: {
    name: string
    shortName: string
    status: Supplier['status']
    /** 供应商默认计价方式，落库到 supplier.default_cooperation_mode */
    pricingMode: ContractPricingMode
    revenueShareRatio?: number
    businessManagerStaffId: string
    contactPerson: string
    contactPhone: string
    contactEmail: string
    address: string
    bankAccount?: string
    bankName?: string
  }): Promise<Supplier> {
    const staff = await staffDataAccess.getById(input.businessManagerStaffId)
    if (!staff || staff.status !== 'active') {
      throw new Error('默认商务经理无效或已停用')
    }

    const id = newId()
    const existingCodes = new Set(
      (await db.select({ code: supplier.code }).from(supplier)).map((row) => row.code),
    )
    const code = deriveManualSupplierCode(id, input.shortName, existingCodes)

    await db.insert(supplier).values({
      id,
      code,
      externalTenantId: `crm-manual-${id}`,
      name: input.name,
      shortName: input.shortName,
      status: input.status,
      defaultCooperationMode: input.pricingMode,
      // 仅分成计价方式才落分成比例；卡时/阶梯卡时下该字段无意义。
      defaultRevenueSharePercent:
        isRevenueSharePricingMode(input.pricingMode) && input.revenueShareRatio != null
          ? String(input.revenueShareRatio)
          : null,
      businessManagerStaffId: input.businessManagerStaffId,
      contactPerson: input.contactPerson,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      address: input.address,
      bankAccount: input.bankAccount ?? null,
      bankName: input.bankName ?? null,
      source: 'manual',
    })

    const created = await this.getById(id)
    if (!created) {
      throw new Error('创建供应商失败')
    }
    return created
  },

  async update(input: {
    id: string
    name: string
    shortName: string
    status: Supplier['status']
    /** 供应商默认计价方式，落库到 supplier.default_cooperation_mode */
    pricingMode: ContractPricingMode
    revenueShareRatio?: number
    businessManagerStaffId: string
    contactPerson: string
    contactPhone: string
    contactEmail: string
    address: string
    bankAccount?: string
    bankName?: string
  }): Promise<Supplier> {
    await this.assertSupplierExists(input.id)

    await db
      .update(supplier)
      .set({
        name: input.name,
        shortName: input.shortName,
        status: input.status,
        defaultCooperationMode: input.pricingMode,
        // 仅分成计价方式才落分成比例；卡时/阶梯卡时下该字段无意义。
        defaultRevenueSharePercent:
          isRevenueSharePricingMode(input.pricingMode) && input.revenueShareRatio != null
            ? String(input.revenueShareRatio)
            : null,
        businessManagerStaffId: input.businessManagerStaffId,
        contactPerson: input.contactPerson,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        address: input.address,
        bankAccount: input.bankAccount ?? null,
        bankName: input.bankName ?? null,
      })
      .where(eq(supplier.id, input.id))

    const updated = await this.getById(input.id)
    if (!updated) {
      throw new Error('供应商不存在')
    }
    return updated
  },
}

export { newId as newSupplierId }
