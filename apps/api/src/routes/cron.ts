import { timingSafeEqual } from "node:crypto"
import { Hono } from "hono"
import { env } from "../lib/env"
import { triggerMarketplaceSync } from "../lib/marketplace/cron"
import type { MarketplaceSyncResource } from "../lib/marketplace/sync"

const cron = new Hono()

const resources: MarketplaceSyncResource[] = [
  "orders",
  "logistics",
  "reviews",
  "listings",
  "settlements",
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

cron.post("/marketplace-sync", async (c) => {
  if (!env.CRON_SECRET) {
    return c.json({ ok: false, error: "cron_secret_not_configured" }, 503)
  }

  const provided =
    readSecret(c.req.header("x-cron-secret")) ??
    readSecret(c.req.header("authorization"))
  if (!provided || !safeEqual(provided, env.CRON_SECRET)) {
    return c.json({ ok: false, error: "unauthorized" }, 401)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    resource?: string
  }
  const fromQuery = new URL(c.req.url).searchParams.get("resource") ?? undefined
  const requested = body.resource ?? fromQuery ?? "all"
  if (!resources.includes(requested as MarketplaceSyncResource)) {
    return c.json({ ok: false, error: "invalid_resource" }, 400)
  }

  const started = triggerMarketplaceSync(requested as MarketplaceSyncResource)
  return c.json({ ok: true, accepted: started, resource: requested }, 202)
})

export default cron
