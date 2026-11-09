# `@workspace/marketplace`

Cross-border marketplace connectors for **Daraz**, **Lazada** (shared LAZOP protocol), and **TikTok Shop**.

## Scope

- Request signing (LAZOP HMAC-SHA256, TikTok Partner Center HMAC-SHA256)
- Region endpoint maps (Daraz defaults emphasize **LK**)
- OAuth authorize → token → refresh
- Domain adapters: shop, brand, category, product, listing, order, logistics, reviews, order trace
- Lean domain types aligned with `packages/db` commerce tables

Out of scope: tRPC, OpenAPI/MCP, Shopee, scheduling ownership (cron lives in `apps/api`).
Includes: sync worker skeleton (`src/workers/sync.ts`), LAZOP push signature, DB credential store.

## Env

See root `.env.example` and [`ENV_CHECKLIST.md`](./ENV_CHECKLIST.md)
(`DARAZ_*`, `LAZADA_*`, `TIKTOK_*`, `MARKETPLACE_CREDENTIALS_KEY`, sync tokens).

## Sync worker

```bash
# from monorepo root — dry-run (default)
pnpm --filter shop sync:marketplace -- --shopId=b5ofcwj2mzauov29y08m0q99 --platform=daraz

# or via tsx directly
pnpm --filter shop exec tsx src/workers/marketplace-sync.ts --shopId=… --platform=lazada --resources=brands,categories
```

Core API: `runMarketplaceSync({ shopId, platform, live?, persist?, resources?, … })`.
