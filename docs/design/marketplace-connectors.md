# Marketplace connectors (`@workspace/marketplace`)

**Package:** `packages/marketplace`  
**Platforms (this PR):** Daraz, Lazada, TikTok Shop  
**Out of scope:** tRPC, OpenAPI/MCP, Shopee, scheduling ownership (cron lives in `apps/api`)
**In scope now:** sync worker skeleton (`packages/marketplace/src/workers/sync.ts` + `apps/shop` CLI), review/trace adapters, LAZOP push signature, DB credential store

## Goals

- Shared `MarketplaceConnector` for shop / brand / category / product / listing / order / logistics
- LAZOP signing for Daraz + Lazada; TikTok Partner Center signing
- OAuth authorize → code exchange → refresh; tokens encrypted into `integration_credentials`
- Region maps with **Daraz LK** as default emphasis; other regions via config
- Map platform payloads → lean domain types aligned with commerce tables (`raw` / `payload` jsonb)

## Layout

```
packages/marketplace/src/
  signing/{lazop,tiktok}.ts
  clients/{lazop-http,tiktok-http}.ts
  regions/endpoints.ts
  oauth/{lazop,tiktok}.ts
  adapters/{daraz,lazada,tiktok,lazop-base,factory}.ts
  domain/types.ts
  crypto/credentials.ts
```

## App credentials

Platform App Key / App Secret are **tenant-owned**, stored in `marketplace_app_credentials` per `organization + platform + region` (`region=''` = fallback). See [marketplace-multitenant-app-credentials.md](marketplace-multitenant-app-credentials.md).

| Var | Purpose |
|-----|---------|
| `MARKETPLACE_CREDENTIALS_KEY` | AES-256-GCM key (32-byte hex or any utf8 hashed) for app secrets and OAuth tokens; falls back to `BETTER_AUTH_SECRET` |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_URL` | External base URL used to build callback URLs |

Default callback (shop app): `{BETTER_AUTH_URL|/NEXT_PUBLIC_URL}/api/marketplace/{platform}/oauth/callback`  
Optional per-app callback: `…/{callbackKey}`

## OAuth flow (apps/shop)

1. `GET /api/marketplace/oauth/authorize?platform=daraz&shopId=…&locale=zh`  
   → resolve tenant app credentials, CSRF state (includes `appCredentialId`), redirect to platform authorize URL
2. Platform redirects to `/api/marketplace/{platform}/oauth/callback?code=…&state=…`  
   → verify state, load tenant credentials, exchange token, encrypt payload, upsert `integration_credentials`, set shop `status=active`, redirect to `/{locale}/settings/shops/{id}`

## DB enrichment

Structured columns for list/filter (brand, category path, stock, logistics, fulfillment, tracking, …) + jsonb blobs for platform payloads. See `crossborder-database-design.md`（historical migration `0007_commerce_platform_enrichment.sql`；2026-11-08 regenerated into `0000`/`0001`/`0002_glamorous_bruce_banner.sql`）。

## Sync worker

```bash
pnpm --filter shop sync:marketplace -- --shopId=b5ofcwj2mzauov29y08m0q99 --platform=daraz
# live + optional persist stubs:
pnpm --filter shop sync:marketplace -- --shopId=… --platform=daraz --live --persist --resources=products,orders
```

Default is dry-run/mock (no token). Env checklist: `packages/marketplace/ENV_CHECKLIST.md`.
