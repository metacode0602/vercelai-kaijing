/**
 * Marketplace sync worker skeleton (no production cron).
 *
 * Loads encrypted credentials shape, calls MarketplaceConnector methods,
 * and structures writes to integration_states + integration_logs.
 * DB writes are stubbed behind `persist=true` (default false / dry-run).
 */

import {
  createMarketplaceConnector,
  isMarketplacePlatform,
} from "../adapters/factory"
import type { MarketplaceConnector } from "../adapters/types"
import type { MarketplacePlatform } from "../domain/types"
import {
  decryptCredentialPayload,
  type CredentialPayload,
} from "../crypto/credentials"

export type SyncResource = "shop" | "brands" | "categories" | "products" | "orders" | "all"

export interface SyncWorkerInput {
  shopId: string
  platform: MarketplacePlatform | string
  region?: string
  /** Comma-separated or array; default all. */
  resources?: SyncResource[] | string
  /**
   * When true, attempt real connector calls with live tokens.
   * When false (default), use dry-run/mock responses (no network).
   */
  live?: boolean
  /**
   * When true, call optional persist hooks (integration_states / logs).
   * Default false — structure only / console output.
   */
  persist?: boolean
  /** Pre-decrypted credentials (tests / CLI with env token). */
  credentials?: CredentialPayload
  /** Encrypted blob from integration_credentials.payload_encrypted. */
  payloadEncrypted?: string
  appKey?: string
  appSecret?: string
  shopCipher?: string
  fetchImpl?: typeof fetch
  /** Injected for tests / shop entry that has a DB client. */
  persistHooks?: SyncPersistHooks
}

export interface SyncLogRow {
  shopId: string
  direction: "in" | "out"
  action: string
  status: "success" | "error" | "skipped"
  message?: string
  payloadSummary?: string
  requestId?: string
}

export interface SyncStatePatch {
  shopId: string
  health: "idle" | "running" | "success" | "error"
  lastError?: string | null
  productsCursor?: string | null
  listingsCursor?: string | null
  ordersCursor?: string | null
  inventoryCursor?: string | null
  lastProductsSyncAt?: string | null
  lastListingsSyncAt?: string | null
  lastOrdersSyncAt?: string | null
  lastInventorySyncAt?: string | null
}

export interface SyncPersistHooks {
  writeLog?: (row: SyncLogRow) => Promise<void> | void
  patchState?: (patch: SyncStatePatch) => Promise<void> | void
  /** Optional upserts for domain rows — stubbed in CLI. */
  upsertProducts?: (rows: unknown[]) => Promise<void> | void
  upsertOrders?: (rows: unknown[]) => Promise<void> | void
  upsertBrands?: (rows: unknown[]) => Promise<void> | void
  upsertCategories?: (rows: unknown[]) => Promise<void> | void
}

export interface SyncResourceResult {
  resource: SyncResource
  ok: boolean
  dryRun: boolean
  count?: number
  cursor?: string | null
  error?: string
  sample?: unknown
}

export interface SyncWorkerResult {
  shopId: string
  platform: MarketplacePlatform
  live: boolean
  persist: boolean
  results: SyncResourceResult[]
  logs: SyncLogRow[]
  statePatch: SyncStatePatch
}

function parseResources(input?: SyncResource[] | string): SyncResource[] {
  if (!input) return ["all"]
  if (Array.isArray(input)) return input.length ? input : ["all"]
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as SyncResource[]
}

function expandResources(resources: SyncResource[]): Exclude<SyncResource, "all">[] {
  if (resources.includes("all")) {
    return ["shop", "brands", "categories", "products", "orders"]
  }
  return resources.filter((r): r is Exclude<SyncResource, "all"> => r !== "all")
}

/**
 * Encrypted credential payload fields (AES-256-GCM via encryptCredentialPayload):
 *   accessToken, refreshToken?, expiresAt?, refreshExpiresAt?, meta?
 * meta may hold shopCipher / sellerId / country for TikTok / Lazop.
 */
