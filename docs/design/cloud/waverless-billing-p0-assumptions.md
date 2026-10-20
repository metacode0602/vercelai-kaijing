# Waverless P0 Billing Assumptions (apps/gpus)

> Slice for Draft PR #36 follow-up. Product decision #8: dual ledgers + legacy stop/cron bypass.
> Full design: [waverless-provider-cost-and-customer-billing.md](./waverless-provider-cost-and-customer-billing.md)

## In scope (this slice)

1. Usage ingest from waverless worker list / optional push API
2. Separate ~5 minute settlement cron (`/api/cron/waverless-billing`)
3. Customer revenue ledger + wallet `consumeReserved` on settle/stop
4. Supplier (Gongji) provisional cost ledger (distinct amount/rate)
5. Keep bypass of legacy `billServerlessStop` / `/api/cron/billing` for `orchestratorType=waverless`
6. **Create-time immutable price/contract snapshot** (sell + Gongji cost frozen at create)
7. **Minimal visibility**: tRPC `serverlessBillingVisibility` + light「计费」tab on waverless endpoint detail

## Assumptions (explicit)

| Topic | P0 choice | Why / follow-up |
|---|---|---|
| Usage source | Poll `listWaverlessWorkers` per endpoint; also accept push at `/api/internal/waverless/usage` | Waverless usage outbox not frozen yet |
| Customer billable start | Worker `readyAt`, else `createdAt` only if status ∈ {READY, BUSY, DRAINING} | Queuing / STARTING not charged to customer |
| Customer billable end | `terminatedAt` or window end (whichever earlier) | Tail settle on stop uses `now` |
| Meter / unit | `gpu_runtime` / `gpu_second` = GPU count × wall seconds in overlap | Matches design §3 |
| GPU count | From `compute_base.resourceSpec.gpuCount` (default 1); not per-worker yet | Worker DTO may lack gpuCount |
| Window size | Fixed UTC 5-minute buckets `[floor(t/5m), +5m)` | Settlement frequency ≠ minimum charge |
| Rounding | Amount = `pricePerHour × gpuSeconds / 3600`, round half-up to 4 dp | No pad-to-5-minutes; no `min(total, 0.01)` defect |
| Sell price | **Frozen at create** into `compute_billing_contract_snapshot.customer_sell_price_per_gpu_hour` (from `platform_card_price_record`). Settle/stop **must** use snapshot. Live price lookup is forbidden on settle. | Catalog price changes must not rewrite historical endpoints |
| Gongji cost rate | **Frozen at create** from env `WAVERLESS_GONGJI_COST_PER_GPU_HOUR` into snapshot. Settle/stop **must not** re-read live env. If unset at create → rate 0 + metadata `supplierRateMissing` | Must never use customer sell price as cost; env drift after create ignored |
| Missing snapshot | Settle/stop **refuse** with `billing_contract_snapshot_missing` (no wallet consume at live rates). Waverless create **requires** sellPrice > 0 | Harden commercial path; pre-snapshot endpoints need backfill/recreate |
| Provider vs customer interval | P0 uses the same Ready→stop interval for both ledgers | Provider pre-Ready cost → platform variance later |
| Wallet idempotency | Window unique key + status gate before `consumeReserved` | `consumeReserved` itself has no idempotencyKey yet |
| Insufficient funds | Mark window `failed`, set compute status `error`; usage/cost rows still kept | Drain/stop automation follow-up |
| SkyPilot path | Unchanged; legacy cron still skips waverless rows | Decision #8 bypass |
| Visibility | Org-scoped tRPC; windows + customer ledger + provisional supplier cost | Supplier cost is provisional COGS estimate, not invoice |

## Tables

- `compute_usage_event` — append-only usage facts
- `compute_billing_window` — 5m settle windows
- `compute_customer_ledger_entry` — customer revenue lines
- `compute_supplier_cost_entry` — Gongji provisional cost lines
- `compute_billing_contract_snapshot` — **1:1 create-time immutable sell + cost rates per endpoint**

## Out of scope

Image preheat meters, multi-pool, Autoscaler internals, supplier invoice import/AP, duration pack / capacity reservation, large UI redesign, backfill tool for pre-snapshot endpoints.
