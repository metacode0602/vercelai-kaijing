# Marketplace `.env` checklist

Use with real partner-center app keys. `apps/shop` loads `apps/shop/.env*` or process env during dev — the monorepo root `.env` is **not** loaded automatically. See `apps/shop/content/guide/marketplace-oauth-admin-setup.md` for the full admin runbook.

## Required for OAuth Connect

| Variable | Notes |
|----------|--------|
| `DARAZ_APP_KEY` / `DARAZ_APP_SECRET` | open.daraz.com |
| `DARAZ_CALLBACK_URL` | Must **exactly** match Daraz app callback; default `{BETTER_AUTH_URL}/api/marketplace/oauth/callback` |
| `DARAZ_DEFAULT_REGION` | Prefer `lk` |
| `LAZADA_APP_KEY` / `LAZADA_APP_SECRET` | open.lazada.com |
| `LAZADA_CALLBACK_URL` | Must match Lazada app callback |
| `LAZADA_DEFAULT_REGION` | e.g. `sg` / `my` |
| `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET` | TikTok Partner Center |
| `TIKTOK_CALLBACK_URL` | Must match Partner Center redirect |
| `TIKTOK_DEFAULT_REGION` | `global` (or market code) |
| `MARKETPLACE_CREDENTIALS_KEY` | 64 hex chars recommended; encrypts `integration_credentials.payload_encrypted` |

## Local OAuth smoke

1. Register callback URLs in each partner console (same host/path as `*_CALLBACK_URL`).
2. Seed shops: `packages/db/seeds/commerce-daraz-lk-shop.sql` (replace `:organization_id`).
   Canonical Daraz LK shop id: `b5ofcwj2mzauov29y08m0q99`.
3. Visit `/console/settings/shops/b5ofcwj2mzauov29y08m0q99` → 重连 OAuth.
4. After callback, tokens land in `integration_credentials` (AES-GCM).

## Sync worker (optional)

```bash
pnpm --filter shop sync:marketplace -- --shopId=b5ofcwj2mzauov29y08m0q99 --platform=daraz
pnpm --filter shop sync:marketplace -- --shopId=… --platform=daraz --live --resources=products,orders
```

Dry-run is default (no token). Live needs `MARKETPLACE_SYNC_ACCESS_TOKEN` or platform `*_ACCESS_TOKEN` plus app key/secret.


## Shop → API internal sync (read path)

| Variable | Notes |
|----------|--------|
| `MARKETPLACE_API_BASE_URL` | Base URL of `apps/api` (e.g. `http://127.0.0.1:8080`) |
| `INTERNAL_SYNC_API_KEY` | Same key as api; min 16 chars; required for console triggers |
| `MARKETPLACE_SYNC_LISTINGS_CRON` / `MARKETPLACE_SYNC_SETTLEMENTS_CRON` | Optional in-app cron expressions |
