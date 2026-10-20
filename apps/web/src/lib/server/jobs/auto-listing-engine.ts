/**
 * 自动上架引擎
 *
 * 上架条件（isEligibleForListing，不检查 lifecycleStatus）：
 * - reviewStatus = 'approved'
 * - devicePlatformProbe 一致性检查通过（consistencyFlag='consistent'）
 *   - 由 DEVICE_LISTING_REQUIRES_PROBE 控制；默认 true（无快照视为不通过）
 * - 定价已配置（supplier_card_list_price 存在有效记录）
 * - inMaintenance = false
 * - listingDisabled = false
 * - dataCenterId 已设置
 *
 * 动作：
 * - autoList：仅当 lifecycleStatus === 'online' 且 eligible
 * - autoUnlist：仅当 lifecycleStatus === 'listed' 且 !eligible
 *
 * 触发方式：
 * - 事件驱动：设备上线 / 禁止上架切换 / probe 修复（见 physical-devices、probe-scheduled）
 * - Cron 每 15 分钟兜底
 */

import { db } from '@/lib/db'
import {
  supplierDevice,
  supplierCardListPrice,
  devicePlatformProbeSnapshot,
} from '@workspace/db/schema'
import { eq, and, isNull, sql, desc } from 'drizzle-orm'

/** 是否强制要求最新 probe 为 consistent。默认 true；设 DEVICE_LISTING_REQUIRES_PROBE=false 可关闭。 */
export function isListingProbeRequired(): boolean {
  return process.env.DEVICE_LISTING_REQUIRES_PROBE !== 'false'
}

async function getLatestProbeConsistency(deviceId: string): Promise<string | null> {
  const [probe] = await db
    .select({
      consistencyFlag: devicePlatformProbeSnapshot.consistencyFlag,
    })
    .from(devicePlatformProbeSnapshot)
    .where(
      and(
        eq(devicePlatformProbeSnapshot.supplierDeviceId, deviceId),
        eq(devicePlatformProbeSnapshot.recordKind, 'crm_inventory'),
      ),
    )
    .orderBy(desc(devicePlatformProbeSnapshot.snapshotHour))
    .limit(1)

  return probe?.consistencyFlag ?? null
}

/**
 * 评估设备是否满足上架条件（不检查 lifecycleStatus）
 */
export async function isEligibleForListing(deviceId: string): Promise<boolean> {
  const [device] = await db
    .select()
    .from(supplierDevice)
    .where(eq(supplierDevice.id, deviceId))
    .limit(1)

  if (!device) {
    return false
  }

  if (device.reviewStatus !== 'approved') {
    return false
  }

  if (device.inMaintenance) {
    return false
  }

  if (device.listingDisabled) {
    return false
  }

  if (!device.dataCenterId) {
    return false
  }

  const [pricing] = await db
    .select()
    .from(supplierCardListPrice)
    .where(
      and(
        eq(supplierCardListPrice.supplierId, device.supplierId),
        eq(supplierCardListPrice.dataCenterId, device.dataCenterId),
        eq(supplierCardListPrice.gpuCardTypeId, device.gpuCardTypeId),
        isNull(supplierCardListPrice.effectiveTo),
      ),
    )
    .limit(1)

  if (!pricing) {
    return false
  }

  if (isListingProbeRequired()) {
    const flag = await getLatestProbeConsistency(deviceId)
    if (flag !== 'consistent') {
      return false
    }
  }

  return true
}

/**
 * @deprecated 请优先使用 isEligibleForListing；保留别名以兼容调用方。
 */
export async function evaluateDeviceListing(deviceId: string): Promise<boolean> {
  return isEligibleForListing(deviceId)
}

/**
 * 自动上架单个设备：仅 online + eligible → listed
 */
export async function autoListDevice(deviceId: string): Promise<boolean> {
  const [device] = await db
    .select({ lifecycleStatus: supplierDevice.lifecycleStatus })
    .from(supplierDevice)
    .where(eq(supplierDevice.id, deviceId))
    .limit(1)

  if (!device || device.lifecycleStatus !== 'online') {
    return false
  }

  const eligible = await isEligibleForListing(deviceId)
  if (!eligible) {
    return false
  }

  const updated = await db
    .update(supplierDevice)
    .set({
      lifecycleStatus: 'listed',
      updatedAt: new Date(),
    })
    .where(and(eq(supplierDevice.id, deviceId), eq(supplierDevice.lifecycleStatus, 'online')))
    .returning({ id: supplierDevice.id })

  return updated.length > 0
}

/**
 * 自动下架单个设备（维护、禁止上架、定价缺失、probe 不一致等）
 */
export async function autoUnlistDevice(deviceId: string, reason: string): Promise<boolean> {
  console.log(`[autoUnlistDevice] deviceId=${deviceId} reason=${reason}`)

  const updated = await db
    .update(supplierDevice)
    .set({
      lifecycleStatus: 'online',
      updatedAt: new Date(),
    })
    .where(and(eq(supplierDevice.id, deviceId), eq(supplierDevice.lifecycleStatus, 'listed')))
    .returning({ id: supplierDevice.id })

  return updated.length > 0
}

/**
 * Probe 调度完成后的深度修复：对 listed 且最新 CRM 快照非 consistent 的设备立即下架。
 * 关闭 DEVICE_LISTING_REQUIRES_PROBE 时跳过。
 */
export async function remediateListedDevicesAfterProbe(input: {
  deviceIds: string[]
}): Promise<{ checked: number; unlisted: number }> {
  if (!isListingProbeRequired()) {
    return { checked: 0, unlisted: 0 }
  }

  const uniqueIds = [...new Set(input.deviceIds.filter(Boolean))]
  let unlisted = 0

  for (const deviceId of uniqueIds) {
    const [device] = await db
      .select({ lifecycleStatus: supplierDevice.lifecycleStatus })
      .from(supplierDevice)
      .where(eq(supplierDevice.id, deviceId))
      .limit(1)

    if (!device || device.lifecycleStatus !== 'listed') {
      continue
    }

    const flag = await getLatestProbeConsistency(deviceId)
    if (flag !== null && flag !== 'consistent') {
      const ok = await autoUnlistDevice(deviceId, `probe_inconsistent:${flag}`)
      if (ok) unlisted++
    }
  }

  return { checked: uniqueIds.length, unlisted }
}

/**
 * Cron 兜底：批量评估 online|listed 且已审核通过的设备
 */
export async function runAutoListingCron(): Promise<{
  evaluated: number
  listed: number
  unlisted: number
}> {
  const devices = await db
    .select({ id: supplierDevice.id, lifecycleStatus: supplierDevice.lifecycleStatus })
    .from(supplierDevice)
    .where(
      and(
        sql`${supplierDevice.lifecycleStatus} IN ('online', 'listed')`,
        eq(supplierDevice.reviewStatus, 'approved'),
      ),
    )

  let listed = 0
  let unlisted = 0

  for (const device of devices) {
    const eligible = await isEligibleForListing(device.id)

    if (eligible && device.lifecycleStatus === 'online') {
      const ok = await autoListDevice(device.id)
      if (ok) listed++
    } else if (!eligible && device.lifecycleStatus === 'listed') {
      const ok = await autoUnlistDevice(device.id, 'auto_unlisted_by_cron')
      if (ok) unlisted++
    }
  }

  return {
    evaluated: devices.length,
    listed,
    unlisted,
  }
}
