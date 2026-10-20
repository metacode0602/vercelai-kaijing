/**
 * §2.6 设备可用性快照刷新
 * 从 supplierDevice 快照 → device_availability_snapshot
 * 用于运营看板（不参与用户侧查询和事务性分配）
 */

import { db } from "@/lib/db"
import {
  deviceAvailabilitySnapshot,
  supplierDevice,
  dataCenter,
  gpuCardType,
} from "@workspace/db/schema"
import { and, eq, inArray, sql } from "drizzle-orm"

/**
 * 重建全部设备快照（全量刷新，由定时任务触发）
 * 调度引擎会根据最新规则重新计算 pool / priorityClass / weight
 */
export async function refreshAllSnapshots(): Promise<void> {
  // 删除全量快照
  await db.delete(deviceAvailabilitySnapshot)

  // 从 supplierDevice 重建（仅 status = active 的设备）
  const activeDevices = await db
    .select({
      id: supplierDevice.id,
      dataCenterId: supplierDevice.dataCenterId,
      gpuCardTypeId: supplierDevice.gpuCardTypeId,
      gpuCount: supplierDevice.gpuCount,
    })
    .from(supplierDevice)
    .where(eq(supplierDevice.lifecycleStatus, "available"))

  if (activeDevices.length === 0) return

  // 批量插入快照（池归属由调度引擎异步计算后 update）
  const validDevices = activeDevices.filter((d) => d.dataCenterId !== null)
  await db
    .insert(deviceAvailabilitySnapshot)
    .values(
      validDevices.map((d) => ({
        supplierDeviceId: d.id,
        dataCenterId: d.dataCenterId!,
        gpuCardTypeId: d.gpuCardTypeId,
        gpuCount: d.gpuCount,
        pool: "od" as const,
        allocatableGpuCount: d.gpuCount,
        allocatedGpuCount: 0,
        currentPriorityClass: "od-normal",
        currentWeight: 50,
        preemptible: false,
        snapshotAt: new Date(),
      })),
    )
    .onConflictDoNothing()
}

/**
 * 增量刷新单个设备快照
 */
export async function refreshDeviceSnapshot(supplierDeviceId: string): Promise<void> {
  const device = await db
    .select()
    .from(supplierDevice)
    .where(eq(supplierDevice.id, supplierDeviceId))
    .limit(1)

  if (!device[0] || device[0].lifecycleStatus !== "available" || !device[0].dataCenterId) {
    await db
      .delete(deviceAvailabilitySnapshot)
      .where(eq(deviceAvailabilitySnapshot.supplierDeviceId, supplierDeviceId))
    return
  }

  const d = device[0]
  const dcId = d.dataCenterId!
  await db
    .insert(deviceAvailabilitySnapshot)
    .values({
      supplierDeviceId: d.id,
      dataCenterId: dcId,
      gpuCardTypeId: d.gpuCardTypeId,
      gpuCount: d.gpuCount,
      pool: "od",
      allocatableGpuCount: d.gpuCount,
      allocatedGpuCount: 0,
      currentPriorityClass: "od-normal",
      currentWeight: 50,
      preemptible: false,
      snapshotAt: new Date(),
    })
    .onConflictDoUpdate({
      target: deviceAvailabilitySnapshot.supplierDeviceId,
      set: {
        dataCenterId: dcId,
        gpuCardTypeId: d.gpuCardTypeId,
        gpuCount: d.gpuCount,
        snapshotAt: new Date(),
      },
    })
}
