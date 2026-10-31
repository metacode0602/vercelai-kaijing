/**
 * 跨境运营域表结构（对齐 haoshiyun 设计的精简 Drizzle 定义）
 *
 * 本文件是「可演进的中间态」：保留生产已用表、合并设计列、去掉死表，
 * 不一次落地 ~75 张生产表。决策矩阵见 docs/design/commerce-schema-cleanup.md。
 *
 * @see docs/design/haoshiyun-erp-database-schema.md
 * @see docs/design/commerce-schema-cleanup.md
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

export const fulfillmentModes = ["fbm", "fbp", "hybrid"] as const
export type FulfillmentMode = (typeof fulfillmentModes)[number]

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

/** Non-SKU entity types for external_id_mappings (SKU 走 seller_sku_mappings). */
export const entityTypes = ["product", "listing", "order", "shop", "package", "settlement"] as const
export type EntityType = (typeof entityTypes)[number]

export const productSources = ["manual", "sourcing", "import"] as const
export type ProductSource = (typeof productSources)[number]

/** 替代已删除的 cost_components；对齐设计 sku_costs / 费用拆分占位。 */
export const skuCostKinds = [
  "purchase",
  "freight",
  "duty",
  "platform_fee",
  "logistics",
  "ads",
  "jsb",
  "refund",
  "fx",
  "other",
] as const
export type SkuCostKind = (typeof skuCostKinds)[number]

export const stockAlertStatuses = ["open", "acked"] as const
export type StockAlertStatus = (typeof stockAlertStatuses)[number]

export const productCandidateStatuses = ["new", "accepted", "rejected"] as const
export type ProductCandidateStatus = (typeof productCandidateStatuses)[number]

export const integrationLogDirections = ["in", "out"] as const
export type IntegrationLogDirection = (typeof integrationLogDirections)[number]

export const sellerSkuMappingStatuses = ["active", "pending", "conflict", "disabled"] as const
export type SellerSkuMappingStatus = (typeof sellerSkuMappingStatuses)[number]

export const mappingExceptionStatuses = ["open", "resolved", "ignored"] as const
export type MappingExceptionStatus = (typeof mappingExceptionStatuses)[number]

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

// ---------------------------------------------------------------------------
// shops — KEEP + MERGE（sellerId / shopGroup / fulfillmentMode）
// externalShopId = 平台店铺 ID；sellerId = 内部卖家账号 / 平台 seller 标识（可不同）
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
    /** 平台店铺 ID（marketplace shop / store id）。 */
    externalShopId: text("external_shop_id"),
    /**
     * 卖家侧标识：内部 seller 账号或平台 seller_id（可与 externalShopId 不同）。
     * UED：sellerId；勿与 externalShopId 混用。
     */
    sellerId: text("seller_id"),
    /** 店铺分组（如 Lazada 五国组 / Daraz 组）。 */
    shopGroup: varchar("shop_group", { length: 64 }),
    /** 履约模式：fbm / fbp / hybrid。 */
    fulfillmentMode: varchar("fulfillment_mode", { length: 16 }).notNull().default("fbm"),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    region: varchar("region", { length: 16 }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    timezone: varchar("timezone", { length: 64 }),
    sellerName: text("seller_name"),
    marketplaceCountry: varchar("marketplace_country", { length: 16 }),
    authExpiresAt: timestamp("auth_expires_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
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
// integration_credentials / integration_states / integration_logs — KEEP
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
// products / product_variants — KEEP + MERGE（spuCode / skuCode / 尺寸 / status）
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
    /** 业务 SPU 码，如 HSY000001；UNIQUE(org, spu_code) 生产落地。 */
    spuCode: varchar("spu_code", { length: 32 }),
    title: text("title").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    brand: text("brand"),
    categoryHint: text("category_hint"),
    material: text("material"),
    style: text("style"),
    ownerUserId: text("owner_user_id"),
    images: jsonb("images").$type<Array<Record<string, unknown>>>().default([]),
    /** SPU 级默认尺寸（可被变体覆盖）。 */
    weightGrams: integer("weight_grams"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("products_org_idx").on(t.organizationId),
    uniqueIndex("products_org_spu_uidx").on(t.organizationId, t.spuCode),
  ],
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
    /**
     * 兼容旧列：展示/导入别名。新约束以 sku_code 为准（设计 §2.2）。
     * 迁移期与 skuCode 同值写入。
     */
    sku: varchar("sku", { length: 128 }).notNull(),
    /** 内部 SKU 码，如 HSY000001001。 */
    skuCode: varchar("sku_code", { length: 32 }),
    barcode: varchar("barcode", { length: 128 }),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    weightGrams: integer("weight_grams"),
    lengthMm: integer("length_mm"),
    widthMm: integer("width_mm"),
    heightMm: integer("height_mm"),
    attrs: jsonb("attrs").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("product_variants_org_idx").on(t.organizationId),
    index("product_variants_product_idx").on(t.productId),
    uniqueIndex("product_variants_org_sku_uidx").on(t.organizationId, t.sku),
    uniqueIndex("product_variants_org_sku_code_uidx").on(t.organizationId, t.skuCode),
  ],
)

