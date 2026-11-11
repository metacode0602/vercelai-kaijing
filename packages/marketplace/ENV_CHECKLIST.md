# Marketplace `.env` checklist

Platform App Key / App Secret are tenant-owned and stored in `marketplace_app_credentials`. Configure them in the console at `/settings/marketplace-apps`. See `apps/shop/content/guide/marketplace-oauth-admin-setup.md` for the full runbook.

## Required for OAuth Connect

| Variable | Notes |
|----------|--------|
| `MARKETPLACE_CREDENTIALS_KEY` | 64 hex chars recommended; encrypts tenant app secrets and `integration_credentials.payload_encrypted`. Must match between `apps/shop` and `apps/api`. |
| `BETTER_AUTH_URL` | External base URL; callback becomes `{BETTER_AUTH_URL}/api/marketplace/{platform}/oauth/callback` |
| `NEXT_PUBLIC_URL` | Fallback base URL when `BETTER_AUTH_URL` is unset |

No `*_APP_KEY` / `*_APP_SECRET` / `*_CALLBACK_URL` environment variables are read anymore.

## Tenant app setup

1. Open `/settings/marketplace-apps` as `tenant_owner`.
2. Add the platform + region (e.g. `daraz` + `LK`; use “全部站点” for a `region=''` fallback).
3. Paste the App Key / App Secret from the partner console.
4. Register the displayed callback URL exactly in the partner console.
5. Authorize a shop from `/settings/shops`.

Optional per-app callback: `/api/marketplace/{platform}/oauth/callback/{callbackKey}`.

## Local OAuth smoke

1. Seed shops: `packages/db/seeds/commerce-daraz-lk-shop.sql` (replace `:organization_id`).
   Canonical Daraz LK shop id: `b5ofcwj2mzauov29y08m0q99`.
2. Add `daraz` + `LK` credentials in `/settings/marketplace-apps`.
3. Visit `/settings/shops/b5ofcwj2mzauov29y08m0q99` → 重连 OAuth.
4. After callback, tokens land in `integration_credentials` (AES-GCM); app verification lands in `marketplace_app_credentials.last_verified_at`.

## Sync worker (optional)

```bash
pnpm --filter shop sync:marketplace -- --shopId=b5ofcwj2mzauov29y08m0q99 --platform=daraz
pnpm --filter shop sync:marketplace -- --shopId=… --platform=daraz --live --resources=products,orders
```

Dry-run is default (no token). Live resolves the tenant's `marketplace_app_credentials` by shop → organization; `MARKETPLACE_SYNC_ACCESS_TOKEN` or a platform `*_ACCESS_TOKEN` remains optional for manual CLI token debugging.


## Shop → API internal sync (read path)

| Variable | Notes |
|----------|--------|
| `MARKETPLACE_API_BASE_URL` | Base URL of `apps/api` (e.g. `http://127.0.0.1:8080`) |
| `INTERNAL_SYNC_API_KEY` | Same key as api; min 16 chars; required for console triggers |
| `MARKETPLACE_SYNC_LISTINGS_CRON` / `MARKETPLACE_SYNC_SETTLEMENTS_CRON` | Optional in-app cron expressions |
