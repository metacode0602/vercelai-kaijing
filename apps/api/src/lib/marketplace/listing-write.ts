/**
 * 刊登平台写路径（publish / update / deactivate）。
 *
 * 由 apps/shop 入队的同步任务（type=publish / status，target=`listing:<id>[#action]`）
 * 经 `POST /api/v1/sync/marketplace` resource=listing_write 触发；
 * 执行 connector.createListing / updateListing / deactivateListing 并回执回写 listings。
 *
 * 闭环：待审确认 → 本地刊登 → 发布任务 → connector → 平台 item_id → 状态回写。
 * @see docs/design/shop-module11-listing-mapping-trpc.md
 * @see docs/design/platform-apis/daraz/daraz-products-api.md §4
 */
import { and, eq } from "drizzle-orm"
import {
  integrationLogs,
  listings,
  productVariants,
  products,
  sellerSkuMappings,
  shops,
} from "@workspace/db"
import type { DomainListingInput, DomainListingResult } from "@workspace/marketplace"
import { toLocalListingStatus } from "@workspace/marketplace"
import { db } from "../db"
import { createShopConnector } from "./connector"
import { isOrderListingSyncPlatform } from "./app-env"
import {
  findSyncTask,
  markSyncTaskFinished,
  markSyncTaskRunning,
} from "./sync-tasks"

export type ListingWriteAction = "publish" | "update" | "deactivate"

export type ListingWriteResult = {
  ok: boolean
  listingId?: string
  action?: ListingWriteAction
  externalId?: string
  error?: string
}

/** target 形如 `listing:<id>` / `listing:<id>#deactivate` / `listing:<id>#update`。 */
export function parseListingWriteTarget(
  target: string | null | undefined
): { listingId: string; action: ListingWriteAction } | null {
  if (!target) return null
  const match = /^listing:([^#\s]+)(?:#(publish|update|deactivate))?$/.exec(
    target.trim()
  )
  if (!match?.[1]) return null
  const action = (match[2] as ListingWriteAction | undefined) ?? "publish"
  return { listingId: match[1], action }
}

function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ""
}

async function loadWriteContext(input: {
  listingId: string
  organizationId?: string
}) {
  const conditions = [eq(listings.id, input.listingId)]
  if (input.organizationId) {
    conditions.push(eq(listings.organizationId, input.organizationId))
  }
  const [listing] = await db
    .select()
    .from(listings)
    .where(and(...conditions))
    .limit(1)
  if (!listing) return { error: `刊登不存在：${input.listingId}` as const }

  const [shop] = await db
    .select()
    .from(shops)
    .where(eq(shops.id, listing.shopId))
    .limit(1)
  if (!shop) return { error: `刊登所属店铺不存在：${listing.shopId}` as const }
  if (shop.deletedAt) return { error: `店铺已删除：${shop.name}` as const }
  if (!isOrderListingSyncPlatform(shop.platform)) {
    return { error: `平台 ${shop.platform} 暂不支持刊登写入` as const }
  }

  const mappingRows = await db
    .select()
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, listing.organizationId),
        eq(sellerSkuMappings.listingId, listing.id)
      )
    )
    .limit(200)

  const variantId = listing.primaryVariantId ?? listing.variantId
  let variant: typeof productVariants.$inferSelect | undefined
  if (variantId) {
    const [row] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1)
    variant = row
  }
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, listing.productId))
    .limit(1)

  return { listing, shop, mappingRows, variant, product }
}

/**
 * 组装 DomainListingInput：头信息 + 映射行 SKU + 本地图片 + 包装尺寸。
 * 包装尺寸从变体换算（mm→cm、g→kg）；站点单位差异需联调确认。
 */