// ---------------------------------------------------------------------------
// listings — KEEP + MERGE（listingTitle / primaryVariantId / marketplaceId）
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
    /** @deprecated 变体明细下沉到 seller_sku_mappings；保留兼容。 */
    variantId: text("variant_id").references(() => productVariants.id),
    primaryVariantId: text("primary_variant_id").references(() => productVariants.id),
    marketplaceId: text("marketplace_id"),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    title: text("title"),
    listingTitle: text("listing_title"),
    externalItemId: text("external_item_id"),
    brandExternalId: text("brand_external_id"),
    brandName: text("brand_name"),
    categoryExternalId: text("category_external_id"),
    categoryPath: text("category_path"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().default({}),
    priceAmount: numeric("price_amount", { precision: 18, scale: 4 }),
    priceCurrency: varchar("price_currency", { length: 3 }),
    stockOnHand: integer("stock_on_hand"),
    warehouseCode: varchar("warehouse_code", { length: 64 }),
    logisticsChannel: varchar("logistics_channel", { length: 64 }),
    publishState: varchar("publish_state", { length: 32 }),
    lastError: text("last_error"),
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
// seller_sku_mappings — ADD（F07 权威路径；替代用 external_id_mappings 存变体）
// platformSkuId 独立于 itemId / sellerSku / internalSku
// ---------------------------------------------------------------------------

export const sellerSkuMappings = pgTable(
  "seller_sku_mappings",
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
    listingId: text("listing_id").references(() => listings.id),
    /** 平台 Item / Product ID。 */
    itemId: text("item_id"),
    /**
     * 平台 SKU / 变体 ID（与 Seller SKU、Item ID、内部 SKU 独立）。
     * Lazada sku_id / Daraz sku_id 等。
     */
    platformSkuId: text("platform_sku_id"),
    sellerSku: varchar("seller_sku", { length: 128 }).notNull(),
    variantId: text("variant_id").references(() => productVariants.id),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("seller_sku_mappings_org_idx").on(t.organizationId),
    index("seller_sku_mappings_variant_idx").on(t.organizationId, t.variantId),
    uniqueIndex("seller_sku_mappings_shop_seller_sku_uidx").on(
      t.organizationId,
      t.shopId,
      t.sellerSku,
    ),
  ],
)

export const mappingExceptions = pgTable(
  "mapping_exceptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id").references(() => shops.id),
    sellerSku: varchar("seller_sku", { length: 128 }),
    platformSkuId: text("platform_sku_id"),
    externalOrderId: text("external_order_id"),
    reason: varchar("reason", { length: 64 }).notNull(),
    detail: text("detail"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("mapping_exceptions_org_status_idx").on(t.organizationId, t.status),
    index("mapping_exceptions_shop_idx").on(t.shopId),
  ],
)

