/**
 * 库存推送 / 改价回写。
 *
 * 由 apps/shop 入队的同步任务（type=inventory | price）
 * 经 POST /api/v1/sync/marketplace resource=inventory_price_write 触发；
 * 调用 connector.updatePriceQuantity（Lazop /product/price_quantity/update）。
 * 未接入写入接口的平台如实失败，禁止假成功。
 */
import { and, eq, inArray } from "drizzle-orm"
import {
  integrationLogs,
  inventoryBalances,
  isShopWriteSwitchEnabled,
  listings,
  sellerSkuMappings,
  shops,
  shopWriteSwitchDisabledReason,
} from "@workspace/db"
import {
  chunkPriceQuantityItems,
  platformSupportsPriceQuantityWrite,
  unsupportedPriceQuantityWriteMessage,
} from "@workspace/marketplace"
import type { DomainPriceQuantityItem } from "@workspace/marketplace"
import { db } from "../db"
import { createShopConnector } from "./connector"
import {
  findSyncTask,
  markSyncTaskFinished,
  markSyncTaskRunning,
} from "./sync-tasks"

import {
  parseInventoryPriceWriteTarget,
  resolveWriteKind,
  type InventoryPriceWriteKind,
} from "./inventory-price-write-core"

export type { InventoryPriceWriteKind }
export { parseInventoryPriceWriteTarget, resolveWriteKind }

export type InventoryPriceWriteResult = {
  ok: boolean
  kind?: InventoryPriceWriteKind
  pushed?: number
  skipped?: number
  error?: string
  detail?: string
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ""
}

function availableQty(row: {
  onHand: number
  reserved: number
  qcHold: number
  damaged: number
}): number {
  return Math.max(0, row.onHand - row.reserved - row.qcHold - row.damaged)
}

async function writeLog(input: {
  shopId: string
  kind: InventoryPriceWriteKind
  status: "success" | "failed" | "skipped"
  message: string
  requestId?: string
  payloadSummary?: Record<string, unknown>
  now: Date
}): Promise<void> {
  await db
    .insert(integrationLogs)
    .values({
      shopId: input.shopId,
      direction: "out",
      action: input.kind === "price" ? "price.writeback" : "inventory.push",
      requestId: input.requestId,
      status: input.status,
      message: input.message.slice(0, 1000),
      payloadSummary: input.payloadSummary
        ? JSON.stringify(input.payloadSummary).slice(0, 4000)
        : undefined,
      createdAt: input.now,
    })
    .catch(() => undefined)
}