export function buildListingInput(context: {
  listing: typeof listings.$inferSelect
  shop: typeof shops.$inferSelect
  mappingRows: (typeof sellerSkuMappings.$inferSelect)[]
  variant?: typeof productVariants.$inferSelect | null
  product?: typeof products.$inferSelect | null
}): DomainListingInput {
  const { listing, shop, mappingRows, variant, product } = context
  const payload = plainRecord(listing.payload)
  const localImages = Array.isArray(payload.images)
    ? payload.images.filter(
        (item): item is string => typeof item === "string" && !!item.trim()
      )
    : []
  const cover = firstString(payload.cover)
  const images = [...(cover ? [cover] : []), ...localImages]

  const packageLength =
    variant?.lengthMm != null && variant.lengthMm > 0
      ? String(Math.round((variant.lengthMm / 10) * 100) / 100)
      : undefined
  const packageWidth =
    variant?.widthMm != null && variant.widthMm > 0
      ? String(Math.round((variant.widthMm / 10) * 100) / 100)
      : undefined
  const packageHeight =
    variant?.heightMm != null && variant.heightMm > 0
      ? String(Math.round((variant.heightMm / 10) * 100) / 100)
      : undefined
  const packageWeight =
    variant?.weightGrams != null && variant.weightGrams > 0
      ? String(Math.round((variant.weightGrams / 1000) * 1000) / 1000)
      : undefined

  const skus = mappingRows
    .filter((row) => row.sellerSku.trim())
    .map((row) => {
      const meta = plainRecord(row.meta)
      const attributes: Record<string, unknown> = {}
      const color = firstString(meta.color)
      const size = firstString(meta.size)
      if (color) attributes.color_family = color
      if (size) attributes.size = size
      return {
        sellerSku: row.sellerSku.trim(),
        quantity: listing.stockOnHand ?? 0,
        price: listing.priceAmount ?? undefined,
        packageLength,
        packageWidth,
        packageHeight,
        packageWeight,
        attributes,
      }
    })

  const title = firstString(listing.listingTitle, listing.title)
  const description = firstString(payload.description, title, product?.title)

  return {
    title,
    categoryExternalId: firstString(listing.categoryExternalId),
    priceAmount: firstString(listing.priceAmount, "0"),
    priceCurrency: firstString(listing.priceCurrency, shop.currency, "USD"),
    payload: {
      images,
      description,
      brand: firstString(listing.brandName) || undefined,
      skus,
      product: {
        ...(firstString(listing.categoryPath)
          ? { category_path: listing.categoryPath }
          : {}),
      },
    },
  }
}

async function writeBackSuccess(input: {
  listing: typeof listings.$inferSelect
  action: ListingWriteAction
  result: DomainListingResult
  now: Date
}): Promise<void> {
  const { listing, action, result, now } = input
  const localStatus = toLocalListingStatus(result.status)

  if (action === "deactivate") {
    await db
      .update(listings)
      .set({ status: "offline", lastError: null, updatedAt: now })
      .where(eq(listings.id, listing.id))
    return
  }

  const patch: Partial<typeof listings.$inferInsert> = {
    publishState: "published",
    lastError: null,
    updatedAt: now,
  }
  if (action === "publish") {
    patch.externalItemId = result.externalId
    patch.submittedAt = listing.submittedAt ?? now
    patch.status = localStatus
    if (localStatus === "live") patch.liveAt = listing.liveAt ?? now
  } else {
    patch.status = localStatus
    if (localStatus === "live") patch.liveAt = listing.liveAt ?? now
  }
  await db.update(listings).set(patch).where(eq(listings.id, listing.id))

  if (result.externalId) {
    await db
      .update(sellerSkuMappings)
      .set({
        itemId: result.externalId,
        syncedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(sellerSkuMappings.organizationId, listing.organizationId),
          eq(sellerSkuMappings.listingId, listing.id)
        )
      )
  }
}

async function writeBackFailure(input: {
  listing: typeof listings.$inferSelect
  error: string
  now: Date
}): Promise<void> {
  await db
    .update(listings)
    .set({
      publishState: "sync_failed",
      lastError: input.error.slice(0, 2000),
      updatedAt: input.now,
    })
    .where(eq(listings.id, input.listing.id))
}

