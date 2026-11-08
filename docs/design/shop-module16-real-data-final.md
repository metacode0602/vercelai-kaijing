# Module 16 — console real-data final

- Branch: `feat/shop-console-real-data-final`（基线 `feat/shop-console-ops-cleanup` / PR #52，不含 #43）
- Migration: `0020_commerce_carton_specs`（历史编号；2026-11-08 重生成后箱规基表并入 `0000_flashy_silver_samurai.sql`）
- Seed: `pnpm --filter @workspace/db db:seed:commerce-carton-specs`
- Gap: `docs/design/shop-console-openapi-gap.md`
