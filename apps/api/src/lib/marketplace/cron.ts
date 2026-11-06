import { Cron } from "croner"
import { env } from "../env"
import { runMarketplaceSync, type MarketplaceSyncResource } from "./sync"

let jobs: Cron[] = []
let started = false
let inflight: Promise<unknown> | null = null

export function triggerMarketplaceSync(
  resource: MarketplaceSyncResource
): boolean {
  if (inflight) {
    console.warn(
      `[marketplace-cron] skip ${resource}: previous run still active`
    )
    return false
  }

  const task = runMarketplaceSync({ resource })
    .then((result) => {
      console.info("[marketplace-cron] completed", { resource, ...result })
    })
    .catch((error) => {
      console.error("[marketplace-cron] failed", { resource, error })
    })
    .finally(() => {
      if (inflight === task) inflight = null
    })
  inflight = task
  return true
}

export function startMarketplaceSyncCron(): Cron[] {
  if (!env.MARKETPLACE_SYNC_CRON_ENABLED || started) return jobs
  started = true

  const timezone = env.MARKETPLACE_SYNC_CRON_TIMEZONE
  const specs: Array<[MarketplaceSyncResource, string]> = [
    ["orders", env.MARKETPLACE_SYNC_ORDERS_CRON],
    ["logistics", env.MARKETPLACE_SYNC_LOGISTICS_CRON],
    ["reviews", env.MARKETPLACE_SYNC_REVIEWS_CRON],
    ["listings", env.MARKETPLACE_SYNC_LISTINGS_CRON],
    ["settlements", env.MARKETPLACE_SYNC_SETTLEMENTS_CRON],
  ]

  jobs = specs.map(
    ([resource, expression]) =>
      new Cron(
        expression,
        {
          name: `marketplace-${resource}`,
          timezone,
          protect: true,
          unref: true,
        },
        () => {
          triggerMarketplaceSync(resource)
        }
      )
  )

  console.info("[marketplace-cron] started", {
    timezone,
    orders: env.MARKETPLACE_SYNC_ORDERS_CRON,
    logistics: env.MARKETPLACE_SYNC_LOGISTICS_CRON,
    reviews: env.MARKETPLACE_SYNC_REVIEWS_CRON,
    listings: env.MARKETPLACE_SYNC_LISTINGS_CRON,
    settlements: env.MARKETPLACE_SYNC_SETTLEMENTS_CRON,
  })
  return jobs
}

export function stopMarketplaceSyncCron() {
  for (const job of jobs) job.stop()
  jobs = []
  started = false
}

export function isMarketplaceSyncCronRunning(): boolean {
  return inflight !== null
}
