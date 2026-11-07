import { Cron } from "croner"
import { env } from "../env"
import { runMarketplaceSync, type MarketplaceSyncResource } from "./sync"
import { scanOrderExceptionsForAllOrganizations } from "../order-exceptions-scan"
import {
  triggerReverseSync,
  triggerDueRefundDecisions,
} from "./aftersale-cron"

let jobs: Cron[] = []
let started = false
let inflight: Promise<unknown> | null = null
let scanInflight: Promise<unknown> | null = null

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

  if (env.MARKETPLACE_SYNC_REVERSE_CRON_ENABLED) {
    const reverseJob = new Cron(
      env.MARKETPLACE_SYNC_REVERSE_CRON,
      {
        name: "marketplace-reverse",
        timezone,
        protect: true,
        unref: true,
      },
      () => {
        triggerReverseSync()
      },
    )
    jobs.push(reverseJob)
    const reverseDecideJob = new Cron(
      env.MARKETPLACE_SYNC_REVERSE_DECIDE_CRON,
      {
        name: "marketplace-reverse-refund-decide",
        timezone,
        protect: true,
        unref: true,
      },
      () => {
        triggerDueRefundDecisions()
      },
    )
    jobs.push(reverseDecideJob)
  }

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

  if (env.ORDER_EXCEPTIONS_SCAN_CRON_ENABLED) {
    startOrderExceptionsScanCron()
  }

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

export function startOrderExceptionsScanCron(): Cron | null {
  if (!env.ORDER_EXCEPTIONS_SCAN_CRON_ENABLED) return null
  const timezone = env.MARKETPLACE_SYNC_CRON_TIMEZONE
  const job = new Cron(
    env.ORDER_EXCEPTIONS_SCAN_CRON,
    {
      name: "order-exceptions-scan",
      timezone,
      protect: true,
      unref: true,
    },
    () => {
      if (scanInflight) {
        console.warn("[order-exceptions-scan] skip: previous run still active")
        return
      }
      const task = scanOrderExceptionsForAllOrganizations()
        .then((result) => {
          console.info("[order-exceptions-scan] completed", result)
        })
        .catch((error) => {
          console.error("[order-exceptions-scan] failed", error)
        })
        .finally(() => {
          if (scanInflight === task) scanInflight = null
        })
      scanInflight = task
    },
  )
  jobs.push(job)
  console.info("[order-exceptions-scan] started", {
    timezone,
    cron: env.ORDER_EXCEPTIONS_SCAN_CRON,
  })
  return job
}
