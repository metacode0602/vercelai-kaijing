/**
 * 刊登读同步落库合并 — 纯函数，便于单测。
 *
 * 关键约束（修复历史断链）：
 * 1. 平台原始 status / publishState 必须归一到本地值域，不能直接写库。
 * 2. 读同步不得覆盖本地 payload 字段（note / cover / images / 内部关联键）。
 * 3. liveAt 只在平台为 live 时写入，非 live 不清空既有上架时间。
 *
 * @see docs/design/shop-module11-listing-mapping-trpc.md
 */
import { toLocalListingStatus } from "@workspace/marketplace"

/**
 * 归属本地的 payload 键：读同步时优先保留站内值。
 * 平台 raw 里同名键（如 images）不覆盖本地已有值。
 */
export const LOCAL_PAYLOAD_KEYS = [
  "note",
  "cover",
  "images",
  "sellerSku",
  "primarySku",
  "spuCode",
  "shopName",
  "platform",
  "site",
  "platformSku",
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/**
 * 合并平台 raw 与本地 payload：
 * - 底座为平台 raw（保持既有「payload = 平台原始体」行为）
 * - 本地键已有值时保留本地值（含空字符串，视为用户显式清空）
 * - shopName / platform / site 缺失时用店铺信息补齐
 */
export function mergeListingPayload(input: {
  existing?: unknown
  platformRaw?: unknown
  shop?: { name?: string | null; platform?: string | null; site?: string | null }
}): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(input.platformRaw)
    ? { ...input.platformRaw }
    : {}
  const existing = isPlainObject(input.existing) ? input.existing : {}
  for (const key of LOCAL_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(existing, key)) {
      base[key] = existing[key]
    }
  }
  if (base.shopName == null && input.shop?.name) base.shopName = input.shop.name
  if (base.platform == null && input.shop?.platform) base.platform = input.shop.platform
  if (base.site == null && input.shop?.site) base.site = input.shop.site
  return base
}

/**
 * 读同步后的 liveAt：
 * 平台 live → 保留已有上架时间，否则记本次时间；
 * 非 live → 保留已有值（不因一次拉取清空）。
 */
export function nextLiveAt(input: {
  platformStatus: string | null | undefined
  existingLiveAt?: Date | null
  now: Date
}): Date | null {
  if (toLocalListingStatus(input.platformStatus) === "live") {
    return input.existingLiveAt ?? input.now
  }
  return input.existingLiveAt ?? null
}
