import { db } from '@/lib/db'
import {
  getDeviceRetireReasonLabel,
  type DeviceRetireBatchDetail,
  type DeviceRetireBatchListItem,
  type DeviceRetireParsedRow,
  type DeviceRetireReason,
} from '@/lib/types/device-retire'
import { getRetireScenarioLabel } from '@/lib/supplier/datacenter-device-retire-ui'
import type { RetireProgressFlags } from '@/lib/supplier/retire-changelog-utils'
import type { RetireActionType, RetirePlanMode } from '@/lib/types/datacenter-device-retire'
import type { OnboardingBatchPlannedLineJson } from '@/lib/types/onboarding-batch-api'
import { supplierLog } from '@/lib/server/dataaccess/supplier/logger'
import { mapDbDeviceToDomain } from '@/lib/server/dataaccess/supplier/datacenter-retire-shared'
import {
  gpuCardType,
  onboardingBatch,
  onboardingBatchDeviceLink,
  supplierDevice,
  supplierDeviceChangeLog,
} from '@workspace/db/schema'
import { and, desc, eq, ilike, or } from 'drizzle-orm'

function normalizeParsedRows(json: unknown): DeviceRetireParsedRow[] {
  if (!Array.isArray(json)) return []
  return json.map((row) => {
    if (row && typeof row === 'object' && 'parseStatus' in row) {
      const r = row as {
        rowNo: number
        externalDeviceId?: string | null
        assetNo?: string | null
        externalIp?: string | null
        internalIp?: string | null
        parseStatus: 'ok' | 'error'
        errors?: string[]
        warnings?: string[]
        matchedDeviceId?: string | null
      }
      return {
        row_no: r.rowNo,
        external_device_id: r.externalDeviceId ?? null,
        asset_no: r.assetNo ?? null,
        external_ip: r.externalIp ?? null,
        internal_ip: r.internalIp ?? null,
        originalCells: [],
        parse_status: r.parseStatus,
        errors: r.errors ?? [],
        warnings: r.warnings ?? [],
        errorColumnIndexes: [],
        matched_device_id: r.matchedDeviceId ?? null,
      }
    }
    return row as DeviceRetireParsedRow
  })
}

