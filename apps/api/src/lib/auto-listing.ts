/**
 * Agent 任务完成后的即时上架评估（与 apps/web auto-listing-engine 条件对齐）
 * 放在 apps/api，避免 api 包依赖 web。
 *
 * 上架条件（isEligibleForListing，不检查 lifecycleStatus）：
 * - reviewStatus = 'approved'
 * - inMaintenance = false
 * - listingDisabled = false
 * - dataCenterId 已设置
 * - 定价已配置
 * - probe consistent（DEVICE_LISTING_REQUIRES_PROBE，默认 true）
 *
 * 动作：
 * - autoList：仅 online + eligible → listed
 * - autoUnlist：仅 listed + !eligible → online
 */
import { db } from '../lib/db'
import {
  supplierDevice,
  supplierCardListPrice,
  devicePlatformProbeSnapshot,
} from '@workspace/db/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'

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

/** 是否满足上架条件（不检查 lifecycleStatus） */
export async function isEligibleForListing(deviceId: string): Promise<boolean> {
  const [device] = await db
    .select()
    .from(supplierDevice)
    .where(eq(supplierDevice.id, deviceId))
    .limit(1)

  if (!device) return false
  if (device.reviewStatus !== 'approved') return false
  if (device.inMaintenance) return false
  if (device.listingDisabled) return false
  if (!device.dataCenterId) return false

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

  if (!pricing) return false

  if (isListingProbeRequired()) {
    const flag = await getLatestProbeConsistency(deviceId)
    if (flag !== 'consistent') return false
  }

  return true
}

/**
 * @deprecated 请优先使用 isEligibleForListing
 */
export async function evaluateDeviceListing(deviceId: string): Promise<boolean> {
  return isEligibleForListing(deviceId)
}

export async function autoListDevice(deviceId: string): Promise<boolean> {
  const [device] = await db
    .select({ lifecycleStatus: supplierDevice.lifecycleStatus })
    .from(supplierDevice)
    .where(eq(supplierDevice.id, deviceId))
    .limit(1)

  if (!device || device.lifecycleStatus !== 'online') return false

  const eligible = await isEligibleForListing(deviceId)
  if (!eligible) return false

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
 * 自动下架：listed → online。
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