// ---------------------------------------------------------------------------
// external_id_mappings — KEEP（收窄：非 SKU 实体；去掉 internal 唯一，允许 1:N）
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
    // 设计 §3.2 / §9：放宽 (shop, entity, internal) 唯一 → 普通索引，允许 1:N
    index("external_id_mappings_shop_int_idx").on(t.shopId, t.entityType, t.internalId),
  ],
)

// ---------------------------------------------------------------------------
// orders / order_lines — KEEP
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
    sellerSku: varchar("seller_sku", { length: 128 }),
    platformSkuId: text("platform_sku_id"),
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
// inventory_balances — KEEP + MERGE（仓+库位维度；WMS 不变量列）
// 设计：available = on_hand - reserved - qc_hold - damaged；在途/待入/清关中不计入可用
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
    /** 共享库存池后店铺维可空；迁移期保留可空 shop_id。 */
    shopId: text("shop_id").references(() => shops.id),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull().default("DEFAULT"),
    binCode: varchar("bin_code", { length: 64 }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    qcHold: integer("qc_hold").notNull().default(0),
    damaged: integer("damaged").notNull().default(0),
    /** 采购在途（已发未到仓）；不计入 available。 */
    inTransit: integer("in_transit").notNull().default(0),
    /** 待入 / 已到仓未上架；不计入 available。 */
    pendingInbound: integer("pending_inbound").notNull().default(0),
    /** 清关中（Daraz 海运柜次）；不计入 available。@see F22 */
    customsClearing: integer("customs_clearing").notNull().default(0),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("inventory_balances_org_idx").on(t.organizationId),
    uniqueIndex("inventory_balances_wh_bin_variant_uidx").on(
      t.organizationId,
      t.warehouseCode,
      t.binCode,
      t.variantId,
    ),
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
    shopId: text("shop_id").references(() => shops.id),
    warehouseCode: varchar("warehouse_code", { length: 64 }),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    threshold: integer("threshold").notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
    status: varchar("status", { length: 16 }).notNull().default("open"),
  },
  (t) => [
    index("stock_alerts_org_idx").on(t.organizationId),
    index("stock_alerts_variant_idx").on(t.variantId),
  ],
)

// ---------------------------------------------------------------------------
// sku_costs — ADD（替代已 DROP 的 cost_components；费用拆分占位）
// ---------------------------------------------------------------------------

