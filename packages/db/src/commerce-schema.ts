/**
 * 跨境运营域表结构
 * @see apps/web/content/design/crossborder-database-design.md
 */

import { createId } from "@paralleldrive/cuid2"
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
import { organization } from "./auth-schema"

// ---------------------------------------------------------------------------
// 枚举常量（运行时校验用；列类型为 varchar）
// ---------------------------------------------------------------------------

export const commercePlatforms = ["daraz", "lazada", "shopee", "tiktok_shop"] as const
export type CommercePlatform = (typeof commercePlatforms)[number]

export const shopStatuses = ["draft", "connecting", "active", "error", "disabled"] as const
export type ShopStatus = (typeof shopStatuses)[number]

export const syncStatuses = ["idle", "running", "success", "error"] as const
export type SyncStatus = (typeof syncStatuses)[number]

export const listingStatuses = [
  "draft",
  "pending_review",
  "submitted",
  "live",
  "failed",
  "archived",
] as const
export type ListingStatus = (typeof listingStatuses)[number]

export const orderStatuses = [
  "created",
  "paid",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "unknown",
] as const
export type OrderStatus = (typeof orderStatuses)[number]

export const pendingActionStatuses = [
  "pending",
  "confirmed",
  "executing",
  "failed",
  "cancelled",
  "expired",
] as const
export type PendingActionStatus = (typeof pendingActionStatuses)[number]

export const pendingActionKinds = [
  "sourcing_upsert",
  "listing_submit",
  "price_change",
  "inventory_push",
  "settlement_post",
] as const
export type PendingActionKind = (typeof pendingActionKinds)[number]

export const entityTypes = ["product", "variant", "listing", "order", "shop"] as const
export type EntityType = (typeof entityTypes)[number]

export const productSources = ["manual", "sourcing", "import"] as const
export type ProductSource = (typeof productSources)[number]

export const costComponentKinds = ["purchase", "freight", "duty", "other"] as const
export type CostComponentKind = (typeof costComponentKinds)[number]

export const stockAlertStatuses = ["open", "acked"] as const
export type StockAlertStatus = (typeof stockAlertStatuses)[number]

export const productCandidateStatuses = ["new", "accepted", "rejected"] as const
export type ProductCandidateStatus = (typeof productCandidateStatuses)[number]

export const integrationLogDirections = ["in", "out"] as const
export type IntegrationLogDirection = (typeof integrationLogDirections)[number]

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

// ---------------------------------------------------------------------------
// shops
// ---------------------------------------------------------------------------

export const shops = pgTable(
  "shops",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    platform: varchar("platform", { length: 32 }).notNull(),
    name: text("name").notNull(),
    externalShopId: text("external_shop_id"),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    region: varchar("region", { length: 16 }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    /** IANA timezone for schedule / display (e.g. Asia/Colombo). */
    timezone: varchar("timezone", { length: 64 }),
    /** Seller display name on the marketplace (may differ from local name). */
    sellerName: text("seller_name"),
    /** Marketplace country / site code (lk, my, sg, …). */
    marketplaceCountry: varchar("marketplace_country", { length: 16 }),
    /** Access-token expiry mirrored from credentials for list UI. */
    authExpiresAt: timestamp("auth_expires_at", { withTimezone: true }),
    /** Last successful multi-resource sync (any of products/orders/…). */
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Platform-specific extras (seller flags, cipher hints, etc.). */
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("shops_org_idx").on(t.organizationId),
    uniqueIndex("shops_org_platform_ext_uidx").on(
      t.organizationId,
      t.platform,
      t.externalShopId,
    ),
  ],
)

// ---------------------------------------------------------------------------
// integration_credentials / integration_states / integration_logs
// ---------------------------------------------------------------------------

export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    kind: varchar("kind", { length: 32 }).notNull(),
    payloadEncrypted: text("payload_encrypted").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("integration_credentials_org_idx").on(t.organizationId),
    index("integration_credentials_shop_idx").on(t.shopId),
  ],
)

export const integrationStates = pgTable(
  "integration_states",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    ordersCursor: text("orders_cursor"),
    inventoryCursor: text("inventory_cursor"),
    productsCursor: text("products_cursor"),
    listingsCursor: text("listings_cursor"),
    lastOrdersSyncAt: timestamp("last_orders_sync_at", { withTimezone: true }),
    lastInventorySyncAt: timestamp("last_inventory_sync_at", { withTimezone: true }),
    lastProductsSyncAt: timestamp("last_products_sync_at", { withTimezone: true }),
    lastListingsSyncAt: timestamp("last_listings_sync_at", { withTimezone: true }),
    health: varchar("health", { length: 32 }).notNull().default("idle"),
    lastError: text("last_error"),
  },
  (t) => [uniqueIndex("integration_states_shop_uidx").on(t.shopId)],
)