function mapBatchListItem(
  row: typeof onboardingBatch.$inferSelect,
): DeviceRetireBatchListItem {
  const parsedRows = normalizeParsedRows(row.parsedRowsJson)
  const parsedErrorCount = parsedRows.filter((r) => r.parse_status === 'error').length
  const reason = row.retireReason as DeviceRetireReason | null
  const retirePlanMode = (row.retirePlanMode as RetirePlanMode | null) ?? null
  const retireActionType = (row.retireActionType as RetireActionType | null) ?? null
  const progressFlags = (row.progressFlagsJson as RetireProgressFlags | null) ?? null
  const scenarioLabel =
    retirePlanMode && retireActionType
      ? getRetireScenarioLabel(retirePlanMode, retireActionType)
      : null

  return {
    id: row.id,
    batchCode: row.batchCode,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplierShortName: row.supplierShortName,
    dataCenterId: row.dataCenterId,
    dataCenterName: row.dataCenterName,
    idcCode: row.idcCode,
    importStatus: row.importStatus,
    batchStatus: row.batchStatus,
    workOrderNo: row.workOrderNo ?? null,
    plannedDeviceCount: row.plannedDeviceCount,
    touchedDeviceCount: row.touchedDeviceCount,
    retiredDeviceCount: row.retiredDeviceCount,
    parsedRowCount: row.parsedRowCount,
    parsedSuccessCount: row.parsedSuccessCount,
    parsedErrorCount,
    retireReason: reason,
    retireReasonLabel: reason ? getDeviceRetireReasonLabel(reason) : null,
    retirePlanMode,
    retireActionType,
    scenarioLabel,
    progressFlags,
    expectedCompletionDate: row.expectedCompletionDate ?? null,
    importFileName: row.importFileName,
    committedAt: row.committedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export const deviceRetireDataAccess = {
  async listBatches(params?: {
    supplierId?: string
    dataCenterId?: string
    importStatus?: string
    search?: string
  }): Promise<{ items: DeviceRetireBatchListItem[]; total: number }> {
    supplierLog('device-retire', 'listBatches', params ?? {})

    const conditions = [eq(onboardingBatch.batchKind, 'device_retire')]
    if (params?.supplierId) {
      conditions.push(eq(onboardingBatch.supplierId, params.supplierId))
    }
    if (params?.dataCenterId) {
      conditions.push(eq(onboardingBatch.dataCenterId, params.dataCenterId))
    }
    if (params?.importStatus && params.importStatus !== 'all') {
      conditions.push(eq(onboardingBatch.importStatus, params.importStatus))
    }
    if (params?.search?.trim()) {
      const q = `%${params.search.trim()}%`
      conditions.push(
        or(
          ilike(onboardingBatch.batchCode, q),
          ilike(onboardingBatch.supplierName, q),
          ilike(onboardingBatch.supplierShortName, q),
          ilike(onboardingBatch.dataCenterName, q),
          ilike(onboardingBatch.idcCode, q),
        )!,
      )
    }

    const rows = await db
      .select()
      .from(onboardingBatch)
      .where(and(...conditions))
      .orderBy(desc(onboardingBatch.createdAt))

    const items = rows.map(mapBatchListItem)
    return { items, total: items.length }
  },

  async getBatchById(batchId: string): Promise<DeviceRetireBatchDetail | null> {
    supplierLog('device-retire', 'getBatchById', { batchId })

    const [row] = await db
      .select()
      .from(onboardingBatch)
      .where(and(eq(onboardingBatch.id, batchId), eq(onboardingBatch.batchKind, 'device_retire')))
      .limit(1)

    if (!row) return null

    const parsedRows = normalizeParsedRows(row.parsedRowsJson)
    const parsedRowMap = new Map(
      parsedRows
        .filter((r) => r.matched_device_id)
        .map((r) => [r.matched_device_id!, r]),
    )
    const plannedLines = (row.plannedLinesJson as OnboardingBatchPlannedLineJson[] | null) ?? []

    const linkRows = await db
      .select({
        link: onboardingBatchDeviceLink,
        device: supplierDevice,
        cardTypeName: gpuCardType.name,
        changeLog: supplierDeviceChangeLog,
      })
      .from(onboardingBatchDeviceLink)
      .innerJoin(supplierDevice, eq(onboardingBatchDeviceLink.supplierDeviceId, supplierDevice.id))
      .innerJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .leftJoin(
        supplierDeviceChangeLog,
        and(
          eq(supplierDeviceChangeLog.supplierDeviceId, supplierDevice.id),
          eq(supplierDeviceChangeLog.businessOnboardingBatchId, batchId),
        ),
      )
      .where(eq(onboardingBatchDeviceLink.businessOnboardingBatchId, batchId))
      .orderBy(supplierDeviceChangeLog.importRowNo, onboardingBatchDeviceLink.linkedAt)

    const devicesFromLinks = linkRows.map(({ link, device, cardTypeName, changeLog }) => {
      const parsed = parsedRowMap.get(device.id)
      return {
        deviceId: device.id,
        sn: device.sn,
        assetNo: device.assetNo,
        externalDeviceId: device.externalDeviceId,
        externalIp: device.externalIp,
        internalIp: device.internalIp,
        cardTypeName,
        lifecycleStatus: device.lifecycleStatus,
        opsStatus: device.opsStatus,
        previousLifecycleStatus: changeLog?.previousLifecycleStatus ?? null,
        previousOpsStatus: changeLog?.previousOpsStatus ?? null,
        linkKind: link.linkKind,
        parseStatus: parsed?.parse_status ?? null,
        rowNo: changeLog?.importRowNo ?? null,
        warnings: parsed?.warnings ?? [],
        errors: parsed?.errors ?? [],
      }
    })

    const base = mapBatchListItem(row)
    return {
      ...base,
      idcRegion: row.idcRegion,
      retireRemark: row.retireRemark,
      parsedAt: row.parsedAt?.toISOString() ?? null,
      parsedRows,
      plannedLines,
      devices: devicesFromLinks,
    }
  },
}