export async function runInventoryPriceWrite(options: {
  syncTaskId?: string
  organizationId?: string
  shopId?: string
  requestId?: string
  target?: string
  kind?: InventoryPriceWriteKind
}): Promise<InventoryPriceWriteResult> {
  const now = new Date()
  let organizationId = options.organizationId
  let shopId = options.shopId
  let requestId = options.requestId
  let target = options.target
  let taskType: string | undefined
  let kind = options.kind

  if (options.syncTaskId) {
    const task = await findSyncTask(options.syncTaskId)
    if (!task) return { ok: false, error: "sync_task_not_found" }
    if (organizationId && task.organizationId !== organizationId) {
      return { ok: false, error: "sync_task_organization_mismatch" }
    }
    if (shopId && task.shopId && task.shopId !== shopId) {
      return { ok: false, error: "sync_task_shop_mismatch" }
    }
    organizationId = task.organizationId
    shopId = task.shopId ?? shopId
    requestId = task.requestId ?? requestId
    target = target ?? task.target ?? undefined
    taskType = task.type
    await markSyncTaskRunning({
      syncTaskId: task.id,
      organizationId: task.organizationId,
      requestId,
      message: task.type === "price" ? "正在调用平台改价接口" : "正在调用平台库存推送接口",
    }).catch(() => undefined)
  }

  const parsed = parseInventoryPriceWriteTarget(target)
  kind = kind ?? resolveWriteKind(taskType, parsed.kind)

  const finish = async (result: InventoryPriceWriteResult) => {
    if (!options.syncTaskId) return result
    await markSyncTaskFinished({
      syncTaskId: options.syncTaskId,
      organizationId,
      ok: result.ok,
      progressDone: result.ok ? (result.pushed ?? 1) : 0,
      progressTotal: Math.max(1, (result.pushed ?? 0) + (result.skipped ?? 0)),
      error: result.ok ? null : (result.error ?? "inventory/price write failed"),
      message: result.ok
        ? kind === "price"
          ? `改价回写成功 ${result.pushed ?? 0} 条`
          : `库存推送成功 ${result.pushed ?? 0} 条`
        : kind === "price"
          ? "改价回写失败"
          : "库存推送失败",
      detail: result.detail ?? JSON.stringify(result).slice(0, 4000),
      requestId,
      httpStatus: result.ok ? 200 : 502,
    }).catch(() => undefined)
    return result
  }

  if (!organizationId) {
    return finish({ ok: false, kind, error: "缺少 organizationId" })
  }
  if (!shopId) {
    return finish({ ok: false, kind, error: "库存推送/改价回写需要指定店铺" })
  }

  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.id, shopId), eq(shops.organizationId, organizationId)))
    .limit(1)
  if (!shop) {
    return finish({ ok: false, kind, error: "店铺不存在" })
  }

  const enabled =
    kind === "price"
      ? isShopWriteSwitchEnabled(shop.priceWritebackEnabled)
      : isShopWriteSwitchEnabled(shop.inventoryPushEnabled)
  if (!enabled) {
    const error = shopWriteSwitchDisabledReason(kind)
    await writeLog({
      shopId: shop.id,
      kind,
      status: "skipped",
      message: error,
      requestId,
      now,
    })
    return finish({ ok: false, kind, error })
  }

  if (!platformSupportsPriceQuantityWrite(shop.platform)) {
    const error = unsupportedPriceQuantityWriteMessage(shop.platform)
    await writeLog({
      shopId: shop.id,
      kind,
      status: "failed",
      message: error,
      requestId,
      now,
    })
    return finish({ ok: false, kind, error })
  }

  const listingFilters = [
    eq(listings.organizationId, organizationId),
    eq(listings.shopId, shop.id),
  ]
  if (parsed.listingId) listingFilters.push(eq(listings.id, parsed.listingId))

  const listingRows = await db
    .select()
    .from(listings)
    .where(and(...listingFilters))

  const published = listingRows.filter((row) => firstString(row.externalItemId))
  if (published.length === 0) {
    const error = parsed.listingId
      ? "刊登尚未发布（无 externalItemId），无法推送到平台"
      : "该店铺没有已发布到平台的刊登，无法推送"
    return finish({ ok: false, kind, error })
  }

  const listingIds = published.map((row) => row.id)
  const mappingRows = await db
    .select()
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, organizationId),
        eq(sellerSkuMappings.shopId, shop.id),
        inArray(sellerSkuMappings.listingId, listingIds),
      ),
    )

  const variantIds = [
    ...new Set(
      mappingRows
        .map((row) => row.variantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const balanceRows =
    variantIds.length > 0
      ? await db
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.organizationId, organizationId),
              inArray(inventoryBalances.variantId, variantIds),
            ),
          )
      : []

  const qtyByVariant = new Map<string, number>()
  for (const row of balanceRows) {
    if (published.some((listing) => listing.warehouseCode && listing.warehouseCode !== row.warehouseCode)) {
      // still allow matching listings; filter per listing later
    }
    qtyByVariant.set(row.variantId, (qtyByVariant.get(row.variantId) ?? 0) + availableQty(row))
  }

  const mappingsByListing = new Map<string, typeof mappingRows>()
  for (const row of mappingRows) {
    if (!row.listingId) continue
    const list = mappingsByListing.get(row.listingId) ?? []
    list.push(row)
    mappingsByListing.set(row.listingId, list)
  }

  const items: DomainPriceQuantityItem[] = []
  const skipReasons: string[] = []
  for (const listing of published) {
    const maps = mappingsByListing.get(listing.id) ?? []
    const skus = maps
      .map((map) => {
        const sellerSku = firstString(map.sellerSku)
        if (!sellerSku) return null
        const qty =
          map.variantId != null
            ? balanceRows
                .filter((row) => {
                  if (row.variantId !== map.variantId) return false
                  if (listing.warehouseCode && row.warehouseCode !== listing.warehouseCode) return false
                  return true
                })
                .reduce((sum, row) => sum + availableQty(row), 0)
            : 0
        if (kind === "price") {
          const price = firstString(listing.priceAmount)
          if (!price) return null
          return {
            sellerSku,
            platformSkuId: firstString(map.platformSkuId) || undefined,
            price,
          }
        }
        return {
          sellerSku,
          platformSkuId: firstString(map.platformSkuId) || undefined,
          quantity: qty,
        }
      })
      .filter((sku): sku is NonNullable<typeof sku> => sku != null)
    if (skus.length === 0) {
      skipReasons.push(
        `${listing.id}：${kind === "price" ? "缺少售价或 Seller SKU 映射" : "缺少 Seller SKU 映射"}`,
      )
      continue
    }
    items.push({
      externalItemId: firstString(listing.externalItemId),
      skus,
    })
  }

  if (items.length === 0) {
    const error = skipReasons[0] ?? "没有可推送的刊登价格或库存"
    await writeLog({
      shopId: shop.id,
      kind,
      status: "failed",
      message: error,
      requestId,
      payloadSummary: { skipped: skipReasons },
      now,
    })
    return finish({ ok: false, kind, skipped: skipReasons.length, error, detail: skipReasons.join("；") })
  }

  try {
    const connector = await createShopConnector({
      id: shop.id,
      organizationId: shop.organizationId,
      platform: shop.platform,
      region: shop.region,
      shopCipher: firstString(
        shop.meta && typeof shop.meta === "object" ? (shop.meta as Record<string, unknown>).shopCipher : null,
        shop.meta && typeof shop.meta === "object" ? (shop.meta as Record<string, unknown>).shop_cipher : null,
      ) || null,
    })
    if (typeof connector.updatePriceQuantity !== "function") {
      const error = unsupportedPriceQuantityWriteMessage(shop.platform)
      await writeLog({ shopId: shop.id, kind, status: "failed", message: error, requestId, now })
      return finish({ ok: false, kind, error })
    }

    let pushed = 0
    const batchErrors: string[] = []
    for (const batch of chunkPriceQuantityItems(items)) {
      const result = await connector.updatePriceQuantity(batch)
      if (!result.ok) {
        batchErrors.push(result.error ?? "平台未确认写入成功")
        continue
      }
      pushed += batch.length
    }

    if (batchErrors.length > 0) {
      const error = batchErrors[0] ?? "平台写入失败"
      await writeLog({
        shopId: shop.id,
        kind,
        status: "failed",
        message: error,
        requestId,
        payloadSummary: { pushed, skipped: skipReasons.length, errors: batchErrors },
        now,
      })
      return finish({
        ok: false,
        kind,
        pushed,
        skipped: skipReasons.length,
        error,
        detail: [...batchErrors, ...skipReasons].join("；").slice(0, 4000),
      })
    }

    await writeLog({
      shopId: shop.id,
      kind,
      status: "success",
      message: `${shop.platform} ${kind === "price" ? "改价回写" : "库存推送"} ${pushed} 条`,
      requestId,
      payloadSummary: { pushed, skipped: skipReasons.length },
      now,
    })
    return finish({
      ok: true,
      kind,
      pushed,
      skipped: skipReasons.length,
      detail: skipReasons.length ? skipReasons.join("；").slice(0, 4000) : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeLog({
      shopId: shop.id,
      kind,
      status: "failed",
      message,
      requestId,
      now,
    })
    return finish({ ok: false, kind, error: message })
  }
}
