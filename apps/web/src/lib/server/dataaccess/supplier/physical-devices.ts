import { db } from '@/lib/db'
import type { PhysicalDevice, PhysicalDeviceDetail, PhysicalDeviceStats } from '@/lib/data/types'
import {
  mapActivityFlowRecord,
  mapChangelogFlowRecord,
  mapComputeNodeRow,
  mapPhysicalDeviceListRows,
  mapPhysicalDeviceRow,
  mapStateTransitionFlowRecord,
} from '@/lib/server/mappers/supply'
import { supplierLog, supplierWarn, supplierError } from '@/lib/server/dataaccess/supplier/logger'
import { autoListDevice, autoUnlistDevice } from '@/lib/server/jobs/auto-listing-engine'
import { suppliersDataAccess } from '@/lib/server/dataaccess/supplier/suppliers'
import {
  accessConditionSheet,
  computeNode,
  dataCenter,
  entityStateTransitionLog,
  gpuCardType,
  onboardingBatch,
  supplier,
  supplierActivity,
  supplierContract,
  supplierDevice,
  supplierDeviceChangeLog,
  userStaff,
} from '@workspace/db/schema'
import { and, count, desc, eq, ilike, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { DEVICE_OPS_STATUS_SEEDS } from '@workspace/db/schema'

function newId() {
  return crypto.randomUUID()
}

export type PhysicalDeviceListFilters = {
  supplierId?: string
  dataCenterId?: string
  search?: string
  cardTypeName?: string
  opsStatus?: string
  cooperationType?: string
  lifecycleStatus?: string
  inMaintenance?: 'all' | 'yes' | 'no'
  page?: number
  pageSize?: number
}

export type PhysicalDeviceListResult = {
  items: PhysicalDevice[]
  total: number
  page: number
  pageSize: number
}

export const physicalDevicesDataAccess = {
  async list(params: PhysicalDeviceListFilters = {}): Promise<PhysicalDeviceListResult> {
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    supplierLog('physical-devices', 'list start', {
      supplierId: params.supplierId ?? 'all',
      dataCenterId: params.dataCenterId ?? 'all',
      page,
      pageSize,
    })

    const conditions: SQL[] = []
    if (params.supplierId) {
      conditions.push(eq(supplierDevice.supplierId, params.supplierId))
    }
    if (params.dataCenterId) {
      conditions.push(eq(supplierDevice.dataCenterId, params.dataCenterId))
    }
    if (params.cardTypeName && params.cardTypeName !== 'all') {
      conditions.push(eq(gpuCardType.name, params.cardTypeName))
    }
    if (params.opsStatus && params.opsStatus !== 'all') {
      if (params.opsStatus === '其他') {
        const known = DEVICE_OPS_STATUS_SEEDS.map((s) => s.stateCode)
        conditions.push(notInArray(supplierDevice.opsStatus, known))
      } else {
        conditions.push(eq(supplierDevice.opsStatus, params.opsStatus))
      }
    }
    if (params.cooperationType && params.cooperationType !== 'all') {
      conditions.push(eq(supplierDevice.cooperationType, params.cooperationType))
    }
    if (params.lifecycleStatus && params.lifecycleStatus !== 'all') {
      conditions.push(eq(supplierDevice.lifecycleStatus, params.lifecycleStatus))
    }
    if (params.inMaintenance === 'yes') {
      conditions.push(eq(supplierDevice.inMaintenance, true))
    } else if (params.inMaintenance === 'no') {
      conditions.push(eq(supplierDevice.inMaintenance, false))
    }
    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`
      conditions.push(
        or(
          ilike(supplierDevice.sn, q),
          ilike(supplierDevice.assetNo, q),
          ilike(supplierDevice.idcCode, q),
          ilike(supplierDevice.internalIp, q),
          ilike(supplierDevice.externalIp, q),
          ilike(dataCenter.name, q),
        )!,
      )
    }
    const where = conditions.length ? and(...conditions) : undefined

    const [totalRow, rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(supplierDevice)
        .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
        .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
        .leftJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
        .where(where),
      db
        .select({
          device: supplierDevice,
          supplierShortName: supplier.shortName,
          cardTypeName: gpuCardType.name,
          clusterName: computeNode.clusterName,
          nodeRole: computeNode.nodeRole,
          expectedService: computeNode.expectedService,
        })
        .from(supplierDevice)
        .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
        .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
        .leftJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
        .leftJoin(computeNode, eq(computeNode.supplierDeviceId, supplierDevice.id))
        .where(where)
        .orderBy(sql`${supplierDevice.updatedAt} DESC`)
        .limit(pageSize)
        .offset(offset),
    ])

    const devices = mapPhysicalDeviceListRows(rows)
    supplierLog('physical-devices', 'list done', {
      count: devices.length,
      total: Number(totalRow[0]?.value ?? 0),
    })
    return {
      items: devices,
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
    }
  },

  async listFilterOptions(params?: { supplierId?: string }): Promise<{
    cardTypes: string[]
    opsStatuses: string[]
  }> {
    const conditions = params?.supplierId
      ? eq(supplierDevice.supplierId, params.supplierId)
      : undefined

    const [cardTypeRows, opsStatusRows] = await Promise.all([
      db
        .selectDistinct({ name: gpuCardType.name })
        .from(supplierDevice)
        .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
        .where(conditions)
        .orderBy(gpuCardType.name),
      db
        .selectDistinct({ opsStatus: supplierDevice.opsStatus })
        .from(supplierDevice)
        .where(conditions)
        .orderBy(supplierDevice.opsStatus),
    ])

    return {
      cardTypes: cardTypeRows.map((r) => r.name).filter(Boolean),
      opsStatuses: opsStatusRows.map((r) => r.opsStatus).filter(Boolean),
    }
  },

  async getStats(params: { supplierId?: string }): Promise<PhysicalDeviceStats> {
    const conditions = params.supplierId
      ? eq(supplierDevice.supplierId, params.supplierId)
      : undefined

    const [totalRow] = await db
      .select({ value: count() })
      .from(supplierDevice)
      .where(conditions)

    const [onlineRow] = await db
      .select({ value: count() })
      .from(supplierDevice)
      .where(
        conditions
          ? and(conditions, eq(supplierDevice.lifecycleStatus, 'online'))
          : eq(supplierDevice.lifecycleStatus, 'online'),
      )

    const [onboardingRow] = await db
      .select({ value: count() })
      .from(supplierDevice)
      .where(
        conditions
          ? and(conditions, eq(supplierDevice.lifecycleStatus, 'onboarding'))
          : eq(supplierDevice.lifecycleStatus, 'onboarding'),
      )

    return {
      total: Number(totalRow?.value ?? 0),
      online: Number(onlineRow?.value ?? 0),
      onboarding: Number(onboardingRow?.value ?? 0),
    }
  },

  async getDetail(deviceId: string): Promise<PhysicalDeviceDetail | null> {
    supplierLog('physical-devices', 'getDetail start', { deviceId })

    const [hit] = await db
      .select({
        device: supplierDevice,
        supplierShortName: supplier.shortName,
        supplierName: supplier.name,
        cardTypeName: gpuCardType.name,
        contractNo: supplierContract.contractNo,
        onboardingBatchCode: onboardingBatch.batchCode,
        onboardingBatchKind: onboardingBatch.batchKind,
      })
      .from(supplierDevice)
      .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
      .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .leftJoin(supplierContract, eq(supplierDevice.contractId, supplierContract.id))
      .leftJoin(onboardingBatch, eq(supplierDevice.onboardingBatchId, onboardingBatch.id))
      .where(eq(supplierDevice.id, deviceId))
      .limit(1)

    if (!hit) {
      supplierLog('physical-devices', 'getDetail not found', { deviceId })
      return null
    }

    const [nodeRows, transitionRows, changelogRows, activityRows] = await Promise.all([
      db
        .select()
        .from(computeNode)
        .where(eq(computeNode.supplierDeviceId, deviceId))
        .orderBy(computeNode.nodeRole),
      db
        .select({
          log: entityStateTransitionLog,
          operatorName: userStaff.displayName,
        })
        .from(entityStateTransitionLog)
        .leftJoin(userStaff, eq(entityStateTransitionLog.operatorStaffId, userStaff.id))
        .where(
          and(
            eq(entityStateTransitionLog.entityType, 'device'),
            eq(entityStateTransitionLog.entityId, deviceId),
          ),
        )
        .orderBy(desc(entityStateTransitionLog.occurredAt)),
      db
        .select({
          log: supplierDeviceChangeLog,
          batchCode: onboardingBatch.batchCode,
        })
        .from(supplierDeviceChangeLog)
        .innerJoin(
          onboardingBatch,
          eq(supplierDeviceChangeLog.onboardingBatchId, onboardingBatch.id),
        )
        .where(eq(supplierDeviceChangeLog.supplierDeviceId, deviceId))
        .orderBy(desc(supplierDeviceChangeLog.occurredAt)),
      db
        .select()
        .from(supplierActivity)
        .where(and(eq(supplierActivity.refDomain, 'device'), eq(supplierActivity.refId, deviceId)))
        .orderBy(desc(supplierActivity.occurredAt)),
    ])

    const flowRecords = [
      ...transitionRows.map(({ log, operatorName }) =>
        mapStateTransitionFlowRecord(log, operatorName),
      ),
      ...changelogRows.map(({ log, batchCode }) => mapChangelogFlowRecord(log, batchCode)),
      ...activityRows.map((row) => mapActivityFlowRecord(row)),
    ].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))

    supplierLog('physical-devices', 'getDetail done', {
      deviceId,
      flowRecords: flowRecords.length,
      computeNodes: nodeRows.length,
    })

    return {
      device: {
        ...mapPhysicalDeviceRow(hit.device, {
          supplierShortName: hit.supplierShortName,
          cardTypeName: hit.cardTypeName,
        }),
        supplierName: hit.supplierName,
        contractNo: hit.contractNo,
        onboardingBatchCode: hit.onboardingBatchCode,
        onboardingBatchKind: hit.onboardingBatchKind,
      },
      computeNodes: nodeRows.map(mapComputeNodeRow),
      flowRecords,
    }
  },

  async markOnline(params: {
    deviceId: string
    operatorStaffId?: string | null
    operatorName?: string | null
  }): Promise<PhysicalDevice> {
    supplierLog('physical-devices', 'markOnline start', { deviceId: params.deviceId })

    const [hit] = await db
      .select({
        device: supplierDevice,
        supplierShortName: supplier.shortName,
        cardTypeName: gpuCardType.name,
      })
      .from(supplierDevice)
      .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
      .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .where(eq(supplierDevice.id, params.deviceId))
      .limit(1)

    if (!hit) {
      throw new Error('设备不存在')
    }

    const { device } = hit
    if (device.lifecycleStatus === 'online') {
      throw new Error('设备已在线')
    }

    const fromState = device.lifecycleStatus
    const now = new Date()
    const platformResourceId =
      device.platformResourceId ?? `res-${device.sn.toLowerCase()}`

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(supplierDevice)
          .set({
            lifecycleStatus: 'online',
            onboardingSubstage: '已完成',
            platformResourceId,
            updatedAt: now,
          })
          .where(eq(supplierDevice.id, params.deviceId))

        await tx.insert(entityStateTransitionLog).values({
          id: newId(),
          entityType: 'device',
          entityId: params.deviceId,
          fromState,
          toState: 'online',
          operatorStaffId: params.operatorStaffId ?? null,
          reasonCode: 'ONBOARDING_DONE',
          occurredAt: now,
        })

        await tx.insert(supplierActivity).values({
          id: newId(),
          supplierId: device.supplierId,
          type: 'device_online',
          title: `设备 ${device.sn} 已上线`,
          description: `机房 ${device.idcCode}`,
          authorStaffId: params.operatorStaffId ?? null,
          authorName: params.operatorName ?? '运营',
          authorRole: 'ops',
          refDomain: 'device',
          refId: params.deviceId,
          occurredAt: now,
        })
      })
    } catch (e) {
      supplierError('physical-devices', 'markOnline failed', e, { deviceId: params.deviceId })
      throw e
    }

    supplierLog('physical-devices', 'markOnline done', {
      deviceId: params.deviceId,
      from: fromState,
    })

    try {
      await autoListDevice(params.deviceId)
    } catch (e) {
      supplierWarn('physical-devices', 'markOnline autoListDevice failed', {
        deviceId: params.deviceId,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    return mapPhysicalDeviceRow(
      {
        ...device,
        lifecycleStatus: 'online',
        onboardingSubstage: '已完成',
        platformResourceId,
        updatedAt: now,
      },
      { supplierShortName: hit.supplierShortName, cardTypeName: hit.cardTypeName },
    )
  },

  async listDevice(params: {
    deviceId: string
    operatorStaffId?: string | null
    operatorName?: string | null
  }): Promise<PhysicalDevice> {
    supplierLog('physical-devices', 'listDevice start', { deviceId: params.deviceId })

    const [hit] = await db
      .select({
        device: supplierDevice,
        supplierShortName: supplier.shortName,
        cardTypeName: gpuCardType.name,
      })
      .from(supplierDevice)
      .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
      .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .where(eq(supplierDevice.id, params.deviceId))
      .limit(1)

    if (!hit) {
      throw new Error('设备不存在')
    }

    const { device } = hit
    if (device.lifecycleStatus !== 'online') {
      throw new Error('仅在线设备可上架')
    }

    const fromState = device.lifecycleStatus
    const now = new Date()

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(supplierDevice)
          .set({
            lifecycleStatus: 'listed',
            updatedAt: now,
          })
          .where(eq(supplierDevice.id, params.deviceId))

        await tx.insert(entityStateTransitionLog).values({
          id: newId(),
          entityType: 'device',
          entityId: params.deviceId,
          fromState,
          toState: 'listed',
          operatorStaffId: params.operatorStaffId ?? null,
          reasonCode: 'LISTED',
          occurredAt: now,
        })

        await tx.insert(supplierActivity).values({
          id: newId(),
          supplierId: device.supplierId,
          type: 'device_listed',
          title: `设备 ${device.sn} 已上架`,
          description: `机房 ${device.idcCode}`,
          authorStaffId: params.operatorStaffId ?? null,
          authorName: params.operatorName ?? '运营',
          authorRole: 'ops',
          refDomain: 'device',
          refId: params.deviceId,
          occurredAt: now,
        })
      })
    } catch (e) {
      supplierError('physical-devices', 'listDevice failed', e, { deviceId: params.deviceId })
      throw e
    }

    supplierLog('physical-devices', 'listDevice done', {
      deviceId: params.deviceId,
      from: fromState,
    })

    return mapPhysicalDeviceRow(
      {
        ...device,
        lifecycleStatus: 'listed',
        updatedAt: now,
      },
      { supplierShortName: hit.supplierShortName, cardTypeName: hit.cardTypeName },
    )
  },

  async unlistDevice(params: {
    deviceId: string
    operatorStaffId?: string | null
    operatorName?: string | null
  }): Promise<PhysicalDevice> {
    supplierLog('physical-devices', 'unlistDevice start', { deviceId: params.deviceId })

    const [hit] = await db
      .select({
        device: supplierDevice,
        supplierShortName: supplier.shortName,
        cardTypeName: gpuCardType.name,
      })
      .from(supplierDevice)
      .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
      .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .where(eq(supplierDevice.id, params.deviceId))
      .limit(1)

    if (!hit) {
      throw new Error('设备不存在')
    }

    const { device } = hit
    if (device.lifecycleStatus !== 'listed') {
      throw new Error('仅已上架设备可下架')
    }

    const fromState = device.lifecycleStatus
    const now = new Date()

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(supplierDevice)
          .set({
            lifecycleStatus: 'online',
            updatedAt: now,
          })
          .where(eq(supplierDevice.id, params.deviceId))

        await tx.insert(entityStateTransitionLog).values({
          id: newId(),
          entityType: 'device',
          entityId: params.deviceId,
          fromState,
          toState: 'online',
          operatorStaffId: params.operatorStaffId ?? null,
          reasonCode: 'UNLISTED',
          occurredAt: now,
        })

        await tx.insert(supplierActivity).values({
          id: newId(),
          supplierId: device.supplierId,
          type: 'device_unlisted',
          title: `设备 ${device.sn} 已下架`,
          description: `机房 ${device.idcCode}`,
          authorStaffId: params.operatorStaffId ?? null,
          authorName: params.operatorName ?? '运营',
          authorRole: 'ops',
          refDomain: 'device',
          refId: params.deviceId,
          occurredAt: now,
        })
      })
    } catch (e) {
      supplierError('physical-devices', 'unlistDevice failed', e, { deviceId: params.deviceId })
      throw e
    }

    supplierLog('physical-devices', 'unlistDevice done', {
      deviceId: params.deviceId,
      from: fromState,
    })

    return mapPhysicalDeviceRow(
      {
        ...device,
        lifecycleStatus: 'online',
        updatedAt: now,
      },
      { supplierShortName: hit.supplierShortName, cardTypeName: hit.cardTypeName },
    )
  },

  async setListingDisabled(params: {
    deviceId: string
    listingDisabled: boolean
    operatorStaffId?: string | null
    operatorName?: string | null
  }): Promise<PhysicalDevice> {
    supplierLog('physical-devices', 'setListingDisabled start', {
      deviceId: params.deviceId,
      listingDisabled: params.listingDisabled,
    })

    const [hit] = await db
      .select({
        device: supplierDevice,
        supplierShortName: supplier.shortName,
        cardTypeName: gpuCardType.name,
      })
      .from(supplierDevice)
      .innerJoin(supplier, eq(supplierDevice.supplierId, supplier.id))
      .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .where(eq(supplierDevice.id, params.deviceId))
      .limit(1)

    if (!hit) {
      throw new Error('设备不存在')
    }

    const { device } = hit
    const now = new Date()

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(supplierDevice)
          .set({
            listingDisabled: params.listingDisabled,
            updatedAt: now,
          })
          .where(eq(supplierDevice.id, params.deviceId))

        await tx.insert(supplierActivity).values({
          id: newId(),
          supplierId: device.supplierId,
          type: params.listingDisabled ? 'listing_disabled' : 'listing_enabled',
          title: params.listingDisabled
            ? `设备 ${device.sn} 已禁止上架`
            : `设备 ${device.sn} 已恢复上架`,
          description: `机房 ${device.idcCode}`,
          authorStaffId: params.operatorStaffId ?? null,
          authorName: params.operatorName ?? '运营',
          authorRole: 'ops',
          refDomain: 'device',
          refId: params.deviceId,
          occurredAt: now,
        })
      })
    } catch (e) {
      supplierError('physical-devices', 'setListingDisabled failed', e, {
        deviceId: params.deviceId,
      })
      throw e
    }

    supplierLog('physical-devices', 'setListingDisabled done', {
      deviceId: params.deviceId,
      listingDisabled: params.listingDisabled,
    })

    // 事件驱动：禁止上架 → 已 listed 立即下架；恢复上架 → online 尝试上架（失败仅记日志，Cron 兜底）
    try {
      if (params.listingDisabled && device.lifecycleStatus === 'listed') {
        await autoUnlistDevice(params.deviceId, 'listing_disabled')
      } else if (!params.listingDisabled && device.lifecycleStatus === 'online') {
        await autoListDevice(params.deviceId)
      }
    } catch (e) {
      supplierWarn('physical-devices', 'setListingDisabled auto-list/unlist failed', {
        deviceId: params.deviceId,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    return mapPhysicalDeviceRow(
      {
        ...device,
        listingDisabled: params.listingDisabled,
        updatedAt: now,
      },
      { supplierShortName: hit.supplierShortName, cardTypeName: hit.cardTypeName },
    )
  },
}

export async function resolveOnboardingBatchRefs(supplierId: string): Promise<{
  contractId: string | null
  accessSheetId: string | null
}> {
  await suppliersDataAccess.assertSupplierExists(supplierId)

  const contracts = await suppliersDataAccess.listContractsBySupplier(supplierId)
  const contract = contracts.find((c) => c.status === 'active') ?? contracts[0] ?? null
  if (!contract) {
    supplierLog('physical-devices', 'resolveOnboardingBatchRefs: no contract', { supplierId })
    return { contractId: null, accessSheetId: null }
  }

  const [sheet] = await db
    .select({ id: accessConditionSheet.id })
    .from(accessConditionSheet)
    .where(
      and(
        eq(accessConditionSheet.contractId, contract.id),
        eq(accessConditionSheet.isCurrent, true),
      ),
    )
    .limit(1)

  if (!sheet) {
    supplierWarn('physical-devices', 'resolveOnboardingBatchRefs: no access sheet', {
      supplierId,
      contractId: contract.id,
    })
    return { contractId: contract.id, accessSheetId: null }
  }

  return { contractId: contract.id, accessSheetId: sheet.id }
}
