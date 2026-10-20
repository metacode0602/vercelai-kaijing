/**
 * §2.6 设备可用性快照数据访问
 * 用于运营看板（不参与用户侧查询和事务性分配）
 */

import { db } from "@/lib/db"
import {
  deviceAvailabilitySnapshot,
  supplierDevice,
  dataCenter,
  gpuCardType,
} from "@workspace/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"
import { refreshAllSnapshots, refreshDeviceSnapshot } from "./snapshot-refresher"

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

export interface ListSnapshotsParams {
  page: number
  pageSize: number
  pool?: string | null
  dataCenterId?: string | null
  gpuCardTypeId?: string | null
}

export async function listSnapshots(params: ListSnapshotsParams) {
  const page = Math.max(1, params.page)
  const pageSize = Math.min(100, Math.max(1, params.pageSize))

  const conditions: any[] = []
  if (params.pool) {
    conditions.push(eq(deviceAvailabilitySnapshot.pool, params.pool))
  }
  if (params.dataCenterId) {
    conditions.push(eq(deviceAvailabilitySnapshot.dataCenterId, params.dataCenterId))
  }
  if (params.gpuCardTypeId) {
    conditions.push(eq(deviceAvailabilitySnapshot.gpuCardTypeId, params.gpuCardTypeId))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(deviceAvailabilitySnapshot)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      id: deviceAvailabilitySnapshot.id,
      supplierDeviceId: deviceAvailabilitySnapshot.supplierDeviceId,
      dataCenterId: deviceAvailabilitySnapshot.dataCenterId,
      dataCenterName: dataCenter.name,
      gpuCardTypeId: deviceAvailabilitySnapshot.gpuCardTypeId,
      gpuCardTypeName: gpuCardType.name,
      gpuCount: deviceAvailabilitySnapshot.gpuCount,
      pool: deviceAvailabilitySnapshot.pool,
      allocatedTo: deviceAvailabilitySnapshot.allocatedTo,
      allocatedGpuCount: deviceAvailabilitySnapshot.allocatedGpuCount,
      allocatableGpuCount: deviceAvailabilitySnapshot.allocatableGpuCount,
      currentPriorityClass: deviceAvailabilitySnapshot.currentPriorityClass,
      currentWeight: deviceAvailabilitySnapshot.currentWeight,
      preemptible: deviceAvailabilitySnapshot.preemptible,
      snapshotAt: deviceAvailabilitySnapshot.snapshotAt,
    })
    .from(deviceAvailabilitySnapshot)
    .leftJoin(dataCenter, eq(deviceAvailabilitySnapshot.dataCenterId, dataCenter.id))
    .leftJoin(gpuCardType, eq(deviceAvailabilitySnapshot.gpuCardTypeId, gpuCardType.id))
    .where(where)
    .orderBy(desc(deviceAvailabilitySnapshot.snapshotAt))
    .limit(pageSize)
    .offset(offset)

  return { items: rows, total, page, pageSize }
}

/**
 * 获取池容量汇总（运营看板用）
 */
export async function getPoolCapacitySummary() {
  const rows = await db
    .select({
      pool: deviceAvailabilitySnapshot.pool,
      totalGpu: sql<number>`sum(${deviceAvailabilitySnapshot.gpuCount})::int`,
      allocatableGpu: sql<number>`sum(${deviceAvailabilitySnapshot.allocatableGpuCount})::int`,
      allocatedGpu: sql<number>`sum(${deviceAvailabilitySnapshot.allocatedGpuCount})::int`,
      deviceCount: sql<number>`count(*)::int`,
    })
    .from(deviceAvailabilitySnapshot)
    .groupBy(deviceAvailabilitySnapshot.pool)

  return rows
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

export { refreshAllSnapshots, refreshDeviceSnapshot }
