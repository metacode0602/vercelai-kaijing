# Marketplace connectors (`@workspace/marketplace`)

**Package:** `packages/marketplace`  
**Platforms (this PR):** Daraz, Lazada, TikTok Shop  
**Out of scope:** tRPC, OpenAPI/MCP, Shopee, production cron
**In scope now:** sync worker skeleton (`packages/marketplace/src/workers/sync.ts` + `apps/shop` CLI)

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

## Env

| Var | Purpose |
|-----|---------|
| `DARAZ_APP_KEY` / `DARAZ_APP_SECRET` / `DARAZ_CALLBACK_URL` | Daraz app |
| `LAZADA_APP_KEY` / `LAZADA_APP_SECRET` / `LAZADA_CALLBACK_URL` | Lazada app |
| `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET` / `TIKTOK_CALLBACK_URL` | TikTok Shop app |
| `MARKETPLACE_CREDENTIALS_KEY` | AES-256-GCM key (32-byte hex or any utf8 hashed); falls back to `BETTER_AUTH_SECRET` |

Default callback (shop app): `{BETTER_AUTH_URL|/NEXT_PUBLIC_URL}/api/marketplace/oauth/callback`

## OAuth flow (apps/shop)

1. `GET /api/marketplace/oauth/authorize?platform=daraz&shopId=…&locale=zh`  
   → CSRF state cookie + redirect to platform authorize URL
2. Platform redirects to `/api/marketplace/oauth/callback?code=…&state=…`  
   → exchange token, encrypt payload, upsert `integration_credentials`, set shop `status=active`, redirect to `/{locale}/console/settings/shops/{id}`

## DB enrichment

Structured columns for list/filter (brand, category path, stock, logistics, fulfillment, tracking, …) + jsonb blobs for platform payloads. See `crossborder-database-design.md` and migration `0007_commerce_platform_enrichment.sql`.

## Sync worker

```bash
pnpm --filter shop sync:marketplace -- --shopId=b5ofcwj2mzauov29y08m0q99 --platform=daraz
# live + optional persist stubs:
pnpm --filter shop sync:marketplace -- --shopId=… --platform=daraz --live --persist --resources=products,orders
```

Default is dry-run/mock (no token). Env checklist: `packages/marketplace/ENV_CHECKLIST.md`.
