import { and, eq, or } from "drizzle-orm"
import { Hono } from "hono"
import { marketplaceWebhookEvents, shops } from "@workspace/db"
import { verifyLazopPushSignature } from "@workspace/marketplace"
import { db } from "../lib/db"
import { env } from "../lib/env"
import {
  getMarketplaceAppCredentials,
  resolveLazopPlatformFromAppKey,
  resolveLazopPlatformFromSite,
  type LazopPlatform,
} from "../lib/marketplace/app-env"
import {
  syncMarketplaceOrder,
  type MarketplaceSyncShop,
} from "../lib/marketplace/sync"

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

async function findShop(platform: LazopPlatform, sellerId: string) {
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

webhooks.post("/lazop", async (c) => {
  const rawBody = await c.req.text()
  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return c.json({ ok: false, error: "invalid_json" }, 400)
  }

  const data = asRecord(body.data)
  const platform =
    resolveLazopPlatformFromSite(
      firstString(body.site, data.site, body.region)
    ) ?? resolveLazopPlatformFromAppKey(firstString(body.app_key, body.appKey))
  if (!platform) {
    return c.json({ ok: false, error: "unknown_platform" }, 400)
  }

  const app = getMarketplaceAppCredentials(platform)
  if (!app.appKey || !app.appSecret) {
    return c.json({ ok: false, error: "platform_not_configured" }, 503)
  }

  const signature = signatureFrom(c.req.raw.headers)
  const signatureVerified =
    !env.MARKETPLACE_WEBHOOK_SKIP_VERIFY &&
    Boolean(signature) &&
    verifyLazopPushSignature({
      appKey: app.appKey,
      appSecret: app.appSecret,
      rawBody,
      signature: signature ?? "",
    })
  if (!signatureVerified && !env.MARKETPLACE_WEBHOOK_SKIP_VERIFY) {
    return c.json({ ok: false, error: "invalid_signature" }, 401)
  }

  const sellerId = firstString(body.seller_id, data.seller_id)
  const externalOrderId = firstString(
    data.trade_order_id,
    data.order_id,
    body.trade_order_id
  )
  const shop = sellerId ? await findShop(platform, sellerId) : undefined
  const messageTypeRaw = Number(body.message_type ?? data.message_type)
  const messageType = Number.isFinite(messageTypeRaw) ? messageTypeRaw : null

  await db.insert(marketplaceWebhookEvents).values({
    organizationId: shop?.organizationId,
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
    status: shop && externalOrderId ? "queued" : "unmatched",
    payload: body,
  })

  if (
    env.MARKETPLACE_WEBHOOK_SYNC_ENABLED &&
    shop &&
    externalOrderId &&
    (signatureVerified || env.MARKETPLACE_WEBHOOK_SKIP_VERIFY)
  ) {
    scheduleOrderSync(shop, externalOrderId)
  }

  return c.json({ ok: true })
})

export default webhooks