export function loadCredentials(input: SyncWorkerInput): CredentialPayload | null {
  if (input.credentials) return input.credentials
  if (input.payloadEncrypted) {
    return decryptCredentialPayload(input.payloadEncrypted)
  }
  const envToken =
    process.env.MARKETPLACE_SYNC_ACCESS_TOKEN ||
    process.env.DARAZ_ACCESS_TOKEN ||
    process.env.LAZADA_ACCESS_TOKEN ||
    process.env.TIKTOK_ACCESS_TOKEN
  if (envToken) {
    return {
      accessToken: envToken,
      refreshToken: process.env.MARKETPLACE_SYNC_REFRESH_TOKEN,
      meta: {
        shopCipher: process.env.TIKTOK_SHOP_CIPHER,
      },
    }
  }
  return null
}

function mockConnectorSample(resource: string, platform: MarketplacePlatform) {
  const now = new Date().toISOString()
  switch (resource) {
    case "shop":
      return {
        externalShopId: `${platform}-mock-shop`,
        name: `${platform} mock shop`,
        region: platform === "daraz" ? "lk" : "sg",
        currency: platform === "daraz" ? "LKR" : "USD",
      }
    case "brands":
      return [{ externalId: "br-mock-1", name: "MockBrand", syncedAt: now }]
    case "categories":
      return [
        {
          externalId: "cat-mock-1",
          name: "Mock Category",
          path: "Root > Mock",
          leaf: true,
        },
      ]
    case "products":
      return [
        {
          externalId: "item-mock-1",
          title: "Mock Product",
          status: "ACTIVE",
          skus: [{ sellerSku: "MOCK-SKU", quantity: 10 }],
        },
      ]
    case "orders":
      return [
        {
          externalOrderId: "ORD-MOCK-1",
          status: "paid",
          platformStatus: "pending",
          totalAmount: "12.50",
          currency: "USD",
        },
      ]
    default:
      return null
  }
}

async function withLog(
  logs: SyncLogRow[],
  hooks: SyncPersistHooks | undefined,
  persist: boolean,
  row: SyncLogRow,
) {
  logs.push(row)
  if (persist && hooks?.writeLog) await hooks.writeLog(row)
}