export const integrationLogs = pgTable(
  "integration_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    direction: varchar("direction", { length: 8 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    requestId: text("request_id"),
    status: varchar("status", { length: 32 }).notNull(),
    message: text("message"),
    payloadSummary: text("payload_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("integration_logs_shop_created_idx").on(t.shopId, t.createdAt)],
)

// ---------------------------------------------------------------------------
// products / product_variants
// ---------------------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    title: text("title").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    brand: text("brand"),
    categoryHint: text("category_hint"),
    /** Image URLs for list/detail thumbs [{url, sort?}]. */
    images: jsonb("images").$type<Array<Record<string, unknown>>>().default([]),
    weightGrams: integer("weight_grams"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    /** Description + import extras (volatile copy in jsonb). */
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("products_org_idx").on(t.organizationId)],
)

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    sku: varchar("sku", { length: 128 }).notNull(),
    barcode: varchar("barcode", { length: 128 }),
    attrs: jsonb("attrs").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("product_variants_org_idx").on(t.organizationId),
    index("product_variants_product_idx").on(t.productId),
    uniqueIndex("product_variants_org_sku_uidx").on(t.organizationId, t.sku),
  ],
)

// ---------------------------------------------------------------------------
// listings
// ---------------------------------------------------------------------------

export const listings = pgTable(
  "listings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    variantId: text("variant_id").references(() => productVariants.id),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    /** List-display title; long copy lives in payload. */
    title: text("title"),
    /** Platform item / product id (Daraz item_id, Lazada item_id, TikTok product_id). */
    externalItemId: text("external_item_id"),
    brandExternalId: text("brand_external_id"),
    brandName: text("brand_name"),
    categoryExternalId: text("category_external_id"),
    /** Human-readable category breadcrumb for list UI. */
    categoryPath: text("category_path"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().default({}),
    priceAmount: numeric("price_amount", { precision: 18, scale: 4 }),
    priceCurrency: varchar("price_currency", { length: 3 }),
    stockOnHand: integer("stock_on_hand"),
    warehouseCode: varchar("warehouse_code", { length: 64 }),
    logisticsChannel: varchar("logistics_channel", { length: 64 }),
    /** Platform publish / sale state (ACTIVE, INACTIVE, PENDING, …). */
    publishState: varchar("publish_state", { length: 32 }),
    lastError: text("last_error"),
    /** Platform create/update payload + description + images. */
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    liveAt: timestamp("live_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("listings_org_idx").on(t.organizationId),
    index("listings_shop_idx").on(t.shopId),
    index("listings_product_idx").on(t.productId),
    uniqueIndex("listings_shop_ext_item_uidx").on(t.shopId, t.externalItemId),
  ],
)

// ---------------------------------------------------------------------------
// external_id_mappings
// ---------------------------------------------------------------------------

export const externalIdMappings = pgTable(
  "external_id_mappings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    internalId: text("internal_id").notNull(),
    externalId: text("external_id").notNull(),
    syncStatus: varchar("sync_status", { length: 32 }).notNull().default("idle"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    index("external_id_mappings_org_idx").on(t.organizationId),
    uniqueIndex("external_id_mappings_shop_ext_uidx").on(
      t.shopId,
      t.entityType,
      t.externalId,
    ),
    uniqueIndex("external_id_mappings_shop_int_uidx").on(
      t.shopId,
      t.entityType,
      t.internalId,
    ),
  ],
)

// ---------------------------------------------------------------------------
// orders / order_lines
// ---------------------------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    externalOrderId: text("external_order_id").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("unknown"),
    /** Raw platform status string before mapping (e.g. pending, READY_TO_SHIP). */
    platformStatus: varchar("platform_status", { length: 64 }),
    fulfillmentStatus: varchar("fulfillment_status", { length: 32 }),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    totalAmount: numeric("total_amount", { precision: 18, scale: 4 }),
    buyerRegion: varchar("buyer_region", { length: 64 }),
    paymentMethod: varchar("payment_method", { length: 64 }),
    shippingProvider: varchar("shipping_provider", { length: 128 }),
    trackingNumber: varchar("tracking_number", { length: 128 }),
    packageId: varchar("package_id", { length: 128 }),
    /** Buyer mask, shipping amount, city, timeline extras. */
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("orders_org_idx").on(t.organizationId),
    index("orders_shop_idx").on(t.shopId),
    uniqueIndex("orders_shop_ext_uidx").on(t.shopId, t.externalOrderId),
  ],
)

