/**
 * CLI entry for marketplace sync worker.
 *
 * Usage:
 *   pnpm --filter shop sync:marketplace -- --shopId=b5ofcwj2mzauov29y08m0q99 --platform=daraz
 *   pnpm --filter shop sync:marketplace -- --shopId=… --platform=daraz --live --resources=products,orders
 *   pnpm --filter shop sync:marketplace -- --shopId=… --platform=lazada --persist
 *
 * Dry-run (default): no live token required; prints mock connector samples + log/state patches.
 * Live: uses the tenant's stored platform app config (Settings → Marketplace apps) and DB credentials.
 * Persist: set --persist to exercise hooks (default stubs log to stdout; wire DB later).
 *
 * Credential payload (encrypted in integration_credentials.payload_encrypted):
 *   { accessToken, refreshToken?, expiresAt?, refreshExpiresAt?, meta?: { shopCipher?, … } }
 */

import {
  isMarketplacePlatform,
  runMarketplaceSync,
  type SyncLogRow,
  type SyncPersistHooks,
  type SyncStatePatch,
} from "@workspace/marketplace"

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  const hit = process.argv.find((a) => a.startsWith(prefix))
  if (hit) return hit.slice(prefix.length)
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith("--")) {
    return process.argv[idx + 1]
  }
  return undefined
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function hasEnvAccessToken() {
  return Boolean(
    process.env.MARKETPLACE_SYNC_ACCESS_TOKEN ||
      process.env.DARAZ_ACCESS_TOKEN ||
      process.env.LAZADA_ACCESS_TOKEN ||
      process.env.TIKTOK_ACCESS_TOKEN,
  )
}

async function main() {
  const shopId =
    arg("shopId") ||
    process.env.MARKETPLACE_SYNC_SHOP_ID ||
    "b5ofcwj2mzauov29y08m0q99"
  const platformRaw = arg("platform") || process.env.MARKETPLACE_SYNC_PLATFORM || "daraz"
  const region = arg("region") || process.env.MARKETPLACE_SYNC_REGION
  const resources = arg("resources") || "all"
  const live = hasFlag("live") || process.env.MARKETPLACE_SYNC_LIVE === "1"
  const persist = hasFlag("persist") || process.env.MARKETPLACE_SYNC_PERSIST === "1"

  if (!isMarketplacePlatform(platformRaw)) {
    console.error(`Unsupported platform: ${platformRaw}`)
    process.exit(1)
  }

  const hooks: SyncPersistHooks = {
    writeLog: (row: SyncLogRow) => {
      console.log("[integration_logs]", JSON.stringify(row))
    },
    patchState: (patch: SyncStatePatch) => {
      console.log("[integration_states]", JSON.stringify(patch))
    },
    upsertProducts: (rows) => {
      console.log(`[stub upsert products] count=${rows.length}`)
    },
    upsertOrders: (rows) => {
      console.log(`[stub upsert orders] count=${rows.length}`)
    },
    upsertBrands: (rows) => {
      console.log(`[stub upsert brands] count=${rows.length}`)
    },
    upsertCategories: (rows) => {
      console.log(`[stub upsert categories] count=${rows.length}`)
    },
  }

  let tokenProvider
  let credentialShopCipher: string | undefined
  let appKey = ""
  let appSecret = ""
  if (live) {
    const { resolveShopAppCredential } = await import("@/lib/marketplace/app-credentials")
    const appCredential = await resolveShopAppCredential({
      shopId,
      platform: platformRaw,
      region,
    })
    appKey = appCredential?.appKey ?? ""
    appSecret = appCredential?.appSecret ?? ""
    if (!appKey || !appSecret) {
      console.error(
        `未找到 ${platformRaw} 的平台应用配置，请先在控制台「设置 → 平台应用配置」完成配置`,
      )
      process.exit(1)
    }

    if (!hasEnvAccessToken()) {
      const { createShopTokenProvider, loadCredentialMeta } = await import(
        "@/lib/marketplace/token-provider"
      )
      tokenProvider = createShopTokenProvider({
        shopId,
        platform: platformRaw,
        region,
        appKey,
        appSecret,
      })
      const meta = await loadCredentialMeta(shopId)
      credentialShopCipher =
        typeof meta?.shopCipher === "string" ? meta.shopCipher : undefined
    }
  }

  const result = await runMarketplaceSync({
    shopId,
    platform: platformRaw,
    region,
    resources,
    live,
    persist,
    persistHooks: hooks,
    tokenProvider,
    appKey,
    appSecret,
    shopCipher: credentialShopCipher,
  })

  console.log(
    JSON.stringify(
      {
        shopId: result.shopId,
        platform: result.platform,
        live: result.live,
        persist: result.persist,
        health: result.statePatch.health,
        results: result.results.map((r) => ({
          resource: r.resource,
          ok: r.ok,
          dryRun: r.dryRun,
          count: r.count,
          error: r.error,
        })),
      },
      null,
      2,
    ),
  )

  if (result.statePatch.health === "error") process.exit(2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
