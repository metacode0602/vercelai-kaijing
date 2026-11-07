import { timingSafeEqual } from "node:crypto"
import { Hono } from "hono"
import { env } from "../lib/env"
import {
  runMarketplaceSync,
  type MarketplaceSyncResource,
} from "../lib/marketplace/sync"
import { findSyncTask } from "../lib/marketplace/sync-tasks"

const sync = new Hono()

const resources: MarketplaceSyncResource[] = [
  "orders",
  "logistics",
  "reviews",
  "listings",
  "settlements",
  "ship_batch",
  "all",
]

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function readSecret(header: string | undefined): string | undefined {
  if (!header) return undefined
  return header.replace(/^bearer\s+/i, "").trim()
}

/**
 * Internal service-to-service marketplace sync.
 * Auth: INTERNAL_SYNC_API_KEY via Authorization Bearer or x-internal-sync-key.
 * Never reports success without attempting the real OpenAPI path.
 * When syncTaskId is present, organizationId/shopId must match that task (no cross-org updates).
 */
sync.post("/marketplace", async (c) => {
  if (!env.INTERNAL_SYNC_API_KEY) {
    return c.json({ ok: false, error: "internal_sync_key_not_configured" }, 503)
  }
  const provided =
    readSecret(c.req.header("x-internal-sync-key")) ??
    readSecret(c.req.header("authorization"))
  if (!provided || !safeEqual(provided, env.INTERNAL_SYNC_API_KEY)) {
    return c.json({ ok: false, error: "unauthorized" }, 401)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    resource?: string
    shopId?: string
    organizationId?: string
    syncTaskId?: string
    requestId?: string
    wait?: boolean
    batchId?: string
  }
  const resource = (body.resource ?? "orders") as MarketplaceSyncResource
  if (!resources.includes(resource)) {
    return c.json({ ok: false, error: "invalid_resource" }, 400)
  }

  let organizationId = body.organizationId
  let shopId = body.shopId
  const syncTaskId = body.syncTaskId
  const batchId = body.batchId

  if (syncTaskId) {
    const task = await findSyncTask(syncTaskId)
    if (!task) {
      return c.json({ ok: false, error: "sync_task_not_found" }, 404)
    }
    if (organizationId && task.organizationId !== organizationId) {
      return c.json(
        {
          ok: false,
          error: "sync_task_organization_mismatch",
          message: "syncTaskId 不属于请求的 organizationId",
        },
        403
      )
    }
    if (shopId && task.shopId && task.shopId !== shopId) {
      return c.json(
        {
          ok: false,
          error: "sync_task_shop_mismatch",
          message: "syncTaskId 不属于请求的 shopId",
        },
        403
      )
    }
    // Bind to the task's org (and shop when the task is shop-scoped).
    organizationId = task.organizationId
    if (task.shopId) shopId = task.shopId
  }

  const options = {
    resource,
    shopId,
    organizationId,
    syncTaskId,
    requestId: body.requestId,
    batchId,
  }

  if (body.wait === false) {
    void runMarketplaceSync(options).catch((error) => {
      console.error("[internal-sync] async failed", error)
    })
    return c.json({ ok: true, accepted: true, resource }, 202)
  }

  try {
    const result = await runMarketplaceSync(options)
    const ok = result.errors.length === 0
    return c.json(
      {
        ok,
        resource,
        result: {
          shops: result.shops,
          orders: result.orders,
          shipments: result.shipments,
          reviews: result.reviews,
          listings: result.listings,
          settlements: result.settlements,
          settlementLines: result.settlementLines,
          reserved: result.reserved,
          errorCount: result.errors.length,
          errors: result.errors,
          progressDone:
            result.orders +
            result.shipments +
            result.reviews +
            result.listings +
            result.settlements,
        },
      },
      ok ? 200 : 502
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ ok: false, error: message }, 500)
  }
})

export default sync