async function logListingWrite(input: {
  shopId: string
  action: ListingWriteAction
  status: "success" | "error"
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
      action: `listing.${input.action}`,
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

/**
 * 执行单条刊登平台写入。有 syncTaskId 时同步回写 sync_tasks / sync_job_runs。
 * 任何失败都回写 listings.publishState=sync_failed + lastError，禁止假成功。
 */
export async function runListingWrite(
  options: {
    syncTaskId?: string
    organizationId?: string
    shopId?: string
    requestId?: string
    target?: string
    action?: ListingWriteAction
  }
): Promise<ListingWriteResult> {
  const now = new Date()
  let target = options.target
  const action = options.action
  let organizationId = options.organizationId
  let requestId = options.requestId

  if (options.syncTaskId) {
    const task = await findSyncTask(options.syncTaskId)
    if (!task) {
      return { ok: false, error: "sync_task_not_found" }
    }
    if (organizationId && task.organizationId !== organizationId) {
      return { ok: false, error: "sync_task_organization_mismatch" }
    }
    organizationId = task.organizationId
    requestId = task.requestId ?? requestId
    target = target ?? task.target
    if (options.shopId && task.shopId && task.shopId !== options.shopId) {
      return { ok: false, error: "sync_task_shop_mismatch" }
    }
    await markSyncTaskRunning({
      syncTaskId: task.id,
      organizationId: task.organizationId,
      requestId,
      message: "正在调用平台刊登写接口",
    }).catch(() => undefined)
  }

  const parsed = parseListingWriteTarget(target)
  if (!parsed) {
    const error = `同步任务 target 非法（期望 listing:<id>[#action]）：${target ?? ""}`
    if (options.syncTaskId) {
      await markSyncTaskFinished({
        syncTaskId: options.syncTaskId,
        organizationId,
        ok: false,
        error,
        message: "刊登写入失败",
        requestId,
        httpStatus: 400,
      }).catch(() => undefined)
    }
    return { ok: false, error }
  }
  const resolvedAction = action ?? parsed.action

  const context = await loadWriteContext({
    listingId: parsed.listingId,
    organizationId,
  })
  if ("error" in context) {
    if (options.syncTaskId) {
      await markSyncTaskFinished({
        syncTaskId: options.syncTaskId,
        organizationId,
        ok: false,
        error: context.error,
        message: "刊登写入失败",
        requestId,
        httpStatus: 404,
      }).catch(() => undefined)
    }
    return { ok: false, listingId: parsed.listingId, action: resolvedAction, error: context.error }
  }

  const { listing, shop, mappingRows, variant, product } = context
  const finish = async (result: ListingWriteResult) => {
    if (!options.syncTaskId) return
    await markSyncTaskFinished({
      syncTaskId: options.syncTaskId,
      organizationId: listing.organizationId,
      ok: result.ok,
      progressDone: result.ok ? 1 : 0,
      progressTotal: 1,
      error: result.ok ? null : (result.error ?? "listing write failed"),
      message: result.ok
        ? `刊登${resolvedAction === "publish" ? "发布" : resolvedAction === "deactivate" ? "下架" : "更新"}成功`
        : "刊登平台写入失败",
      detail: JSON.stringify(result).slice(0, 4000),
      requestId,
      httpStatus: result.ok ? 200 : 502,
    }).catch(() => undefined)
  }

  try {
    const input = buildListingInput({ listing, shop, mappingRows, variant, product })
    const skuRows = Array.isArray(input.payload?.skus) ? input.payload.skus : []

    if (resolvedAction === "publish" && !input.categoryExternalId) {
      throw new Error("缺少平台类目 ID（PrimaryCategory），请先在刊登详情补全")
    }
    if (
      (resolvedAction === "publish" || resolvedAction === "update") &&
      skuRows.length === 0
    ) {
      throw new Error("缺少 Seller SKU 映射行，无法组装平台 SKU")
    }

    const connector = await createShopConnector({
      id: shop.id,
      organizationId: shop.organizationId,
      platform: shop.platform,
      region: shop.region,
      shopCipher: firstString(
        plainRecord(shop.meta).shopCipher,
        plainRecord(shop.meta).shop_cipher
      ) || null,
    })

    let result: DomainListingResult
    if (resolvedAction === "deactivate") {
      const externalId = firstString(listing.externalItemId)
      if (!externalId) throw new Error("刊登尚未发布（无 externalItemId），无需下架")
      result = await connector.deactivateListing(externalId)
    } else if (resolvedAction === "publish" && !listing.externalItemId) {
      result = await connector.createListing(input)
      if (!result.externalId) {
        throw new Error("平台未返回 item_id（创建成功以 item_id 为准，不以 HTTP 200 为准）")
      }
    } else {
      const externalId = firstString(listing.externalItemId)
      if (!externalId) throw new Error("刊登尚未发布（无 externalItemId）")
      result = await connector.updateListing(externalId, input)
    }

    await writeBackSuccess({ listing, action: resolvedAction, result, now })
    await logListingWrite({
      shopId: shop.id,
      action: resolvedAction,
      status: "success",
      message: `${shop.platform} listing ${resolvedAction} ok → ${result.externalId || listing.externalItemId || ""}`,
      requestId,
      payloadSummary: { listingId: listing.id, externalId: result.externalId },
      now,
    })
    const ok: ListingWriteResult = {
      ok: true,
      listingId: listing.id,
      action: resolvedAction,
      externalId: result.externalId || firstString(listing.externalItemId) || undefined,
    }
    await finish(ok)
    return ok
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeBackFailure({ listing, error: message, now })
    await logListingWrite({
      shopId: shop.id,
      action: resolvedAction,
      status: "error",
      message: message.slice(0, 1000),
      requestId,
      payloadSummary: { listingId: listing.id },
      now,
    })
    const failed: ListingWriteResult = {
      ok: false,
      listingId: listing.id,
      action: resolvedAction,
      error: message,
    }
    await finish(failed)
    return failed
  }
}
