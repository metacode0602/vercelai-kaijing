import { db } from '@/lib/db'
import {
  supplierContract,
  supplierContractCapacityLine,
  supplierPricingTier,
  accessConditionSheet,
  supplierDevice,
  supplier,
  dataCenter,
  gpuCardType,
} from '@workspace/db/schema'
import { and, eq, count, sql, inArray, or, ilike, isNull } from 'drizzle-orm'
import { sendContractToSupplier } from './contract-notifications'

function newId() {
  return crypto.randomUUID()
}

function generateContractNo(): string {
  const now = new Date()
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `SC${ts}${rand}`
}

function buildCapacitySummary(lines: { deviceQuantity: number; gpuQuantity: number; dataCenterId: string }[]): string {
  const totalDevices = lines.reduce((s, l) => s + (l.deviceQuantity ?? 0), 0)
  const totalGpus = lines.reduce((s, l) => s + (l.gpuQuantity ?? 0), 0)
  const dcCount = new Set(lines.map((l) => l.dataCenterId)).size
  return `${dcCount} 个机房，共 ${totalDevices} 台设备，${totalGpus} 张 GPU`
}

export interface ContractListInput {
  supplierId?: string
  status?: string
  type?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export const contractDataAccess = {
  async list(input: ContractListInput): Promise<PaginatedResult<any>> {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    const conditions: any[] = []

    if (input.supplierId) conditions.push(eq(supplierContract.supplierId, input.supplierId))
    if (input.status) conditions.push(eq(supplierContract.status, input.status))
    if (input.type) conditions.push(eq(supplierContract.type, input.type))
    if (input.search) {
      const q = `%${input.search}%`
      conditions.push(or(ilike(supplierContract.contractNo, q), ilike(supplier.shortName, q))!)
    }

    const where = conditions.length ? and(...conditions) : undefined
    const offset = (page - 1) * pageSize

    const [totalRow] = await db
      .select({ total: count() })
      .from(supplierContract)
      .innerJoin(supplier, eq(supplierContract.supplierId, supplier.id))
      .where(where)

    const total = Number(totalRow?.total ?? 0)

    const rows = await db
      .select({
        contract: supplierContract,
        supplierName: supplier.shortName,
      })
      .from(supplierContract)
      .innerJoin(supplier, eq(supplierContract.supplierId, supplier.id))
      .where(where)
      .orderBy(sql`${supplierContract.createdAt} DESC`)
      .limit(pageSize)
      .offset(offset)

    const contractIds = rows.map((r) => r.contract.id)
    const capacityCounts =
      contractIds.length === 0
        ? []
        : await db
            .select({
              contractId: supplierContractCapacityLine.contractId,
              total: count(),
            })
            .from(supplierContractCapacityLine)
            .where(inArray(supplierContractCapacityLine.contractId, contractIds))
            .groupBy(supplierContractCapacityLine.contractId)

    const countMap = new Map(capacityCounts.map((r) => [r.contractId, Number(r.total)]))

    return {
      items: rows.map((r) => ({
        ...r.contract,
        supplierName: r.supplierName,
        capacityLineCount: countMap.get(r.contract.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    }
  },

  async getById(contractId: string) {
    const [row] = await db
      .select({
        contract: supplierContract,
        supplierName: supplier.shortName,
      })
      .from(supplierContract)
      .innerJoin(supplier, eq(supplierContract.supplierId, supplier.id))
      .where(eq(supplierContract.id, contractId))
      .limit(1)

    if (!row) return null

    const [capacityLines, pricingTiers, linkedDeviceCount, accessCondition] = await Promise.all([
      db
        .select({
          id: supplierContractCapacityLine.id,
          contractId: supplierContractCapacityLine.contractId,
          dataCenterId: supplierContractCapacityLine.dataCenterId,
          gpuCardTypeId: supplierContractCapacityLine.gpuCardTypeId,
          cooperationType: supplierContractCapacityLine.cooperationType,
          deviceQuantity: supplierContractCapacityLine.deviceQuantity,
          gpuQuantity: supplierContractCapacityLine.gpuQuantity,
          gpuCountPerDevice: supplierContractCapacityLine.gpuCountPerDevice,
          startDate: supplierContractCapacityLine.startDate,
          endDate: supplierContractCapacityLine.endDate,
          lineStatus: supplierContractCapacityLine.lineStatus,
          remark: supplierContractCapacityLine.remark,
          dataCenterName: dataCenter.name,
          dataCenterCode: dataCenter.code,
          gpuCardTypeName: gpuCardType.name,
        })
        .from(supplierContractCapacityLine)
        .leftJoin(dataCenter, eq(supplierContractCapacityLine.dataCenterId, dataCenter.id))
        .leftJoin(gpuCardType, eq(supplierContractCapacityLine.gpuCardTypeId, gpuCardType.id))
        .where(eq(supplierContractCapacityLine.contractId, contractId))
        .orderBy(supplierContractCapacityLine.startDate),
      db
        .select()
        .from(supplierPricingTier)
        .where(eq(supplierPricingTier.contractId, contractId))
        .orderBy(supplierPricingTier.tierOrder),
      db
        .select({ total: count() })
        .from(supplierDevice)
        .where(eq(supplierDevice.contractId, contractId)),
      db
        .select()
        .from(accessConditionSheet)
        .where(
          and(
            eq(accessConditionSheet.contractId, contractId),
            eq(accessConditionSheet.isCurrent, true),
          ),
        )
        .limit(1),
    ])

    return {
      ...row.contract,
      supplierName: row.supplierName,
      capacityLines,
      pricingTiers,
      linkedDeviceCount: Number(linkedDeviceCount[0]?.total ?? 0),
      accessCondition: accessCondition[0] ?? null,
    }
  },

  async create(input: {
    supplierId: string
    type: string
    pricingMode: string
    cooperationMode: string
    startDate: string
    endDate?: string
    terms?: string
    unitPricePerHour?: string
    revenueSharePercent?: string
    minCommitHours?: string
    settlementCycle?: string
    contractFileUri?: string
    signerName?: string
    expectedListingTime?: string
    penaltyTerms?: string
    monthlyRentPrice?: string
    siteNodeCount?: number
    siteNodeTier?: 'lte_5' | 'lte_30' | 'lte_100' | 'gt_100'
    productLines?: string[]
    publicIpCount?: number
    supplierProvidesCpuHosts?: boolean
    infraPricing?: any
    capacityLines: any[]
    pricingTiers?: any[]
    /** user_staff.id；列可空（onDelete set null），无法解析到员工时为 null */
    createdByStaffId: string | null
  }) {
    const id = newId()
    const contractNo = generateContractNo()

    return await db.transaction(async (tx) => {
      const [supplierRow] = await tx
        .select()
        .from(supplier)
        .where(eq(supplier.id, input.supplierId))
        .limit(1)
      if (!supplierRow) throw new Error('供应商不存在')

      const cooperationMode = !input.endDate ? 'idle_time' : input.cooperationMode

      await tx.insert(supplierContract).values({
        id,
        supplierId: input.supplierId,
        contractNo,
        type: input.type,
        status: 'draft',
        supplierConfirmationStatus: 'none',
        pricingMode: input.pricingMode,
        cooperationMode,
        unitPricePerHour: input.unitPricePerHour,
        revenueSharePercent: input.revenueSharePercent,
        minCommitHours: input.minCommitHours,
        settlementCycle: input.settlementCycle,
        startDate: input.startDate,
        endDate: input.endDate ?? input.startDate,
        terms: input.terms,
        contractFileUri: input.contractFileUri,
        signerName: input.signerName,
        expectedListingTime: input.expectedListingTime,
        penaltyTerms: input.penaltyTerms,
        monthlyRentPrice: input.monthlyRentPrice,
        siteNodeCount: input.siteNodeCount,
        siteNodeTier: input.siteNodeTier,
        productLines: input.productLines ?? [],
        publicIpCount: input.publicIpCount,
        supplierProvidesCpuHosts: input.supplierProvidesCpuHosts ?? true,
        infraPricing: input.infraPricing,
      })

      if (input.capacityLines?.length) {
        await tx.insert(supplierContractCapacityLine).values(
          input.capacityLines.map((line) => ({
            id: newId(),
            contractId: id,
            dataCenterId: line.dataCenterId,
            gpuCardTypeId: line.gpuCardTypeId,
            cooperationType: line.cooperationType,
            deviceQuantity: line.deviceQuantity,
            gpuQuantity: line.gpuQuantity,
            gpuCountPerDevice: line.gpuCountPerDevice,
            startDate: line.startDate,
            endDate: line.endDate,
            lineStatus: 'active',
          })),
        )
      }

      if (input.pricingTiers?.length) {
        await tx.insert(supplierPricingTier).values(
          input.pricingTiers.map((tier: any) => ({
            id: newId(),
            contractId: id,
            tierOrder: tier.tierOrder,
            dealUnitPricePerHour: tier.dealUnitPricePerHour,
            revenueSharePercent: tier.revenueSharePercent,
            dealToListRatioMin: tier.dealToListRatioMin,
            dealToListRatioMax: tier.dealToListRatioMax,
            remark: tier.remark,
          })),
        )
      }

      return { id, contractNo }
    })
  },

  async update(input: {
    contractId: string
    type?: string
    pricingMode?: string
    cooperationMode?: string
    unitPricePerHour?: string
    revenueSharePercent?: string
    minCommitHours?: string
    settlementCycle?: string
    startDate?: string
    endDate?: string
    terms?: string
    contractFileUri?: string
    signerName?: string
    expectedListingTime?: string
    penaltyTerms?: string
    monthlyRentPrice?: string
    siteNodeCount?: number
    siteNodeTier?: 'lte_5' | 'lte_30' | 'lte_100' | 'gt_100'
    productLines?: string[]
    publicIpCount?: number
    supplierProvidesCpuHosts?: boolean
    infraPricing?: any
    capacityLines?: any[]
    /** user_staff.id；列可空（onDelete set null），无法解析到员工时为 null */
    updatedByStaffId: string | null
  }) {
    const [existing] = await db
      .select()
      .from(supplierContract)
      .where(eq(supplierContract.id, input.contractId))
      .limit(1)

    if (!existing) throw new Error('合同不存在')
    if (!['draft', 'rejected'].includes(existing.status)) {
      throw new Error('仅草稿或被拒绝的合同可编辑')
    }

    await db
      .update(supplierContract)
      .set({
        type: input.type ?? existing.type,
        pricingMode: input.pricingMode ?? existing.pricingMode,
        cooperationMode: input.cooperationMode ?? existing.cooperationMode,
        unitPricePerHour: input.unitPricePerHour ?? existing.unitPricePerHour,
        revenueSharePercent: input.revenueSharePercent ?? existing.revenueSharePercent,
        minCommitHours: input.minCommitHours ?? existing.minCommitHours,
        settlementCycle: input.settlementCycle ?? existing.settlementCycle,
        startDate: input.startDate ?? existing.startDate,
        endDate: input.endDate ?? existing.endDate,
        terms: input.terms ?? existing.terms,
        contractFileUri: input.contractFileUri ?? existing.contractFileUri,
        signerName: input.signerName ?? existing.signerName,
        expectedListingTime: input.expectedListingTime ?? existing.expectedListingTime,
        penaltyTerms: input.penaltyTerms ?? existing.penaltyTerms,
        monthlyRentPrice: input.monthlyRentPrice ?? existing.monthlyRentPrice,
        siteNodeCount: input.siteNodeCount ?? existing.siteNodeCount,
        siteNodeTier: input.siteNodeTier ?? existing.siteNodeTier,
        productLines: input.productLines ?? existing.productLines ?? [],
        publicIpCount: input.publicIpCount ?? existing.publicIpCount,
        supplierProvidesCpuHosts:
          input.supplierProvidesCpuHosts ?? existing.supplierProvidesCpuHosts,
        infraPricing: input.infraPricing ?? existing.infraPricing,
        status: 'draft',
        supplierConfirmationStatus: 'none',
      })
      .where(eq(supplierContract.id, input.contractId))

    // Replace capacity lines if provided
    if (input.capacityLines) {
      await db
        .delete(supplierContractCapacityLine)
        .where(eq(supplierContractCapacityLine.contractId, input.contractId))
      await db.insert(supplierContractCapacityLine).values(
        input.capacityLines.map((line) => ({
          id: line.id ?? newId(),
          contractId: input.contractId,
          dataCenterId: line.dataCenterId,
          gpuCardTypeId: line.gpuCardTypeId,
          cooperationType: line.cooperationType,
          deviceQuantity: line.deviceQuantity,
          gpuQuantity: line.gpuQuantity,
          gpuCountPerDevice: line.gpuCountPerDevice,
          startDate: line.startDate,
          endDate: line.endDate,
          lineStatus: line.lineStatus ?? 'active',
        })),
      )
    }

    return { ok: true }
  },

  async sendToSupplier(input: { contractId: string; sentByStaffId: string | null }) {
    const [existing] = await db
      .select()
      .from(supplierContract)
      .where(eq(supplierContract.id, input.contractId))
      .limit(1)

    if (!existing) throw new Error('合同不存在')
    if (!['draft', 'rejected'].includes(existing.status)) {
      throw new Error('仅草稿或被拒绝的合同可发送')
    }

    // Validate at least one capacity line
    const [lineCount] = await db
      .select({ total: count() })
      .from(supplierContractCapacityLine)
      .where(eq(supplierContractCapacityLine.contractId, input.contractId))
    if (Number(lineCount?.total ?? 0) === 0) throw new Error('合同必须包含至少一行产能明细')

    // Update status
    await db
      .update(supplierContract)
      .set({
        status: 'pending',
        supplierConfirmationStatus: 'pending',
      })
      .where(eq(supplierContract.id, input.contractId))

    // Send notifications (fire-and-forget)
    const capacityLines = await db
      .select()
      .from(supplierContractCapacityLine)
      .where(eq(supplierContractCapacityLine.contractId, input.contractId))

    const contractUrl = `${process.env.SUPPLIER_URL ?? 'https://supplier.gongjiyun.com'}/console/contracts/${input.contractId}`

    sendContractToSupplier({
      contractId: input.contractId,
      contractNo: existing.contractNo,
      supplierId: existing.supplierId,
      capacitySummary: buildCapacitySummary(capacityLines),
      contractUrl,
      senderStaffId: input.sentByStaffId,
    }).catch((err) => console.error('sendContractToSupplier failed:', err))

    return { ok: true }
  },

  async terminate(input: { contractId: string; reason: string; terminatedByStaffId: string | null }) {
    const [existing] = await db
      .select()
      .from(supplierContract)
      .where(eq(supplierContract.id, input.contractId))
      .limit(1)
    if (!existing) throw new Error('合同不存在')
    if (existing.status !== 'active') throw new Error('仅生效中的合同可终止')

    await db.transaction(async (tx) => {
      await tx
        .update(supplierContract)
        .set({ status: 'terminated' })
        .where(eq(supplierContract.id, input.contractId))
      await tx
        .update(supplierContractCapacityLine)
        .set({ lineStatus: 'terminated' })
        .where(eq(supplierContractCapacityLine.contractId, input.contractId))
    })

    return { ok: true }
  },

  async linkDevices(input: { contractId: string; deviceIds: string[] }) {
    const [existing] = await db
      .select()
      .from(supplierContract)
      .where(eq(supplierContract.id, input.contractId))
      .limit(1)
    if (!existing) throw new Error('合同不存在')
    if (existing.status !== 'active') throw new Error('仅生效中的合同可关联设备')
    if (!input.deviceIds.length) throw new Error('请选择要关联的设备')

    const owned = await db
      .select({ id: supplierDevice.id })
      .from(supplierDevice)
      .where(
        and(
          inArray(supplierDevice.id, input.deviceIds),
          eq(supplierDevice.supplierId, existing.supplierId),
        ),
      )
    if (owned.length !== input.deviceIds.length) {
      throw new Error('存在不属于该供应商的设备，无法关联')
    }

    await db
      .update(supplierDevice)
      .set({ contractId: input.contractId })
      .where(
        and(
          inArray(supplierDevice.id, input.deviceIds),
          eq(supplierDevice.supplierId, existing.supplierId),
        ),
      )

    return { ok: true, linked: input.deviceIds.length }
  },

  async listLinkedDevices(input: { contractId: string; page: number; pageSize: number }) {
    const page = Math.max(1, input.page)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const offset = (page - 1) * pageSize
    const where = eq(supplierDevice.contractId, input.contractId)

    const [totalRow] = await db
      .select({ total: count() })
      .from(supplierDevice)
      .where(where)
    const total = Number(totalRow?.total ?? 0)

    const rows = await db
      .select({
        id: supplierDevice.id,
        sn: supplierDevice.sn,
        internalIp: supplierDevice.internalIp,
        externalIp: supplierDevice.externalIp,
        gpuCount: supplierDevice.gpuCount,
        cooperationType: supplierDevice.cooperationType,
        opsStatus: supplierDevice.opsStatus,
        lifecycleStatus: supplierDevice.lifecycleStatus,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
      })
      .from(supplierDevice)
      .leftJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
      .leftJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .where(where)
      .orderBy(sql`${supplierDevice.createdAt} DESC`)
      .limit(pageSize)
      .offset(offset)

    return { items: rows, total, page, pageSize }
  },

  /** 列出合同所属供应商下尚未关联合同的设备，供运营手动关联 */
  async listUnlinkedDevices(input: {
    contractId: string
    search?: string
    page: number
    pageSize: number
  }) {
    const [existing] = await db
      .select({
        id: supplierContract.id,
        supplierId: supplierContract.supplierId,
        status: supplierContract.status,
      })
      .from(supplierContract)
      .where(eq(supplierContract.id, input.contractId))
      .limit(1)
    if (!existing) throw new Error('合同不存在')
    if (existing.status !== 'active') throw new Error('仅生效中的合同可关联设备')

    const page = Math.max(1, input.page)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const offset = (page - 1) * pageSize

    const conditions = [
      eq(supplierDevice.supplierId, existing.supplierId),
      isNull(supplierDevice.contractId),
    ]
    if (input.search?.trim()) {
      const q = `%${input.search.trim()}%`
      conditions.push(
        or(
          ilike(supplierDevice.sn, q),
          ilike(supplierDevice.internalIp, q),
          ilike(supplierDevice.assetNo, q),
        )!,
      )
    }
    const where = and(...conditions)

    const [totalRow] = await db
      .select({ total: count() })
      .from(supplierDevice)
      .where(where)
    const total = Number(totalRow?.total ?? 0)

    const rows = await db
      .select({
        id: supplierDevice.id,
        sn: supplierDevice.sn,
        internalIp: supplierDevice.internalIp,
        externalIp: supplierDevice.externalIp,
        gpuCount: supplierDevice.gpuCount,
        cooperationType: supplierDevice.cooperationType,
        opsStatus: supplierDevice.opsStatus,
        lifecycleStatus: supplierDevice.lifecycleStatus,
        dataCenterName: dataCenter.name,
        cardTypeName: gpuCardType.name,
      })
      .from(supplierDevice)
      .leftJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
      .leftJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .where(where)
      .orderBy(sql`${supplierDevice.createdAt} DESC`)
      .limit(pageSize)
      .offset(offset)

    return { items: rows, total, page, pageSize }
  },
}