export const skuCosts = pgTable(
  "sku_costs",
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
    kind: varchar("kind", { length: 32 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("CNY"),
    note: text("note"),
    /** 柜次成本版本号（F32）；同 SKU+柜次递增 */
    versionNo: integer("version_no").notNull().default(1),
    /** → ocean_shipments.id；Daraz 按柜次版本化 */
    containerLotId: text("container_lot_id"),
    taxTemplateCode: varchar("tax_template_code", { length: 64 }),
    taxBreakdown: jsonb("tax_breakdown").$type<Record<string, unknown>>(),
    calculatorSnapshot: jsonb("calculator_snapshot").$type<Record<string, unknown>>(),
    landedUnitCost: numeric("landed_unit_cost", { precision: 18, scale: 4 }),
    fxRateId: text("fx_rate_id"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sku_costs_org_idx").on(t.organizationId),
    index("sku_costs_variant_idx").on(t.variantId),
    index("sku_costs_lot_idx").on(t.containerLotId),
  ],
)

// ---------------------------------------------------------------------------
// settlements / settlement_lines — KEEP + MERGE（费用类型拆分列）
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
    billAmount: numeric("bill_amount", { precision: 18, scale: 4 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
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
    /** platform / logistics / ads / jsb / refund / fx / other */
    feeKind: varchar("fee_kind", { length: 32 }),
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
// pending_actions / product_candidates — KEEP（连接器 / 人审队列）
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
// platform_brands / platform_categories — KEEP（平台缓存）
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

// ---------------------------------------------------------------------------
// fx_rates — ADD（F33；platform + ccy + effective date + source）
// ---------------------------------------------------------------------------

export const fxRates = pgTable(
  "fx_rates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id").references(() => organization.id),
    platform: varchar("platform", { length: 32 }),
    marketplaceCode: varchar("marketplace_code", { length: 32 }),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    effectiveDate: varchar("effective_date", { length: 10 }).notNull(),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("fx_rates_lookup_idx").on(
      t.platform,
      t.baseCurrency,
      t.quoteCurrency,
      t.effectiveDate,
    ),
  ],
)

// ---------------------------------------------------------------------------
// ocean_shipments / ocean_shipment_lines — ADD（F22 海运柜次）
// ---------------------------------------------------------------------------

export const oceanShipmentStatuses = [
  "in_transit",
  "customs_clearing",
  "received_local",
  "cancelled",
] as const
export type OceanShipmentStatus = (typeof oceanShipmentStatuses)[number]

export const oceanShipments = pgTable(
  "ocean_shipments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    lotCode: varchar("lot_code", { length: 64 }).notNull(),
    containerNo: varchar("container_no", { length: 64 }),
    containerType: varchar("container_type", { length: 16 }),
    platform: varchar("platform", { length: 32 }).notNull().default("daraz"),
    originPort: varchar("origin_port", { length: 16 }),
    destPort: varchar("dest_port", { length: 16 }),
    destinationWarehouseCode: varchar("destination_warehouse_code", { length: 64 }),
    status: varchar("status", { length: 32 }).notNull().default("in_transit"),
    etd: varchar("etd", { length: 10 }),
    etaPort: varchar("eta_port", { length: 10 }),
    etaWarehouse: varchar("eta_warehouse", { length: 10 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("ocean_shipments_org_lot_uidx").on(t.organizationId, t.lotCode),
    index("ocean_shipments_status_idx").on(t.status),
  ],
)

export const oceanShipmentLines = pgTable(
  "ocean_shipment_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => oceanShipments.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    skuCode: varchar("sku_code", { length: 64 }),
    qtyShipped: integer("qty_shipped").notNull().default(0),
    qtyReceived: integer("qty_received").notNull().default(0),
    qtyDamaged: integer("qty_damaged").notNull().default(0),
    skuCostId: text("sku_cost_id"),
  },
  (t) => [
    uniqueIndex("ocean_shipment_lines_ship_variant_uidx").on(t.shipmentId, t.variantId),
    index("ocean_shipment_lines_shipment_idx").on(t.shipmentId),
  ],
)

// ---------------------------------------------------------------------------
// audit_events — ADD（精简占位；对齐设计 audit_events）
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label"),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: text("entity_id"),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    result: varchar("result", { length: 32 }),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_events_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
  ],
)

export type Shop = typeof shops.$inferSelect
export type Product = typeof products.$inferSelect
export type ProductVariant = typeof productVariants.$inferSelect
export type Listing = typeof listings.$inferSelect
export type SellerSkuMapping = typeof sellerSkuMappings.$inferSelect
export type MappingException = typeof mappingExceptions.$inferSelect
export type Order = typeof orders.$inferSelect
export type OrderLine = typeof orderLines.$inferSelect
export type SkuCost = typeof skuCosts.$inferSelect
export type AuditEvent = typeof auditEvents.$inferSelect
export type PlatformBrand = typeof platformBrands.$inferSelect
export type PlatformCategory = typeof platformCategories.$inferSelect
export type PendingAction = typeof pendingActions.$inferSelect
export type ProductCandidate = typeof productCandidates.$inferSelect
export type FxRate = typeof fxRates.$inferSelect
export type OceanShipment = typeof oceanShipments.$inferSelect
export type OceanShipmentLine = typeof oceanShipmentLines.$inferSelect