export async function runMarketplaceSync(
  input: SyncWorkerInput,
): Promise<SyncWorkerResult> {
  if (!isMarketplacePlatform(String(input.platform))) {
    throw new Error(`Unsupported platform: ${input.platform}`)
  }
  const platform = input.platform as MarketplacePlatform
  const live = Boolean(input.live)
  const persist = Boolean(input.persist)
  const resources = expandResources(parseResources(input.resources))
  const logs: SyncLogRow[] = []
  const results: SyncResourceResult[] = []
  const hooks = input.persistHooks

  const statePatch: SyncStatePatch = {
    shopId: input.shopId,
    health: "running",
    lastError: null,
  }

  await withLog(logs, hooks, persist, {
    shopId: input.shopId,
    direction: "out",
    action: "sync.start",
    status: "success",
    message: `resources=${resources.join(",")} live=${live}`,
  })

  if (persist && hooks?.patchState) {
    await hooks.patchState(statePatch)
  }

  const creds = loadCredentials(input)
  let connector: MarketplaceConnector | null = null

  if (live) {
    if (!creds?.accessToken) {
      const err =
        "live=true but no credentials (pass credentials / payloadEncrypted / MARKETPLACE_SYNC_ACCESS_TOKEN)"
      statePatch.health = "error"
      statePatch.lastError = err
      await withLog(logs, hooks, persist, {
        shopId: input.shopId,
        direction: "out",
        action: "sync.credentials",
        status: "error",
        message: err,
      })
      if (persist && hooks?.patchState) await hooks.patchState(statePatch)
      return {
        shopId: input.shopId,
        platform,
        live,
        persist,
        results,
        logs,
        statePatch,
      }
    }
    const appKey =
      input.appKey ||
      process.env[`${platform === "tiktok_shop" ? "TIKTOK" : platform.toUpperCase()}_APP_KEY`] ||
      ""
    const appSecret =
      input.appSecret ||
      process.env[
        `${platform === "tiktok_shop" ? "TIKTOK" : platform.toUpperCase()}_APP_SECRET`
      ] ||
      ""
    connector = createMarketplaceConnector({
      platform,
      region: input.region,
      appKey,
      appSecret,
      accessToken: creds.accessToken,
      shopCipher:
        input.shopCipher ||
        (typeof creds.meta?.shopCipher === "string" ? creds.meta.shopCipher : undefined),
      fetchImpl: input.fetchImpl,
    })
  }

  for (const resource of resources) {
    try {
      if (!live || !connector) {
        const sample = mockConnectorSample(resource, platform)
        results.push({
          resource,
          ok: true,
          dryRun: true,
          count: Array.isArray(sample) ? sample.length : 1,
          sample,
        })
        await withLog(logs, hooks, persist, {
          shopId: input.shopId,
          direction: "in",
          action: `sync.${resource}`,
          status: "skipped",
          message: "dry-run/mock (no live token)",
          payloadSummary: JSON.stringify(sample).slice(0, 200),
        })
        continue
      }

      let count = 0
      let cursor: string | null = null
      let sample: unknown

      if (resource === "shop") {
        sample = await connector.getShop()
        count = 1
      } else if (resource === "brands") {
        const page = await connector.listBrands()
        sample = page.items.slice(0, 3)
        count = page.items.length
        cursor = page.nextCursor ?? null
        if (persist && hooks?.upsertBrands) await hooks.upsertBrands(page.items)
      } else if (resource === "categories") {
        const tree = await connector.getCategoryTree()
        sample = tree.slice(0, 3)
        count = tree.length
        if (persist && hooks?.upsertCategories) await hooks.upsertCategories(tree)
      } else if (resource === "products") {
        const page = await connector.listProducts()
        sample = page.items.slice(0, 3)
        count = page.items.length
        cursor = page.nextCursor ?? null
        statePatch.productsCursor = cursor
        statePatch.lastProductsSyncAt = new Date().toISOString()
        statePatch.lastListingsSyncAt = statePatch.lastProductsSyncAt
        if (persist && hooks?.upsertProducts) await hooks.upsertProducts(page.items)
      } else if (resource === "orders") {
        const page = await connector.listOrders()
        sample = page.items.slice(0, 3)
        count = page.items.length
        cursor = page.nextCursor ?? null
        statePatch.ordersCursor = cursor
        statePatch.lastOrdersSyncAt = new Date().toISOString()
        if (persist && hooks?.upsertOrders) await hooks.upsertOrders(page.items)
      }

      results.push({ resource, ok: true, dryRun: false, count, cursor, sample })
      await withLog(logs, hooks, persist, {
        shopId: input.shopId,
        direction: "in",
        action: `sync.${resource}`,
        status: "success",
        message: `count=${count}`,
        payloadSummary: JSON.stringify(sample).slice(0, 200),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ resource, ok: false, dryRun: !live, error: message })
      statePatch.health = "error"
      statePatch.lastError = message
      await withLog(logs, hooks, persist, {
        shopId: input.shopId,
        direction: "in",
        action: `sync.${resource}`,
        status: "error",
        message,
      })
    }
  }

  if (statePatch.health !== "error") {
    statePatch.health = "success"
    statePatch.lastError = null
  }

  if (persist && hooks?.patchState) {
    await hooks.patchState(statePatch)
  }

  await withLog(logs, hooks, persist, {
    shopId: input.shopId,
    direction: "out",
    action: "sync.finish",
    status: statePatch.health === "success" ? "success" : "error",
    message: statePatch.lastError ?? "ok",
  })

  return {
    shopId: input.shopId,
    platform,
    live,
    persist,
    results,
    logs,
    statePatch,
  }
}