export const orderLines = pgTable(
  "order_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    externalLineId: text("external_line_id"),
    sku: varchar("sku", { length: 128 }),
    title: text("title"),
    qty: integer("qty").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 18, scale: 4 }),
    variantId: text("variant_id").references(() => productVariants.id),
    fulfillmentStatus: varchar("fulfillment_status", { length: 32 }),
    packageId: varchar("package_id", { length: 128 }),
    trackingNumber: varchar("tracking_number", { length: 128 }),
    shippingProvider: varchar("shipping_provider", { length: 128 }),
  },
  (t) => [
    index("order_lines_order_idx").on(t.orderId),
    index("order_lines_org_idx").on(t.organizationId),
  ],
)

// ---------------------------------------------------------------------------
// inventory_balances / stock_alerts
// ---------------------------------------------------------------------------

export const inventoryBalances = pgTable(
  "inventory_balances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("inventory_balances_org_idx").on(t.organizationId),
    uniqueIndex("inventory_balances_shop_variant_uidx").on(t.shopId, t.variantId),
  ],
)

export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    threshold: integer("threshold").notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("open"),
  },
  (t) => [
    index("stock_alerts_org_idx").on(t.organizationId),
    index("stock_alerts_shop_idx").on(t.shopId),
  ],
)

// ---------------------------------------------------------------------------
// cost_components
// ---------------------------------------------------------------------------

export const costComponents = pgTable(
  "cost_components",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    component: varchar("component", { length: 32 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    note: text("note"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("cost_components_org_idx").on(t.organizationId),
    index("cost_components_variant_idx").on(t.variantId),
  ],
)

// ---------------------------------------------------------------------------
// settlements / settlement_lines
// ---------------------------------------------------------------------------

export const settlements = pgTable(
  "settlements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    externalSettlementId: text("external_settlement_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("settlements_org_idx").on(t.organizationId),
    uniqueIndex("settlements_shop_ext_uidx").on(t.shopId, t.externalSettlementId),
  ],
)

export const settlementLines = pgTable(
  "settlement_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => settlements.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    orderId: text("order_id").references(() => orders.id),
    variantId: text("variant_id").references(() => productVariants.id),
    amount: numeric("amount", { precision: 18, scale: 4 }),
    currency: varchar("currency", { length: 3 }),
    note: text("note"),
  },
  (t) => [
    index("settlement_lines_settlement_idx").on(t.settlementId),
    index("settlement_lines_org_idx").on(t.organizationId),
  ],
)

// ---------------------------------------------------------------------------
// pending_actions
// ---------------------------------------------------------------------------

export const pendingActions = pgTable(
  "pending_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id").references(() => shops.id),
    kind: varchar("kind", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    fieldDiff: jsonb("field_diff").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: text("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [
    index("pending_actions_org_idx").on(t.organizationId),
    index("pending_actions_status_idx").on(t.organizationId, t.status),
    uniqueIndex("pending_actions_org_idempotency_uidx").on(
      t.organizationId,
      t.idempotencyKey,
    ),
  ],
)

// ---------------------------------------------------------------------------
// product_candidates
// ---------------------------------------------------------------------------

export const productCandidates = pgTable(
  "product_candidates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    title: text("title").notNull(),
    url: text("url"),
    categoryHint: text("category_hint"),
    score: numeric("score", { precision: 8, scale: 4 }),
    rationale: jsonb("rationale").$type<Record<string, unknown>>().default({}),
    status: varchar("status", { length: 16 }).notNull().default("new"),
    pendingActionId: text("pending_action_id").references(() => pendingActions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("product_candidates_org_idx").on(t.organizationId),
    index("product_candidates_status_idx").on(t.organizationId, t.status),
  ],
)


// ---------------------------------------------------------------------------
// platform_brands / platform_categories (per-shop cache for console filters)
// ---------------------------------------------------------------------------

export const platformBrands = pgTable(
  "platform_brands",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("platform_brands_org_idx").on(t.organizationId),
    uniqueIndex("platform_brands_shop_ext_uidx").on(t.shopId, t.externalId),
  ],
)

export const platformCategories = pgTable(
  "platform_categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id")
      .notNull()
      .references(() => shops.id),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    parentExternalId: text("parent_external_id"),
    path: text("path"),
    leaf: varchar("leaf", { length: 8 }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("platform_categories_org_idx").on(t.organizationId),
    uniqueIndex("platform_categories_shop_ext_uidx").on(t.shopId, t.externalId),
  ],
)

export type Shop = typeof shops.$inferSelect
export type Product = typeof products.$inferSelect
export type ProductVariant = typeof productVariants.$inferSelect
export type Listing = typeof listings.$inferSelect
export type Order = typeof orders.$inferSelect
export type OrderLine = typeof orderLines.$inferSelect
export type PlatformBrand = typeof platformBrands.$inferSelect
export type PlatformCategory = typeof platformCategories.$inferSelect
export type PendingAction = typeof pendingActions.$inferSelect
export type ProductCandidate = typeof productCandidates.$inferSelect
