import { and, eq, or } from "drizzle-orm"
import { Hono } from "hono"
import { marketplaceWebhookEvents, shops } from "@workspace/db"
import {
  findMarketplaceAppCredentialsByAppKey,
  verifyLazopPushSignature,
  type ResolvedMarketplaceAppCredential,
} from "@workspace/marketplace"
import { db } from "../lib/db"
import { env } from "../lib/env"
import {
  isLazopPlatform,
  resolveLazopPlatformFromSite,
  type LazopPlatform,
} from "../lib/marketplace/app-env"
import {
  syncMarketplaceOrder,
  type MarketplaceSyncShop,
} from "../lib/marketplace/sync"
import { syncReverseOrder } from "../lib/marketplace/aftersale-cron"

const webhooks = new Hono()

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value != null && value !== "") return String(value)
  }
  return undefined
}

function signatureFrom(headers: Headers): string | undefined {
  return (
    headers.get("authorization") ??
    headers.get("x-signature") ??
    headers.get("x-lazada-signature") ??
    undefined
  )
}

async function findShop(
  platform: LazopPlatform,
  sellerId: string,
  organizationId: string
) {
  const [row] = await db
    .select({
      id: shops.id,
      organizationId: shops.organizationId,
      platform: shops.platform,
      name: shops.name,
      region: shops.region,
      currency: shops.currency,
    })
    .from(shops)
    .where(
      and(
        eq(shops.platform, platform),
        eq(shops.organizationId, organizationId),
        or(eq(shops.sellerId, sellerId), eq(shops.externalShopId, sellerId))
      )
    )
    .limit(1)
  return row as MarketplaceSyncShop | undefined
}

function scheduleOrderSync(shop: MarketplaceSyncShop, externalOrderId: string) {
  setImmediate(() => {
    syncMarketplaceOrder({ shop, externalOrderId, includeTrace: true }).catch(
      (error) => {
        console.error("[marketplace-webhook] order sync failed", {
          shopId: shop.id,
          externalOrderId,
          error,
        })
      }
    )
  })
}

function scheduleReverseSync(
  shop: MarketplaceSyncShop,
  externalReverseOrderId: string
) {
  setImmediate(() => {
    syncReverseOrder({ shop, externalReverseOrderId }).catch((error) => {
      console.error("[marketplace-webhook] reverse sync failed", {
        shopId: shop.id,
        externalReverseOrderId,
        error,
      })
    })
  })
}

webhooks.post("/lazop", async (c) => {
  const rawBody = await c.req.text()
  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return c.json({ ok: false, error: "invalid_json" }, 400)
  }

  const data = asRecord(body.data)
  const appKey = firstString(body.app_key, body.appKey)
  const sitePlatform = resolveLazopPlatformFromSite(
    firstString(body.site, data.site, body.region)
  )
  if (!appKey) {
    return c.json({ ok: false, error: "unknown_app" }, 400)
  }

  const candidates = (
    await findMarketplaceAppCredentialsByAppKey(db, appKey)
  ).filter(
    (candidate) =>
      isLazopPlatform(candidate.platform) &&
      (!sitePlatform || candidate.platform === sitePlatform)
  )
  if (candidates.length === 0) {
    return c.json({ ok: false, error: "unknown_app" }, 400)
  }

  const signature = signatureFrom(c.req.raw.headers)
  const sellerId = firstString(body.seller_id, data.seller_id)
  const externalOrderId = firstString(
    data.trade_order_id,
    data.order_id,
    body.trade_order_id
  )
  const externalReverseOrderId = firstString(
    data.reverse_order_id,
    body.reverse_order_id,
    data.reverseOrderId
  )

  let matchedApp: ResolvedMarketplaceAppCredential | undefined
  let shop: MarketplaceSyncShop | undefined
  let signatureVerified = false
  for (const candidate of candidates) {
    const verified =
      !env.MARKETPLACE_WEBHOOK_SKIP_VERIFY &&
      Boolean(signature) &&
      verifyLazopPushSignature({
        appKey: candidate.appKey,
        appSecret: candidate.appSecret,
        rawBody,
        signature: signature ?? "",
      })
    if (!verified && !env.MARKETPLACE_WEBHOOK_SKIP_VERIFY) continue

    const candidateShop = sellerId
      ? await findShop(
          candidate.platform as LazopPlatform,
          sellerId,
          candidate.organizationId
        )
      : undefined
    matchedApp = candidate
    shop = candidateShop
    signatureVerified = verified
    if (candidateShop || env.MARKETPLACE_WEBHOOK_SKIP_VERIFY) break
  }

  if (!matchedApp) {
    return c.json({ ok: false, error: "invalid_signature" }, 401)
  }

  const platform = matchedApp.platform as LazopPlatform
  const messageTypeRaw = Number(body.message_type ?? data.message_type)
  const messageType = Number.isFinite(messageTypeRaw) ? messageTypeRaw : null

  await db.insert(marketplaceWebhookEvents).values({
    organizationId: shop?.organizationId ?? matchedApp.organizationId,
    shopId: shop?.id,
    platform,
    site: firstString(body.site, data.site),
    sellerId,
    messageType,
    eventType: firstString(
      body.event_type,
      data.event_type,
      data.message_type,
      data.order_status
    ),
    externalOrderId,
    externalOrderLineId: firstString(
      data.trade_order_line_id,
      data.order_item_id
    ),
    orderStatus: firstString(data.order_status, data.status),
    signatureVerified,
    status:
      shop && (externalOrderId || externalReverseOrderId)
        ? "queued"
        : "unmatched",
    payload: body,
  })

  if (
    env.MARKETPLACE_WEBHOOK_SYNC_ENABLED &&
    shop &&
    (signatureVerified || env.MARKETPLACE_WEBHOOK_SKIP_VERIFY)
  ) {
    // 逆向单（取消/退款）push：触发单号补拉建档。
    if (externalReverseOrderId) {
      scheduleReverseSync(shop, externalReverseOrderId)
    }
    // 正向订单 push：触发订单 + 轨迹补拉。
    if (externalOrderId) {
      scheduleOrderSync(shop, externalOrderId)
    }
  }

  return c.json({ ok: true })
})

export default webhooks
