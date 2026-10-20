/**
 * Waverless P0 dual-ledger billing tables (customer revenue ≠ supplier cost).
 *
 * Design: docs/design/cloud/waverless-provider-cost-and-customer-billing.md
 * Product decision #8: dual ledgers + bypass legacy billServerlessStop/cron.
 * Assumptions: docs/design/cloud/waverless-billing-p0-assumptions.md
 *
 * These are MVP tables for Gongji/CN serverless via orchestratorType=waverless.
 * Full contract/pack/reservation schema remains a follow-up.
 */

import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import { computeBase } from "./compute-schema"

const money = (n: string) => numeric(n, { precision: 15, scale: 4 })
const qty = (n: string) => numeric(n, { precision: 20, scale: 6 })
const ts = (n: string) => timestamp(n, { withTimezone: true }).defaultNow().notNull()

/**
 * Append-only customer-billable usage facts (gpu_runtime / gpu_second).
 * Dedup key: (source, source_event_id, event_version).
 */
export const computeUsageEvent = pgTable(
  "compute_usage_event",
  {
    id: text("id").primaryKey(),
    source: varchar("source", { length: 32 }).notNull().default("waverless"),
    sourceEventId: varchar("source_event_id", { length: 256 }).notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    tenantId: text("tenant_id").notNull(),
    organizationId: text("organization_id").notNull(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    workerId: varchar("worker_id", { length: 256 }).notNull(),
    providerId: varchar("provider_id", { length: 64 }).notNull().default("gongji"),
    providerResourceId: varchar("provider_resource_id", { length: 256 }),
    logicalAzId: varchar("logical_az_id", { length: 128 }),
    meter: varchar("meter", { length: 64 }).notNull().default("gpu_runtime"),
    quantity: qty("quantity").notNull(),
    unit: varchar("unit", { length: 32 }).notNull().default("gpu_second"),
    gpuCount: integer("gpu_count").notNull().default(1),
    intervalStart: timestamp("interval_start", { withTimezone: true }).notNull(),
    intervalEnd: timestamp("interval_end", { withTimezone: true }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedAt: ts("ingested_at"),
    /** open | closed — open slices may be extended by later polls */
    sliceStatus: varchar("slice_status", { length: 16 }).notNull().default("closed"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    uniqueIndex("compute_usage_event_source_uk").on(
      table.source,
      table.sourceEventId,
      table.eventVersion,
    ),
    index("compute_usage_event_base_idx").on(table.computeBaseId),
    index("compute_usage_event_interval_idx").on(
      table.computeBaseId,
      table.intervalStart,
      table.intervalEnd,
    ),
    index("compute_usage_event_worker_idx").on(table.workerId),
  ],
)

/**
 * 5-minute settlement windows for waverless on_demand.
 * Unique (compute_base_id, window_start, window_end) → business idempotency.
 */
export const computeBillingWindow = pgTable(
  "compute_billing_window",
  {
    id: text("id").primaryKey(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    organizationId: text("organization_id").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    /** open | settling | settled | failed | skipped_zero */
    status: varchar("status", { length: 32 }).notNull().default("open"),
    customerQuantity: qty("customer_quantity").notNull().default("0"),
    customerAmount: money("customer_amount").notNull().default("0"),
    customerUnitPricePerGpuHour: money("customer_unit_price_per_gpu_hour"),
    customerPriceRecordId: text("customer_price_record_id"),
    supplierQuantity: qty("supplier_quantity").notNull().default("0"),
    supplierEstimatedAmount: money("supplier_estimated_amount").notNull().default("0"),
    supplierCostRatePerGpuHour: money("supplier_cost_rate_per_gpu_hour"),
    walletTxId: text("wallet_tx_id"),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("compute_billing_window_uk").on(
      table.computeBaseId,
      table.windowStart,
      table.windowEnd,
    ),
    uniqueIndex("compute_billing_window_idem_uk").on(table.idempotencyKey),
    index("compute_billing_window_status_idx").on(table.status),
    index("compute_billing_window_tenant_idx").on(table.tenantId),
  ],
)

/**
 * Customer revenue ledger lines (sell-side). Never reuse supplier cost amounts.
 */
export const computeCustomerLedgerEntry = pgTable(
  "compute_customer_ledger_entry",
  {
    id: text("id").primaryKey(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    organizationId: text("organization_id").notNull(),
    billingWindowId: text("billing_window_id").references(() => computeBillingWindow.id, {
      onDelete: "set null",
    }),
    /** usage_settle | tail_settle | adjustment */
    kind: varchar("kind", { length: 32 }).notNull(),
    meter: varchar("meter", { length: 64 }).notNull().default("gpu_runtime"),
    quantity: qty("quantity").notNull(),
    unit: varchar("unit", { length: 32 }).notNull().default("gpu_second"),
    unitPricePerGpuHour: money("unit_price_per_gpu_hour"),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    priceRecordId: text("price_record_id"),
    balanceTxId: text("balance_tx_id"),
    description: text("description"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("compute_customer_ledger_base_idx").on(table.computeBaseId),
    index("compute_customer_ledger_window_idx").on(table.billingWindowId),
    index("compute_customer_ledger_tenant_idx").on(table.tenantId),
  ],
)

/**
 * Supplier (Gongji) provisional cost accrual — distinct from customer charges.
 * Invoice matching / AP is a later supplier-domain task; P0 writes accrued estimates only.
 */
export const computeSupplierCostEntry = pgTable(
  "compute_supplier_cost_entry",
  {
    id: text("id").primaryKey(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id"),
    organizationId: text("organization_id"),
    billingWindowId: text("billing_window_id").references(() => computeBillingWindow.id, {
      onDelete: "set null",
    }),
    providerId: varchar("provider_id", { length: 64 }).notNull().default("gongji"),
    meter: varchar("meter", { length: 64 }).notNull().default("gpu_runtime"),
    quantity: qty("quantity").notNull(),
    unit: varchar("unit", { length: 32 }).notNull().default("gpu_second"),
    costRatePerGpuHour: money("cost_rate_per_gpu_hour"),
    estimatedAmount: money("estimated_amount").notNull(),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    /** accrued | statement_matched | variance | accepted */
    status: varchar("status", { length: 32 }).notNull().default("accrued"),
    description: text("description"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("compute_supplier_cost_base_idx").on(table.computeBaseId),
    index("compute_supplier_cost_window_idx").on(table.billingWindowId),
    index("compute_supplier_cost_provider_idx").on(table.providerId),
    index("compute_supplier_cost_status_idx").on(table.status),
  ],
)

export type ComputeUsageEvent = typeof computeUsageEvent.$inferSelect
export type ComputeBillingWindow = typeof computeBillingWindow.$inferSelect
export type ComputeCustomerLedgerEntry = typeof computeCustomerLedgerEntry.$inferSelect
export type ComputeSupplierCostEntry = typeof computeSupplierCostEntry.$inferSelect

/**
 * Create-time immutable billing contract for a waverless endpoint.
 * Sell price + Gongji cost rate are frozen here; settle/stop MUST use this row,
 * never live platform_card_price_record or WAVERLESS_GONGJI_COST_PER_GPU_HOUR.
 */
export const computeBillingContractSnapshot = pgTable(
  "compute_billing_contract_snapshot",
  {
    id: text("id").primaryKey(),
    computeBaseId: text("compute_base_id")
      .notNull()
      .references(() => computeBase.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull(),
    organizationId: text("organization_id").notNull(),
    /** on_demand | hour | daily | weekly | monthly */
    purchaseType: varchar("purchase_type", { length: 32 }).notNull().default("on_demand"),
    currency: varchar("currency", { length: 8 }).notNull().default("CNY"),
    /** Customer sell — locked at create */
    customerSellPricePerGpuHour: money("customer_sell_price_per_gpu_hour").notNull(),
    customerPriceRecordId: text("customer_price_record_id"),
    customerGpuCardTypeId: text("customer_gpu_card_type_id").notNull(),
    customerProductLine: varchar("customer_product_line", { length: 64 })
      .notNull()
      .default("serverless"),
    customerBillingUnit: varchar("customer_billing_unit", { length: 32 })
      .notNull()
      .default("hour"),
    /** Supplier (Gongji) provisional cost rate — locked from env at create */
    supplierProviderId: varchar("supplier_provider_id", { length: 64 })
      .notNull()
      .default("gongji"),
    supplierCostRatePerGpuHour: money("supplier_cost_rate_per_gpu_hour").notNull(),
    snappedAt: timestamp("snapped_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: ts("created_at"),
  },
  (table) => [
    uniqueIndex("compute_billing_contract_snapshot_base_uk").on(table.computeBaseId),
    index("compute_billing_contract_snapshot_tenant_idx").on(table.tenantId),
  ],
)

export type ComputeBillingContractSnapshot =
  typeof computeBillingContractSnapshot.$inferSelect
