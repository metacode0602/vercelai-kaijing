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
  boolean,
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
  "returned",
  "lost",
  "failed",
  "unknown",
] as const
export type OrderStatus = (typeof orderStatuses)[number]

export const shipmentStatuses = [
  "pending",
  "ready_to_ship",
  "shipped",
  "in_transit",
  "delivered",
  "cancelled",
  "returned",
  "failed",
] as const
export type ShipmentStatus = (typeof shipmentStatuses)[number]

export const inventoryReservationStatuses = [
  "active",
  "released",
  "committed",
  "cancelled",
] as const
export type InventoryReservationStatus = (typeof inventoryReservationStatuses)[number]

export const inventoryMovementTypes = [
  "reserve",
  "release",
  "ship",
  "order_reserve",
  "order_release",
  "order_ship",
  "return_hold",
  "return_restock",
  "damage",
  "write_off",
  "adjustment",
  "purchase_stock_in",
  "qc_fail_damage",
] as const
export type InventoryMovementType = (typeof inventoryMovementTypes)[number]

export const reverseRequestTypes = ["CANCEL", "RETURN", "ONLY_REFUND"] as const
export type ReverseRequestType = (typeof reverseRequestTypes)[number]

export const refundStatuses = [
  "pending",
  "processing",
  "refunded",
  "failed",
  "cancelled",
] as const
export type RefundStatus = (typeof refundStatuses)[number]

export const amountUnits = ["major", "cent", "raw"] as const
export type AmountUnit = (typeof amountUnits)[number]

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
    orderNumber: varchar("order_number", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("unknown"),
    platformStatus: varchar("platform_status", { length: 64 }),
    fulfillmentStatus: varchar("fulfillment_status", { length: 32 }),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    platformUpdatedAt: timestamp("platform_updated_at", { withTimezone: true }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    totalAmount: numeric("total_amount", { precision: 18, scale: 4 }),
    shippingFee: numeric("shipping_fee", { precision: 18, scale: 4 }),
    shippingFeeOriginal: numeric("shipping_fee_original", { precision: 18, scale: 4 }),
    shippingFeeDiscountSeller: numeric("shipping_fee_discount_seller", {
      precision: 18,
      scale: 4,
    }),
    shippingFeeDiscountPlatform: numeric("shipping_fee_discount_platform", {
      precision: 18,
      scale: 4,
    }),
    voucherAmount: numeric("voucher_amount", { precision: 18, scale: 4 }),
    voucherPlatform: numeric("voucher_platform", { precision: 18, scale: 4 }),
    voucherSeller: numeric("voucher_seller", { precision: 18, scale: 4 }),
    buyerRegion: varchar("buyer_region", { length: 64 }),
    paymentMethod: varchar("payment_method", { length: 64 }),
    buyerNote: text("buyer_note"),
    remarks: text("remarks"),
    needCancelConfirm: boolean("need_cancel_confirm").notNull().default(false),
    isCancelPending: boolean("is_cancel_pending").notNull().default(false),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("orders_org_idx").on(t.organizationId),
    index("orders_shop_idx").on(t.shopId),
    index("orders_shop_platform_updated_idx").on(t.shopId, t.platformUpdatedAt),
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
    shopSku: varchar("shop_sku", { length: 128 }),
    sku: varchar("sku", { length: 128 }),
    sellerSku: varchar("seller_sku", { length: 128 }),
    platformSkuId: text("platform_sku_id"),
    title: text("title"),
    qty: integer("qty").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 18, scale: 4 }),
    paidPrice: numeric("paid_price", { precision: 18, scale: 4 }),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 4 }),
    discountAmount: numeric("discount_amount", { precision: 18, scale: 4 }),
    shippingAmount: numeric("shipping_amount", { precision: 18, scale: 4 }),
    paymentTime: timestamp("payment_time", { withTimezone: true }),
    variantId: text("variant_id").references(() => productVariants.id),
    fulfillmentStatus: varchar("fulfillment_status", { length: 32 }),
    platformStatus: varchar("platform_status", { length: 64 }),
    returnStatus: varchar("return_status", { length: 64 }),
    reasonCode: varchar("reason_code", { length: 64 }),
    reasonText: text("reason_text"),
    orderType: varchar("order_type", { length: 32 }),
    orderFlag: varchar("order_flag", { length: 32 }),
    warehouseCode: varchar("warehouse_code", { length: 64 }),
    isFbl: boolean("is_fbl").notNull().default(false),
  },
  (t) => [
    index("order_lines_order_idx").on(t.orderId),
    index("order_lines_org_idx").on(t.organizationId),
    index("order_lines_org_seller_sku_idx").on(t.organizationId, t.sellerSku),
    uniqueIndex("order_lines_order_ext_uidx").on(t.orderId, t.externalLineId),
  ],
)

export const orderStatusEvents = pgTable(
  "order_status_events",
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
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    orderLineId: text("order_line_id").references(() => orderLines.id),
    fromStatus: varchar("from_status", { length: 64 }),
    toStatus: varchar("to_status", { length: 64 }).notNull(),
    source: varchar("source", { length: 16 }).notNull().default("sync"),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("order_status_events_org_idx").on(t.organizationId),
    index("order_status_events_shop_order_time_idx").on(t.shopId, t.orderId, t.eventTime),
    index("order_status_events_order_line_idx").on(t.orderLineId),
  ],
)

export const shipments = pgTable(
  "shipments",
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
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    externalPackageId: varchar("external_package_id", { length: 128 }).notNull(),
    trackingNumber: varchar("tracking_number", { length: 128 }),
    providerCode: varchar("provider_code", { length: 64 }),
    providerName: varchar("provider_name", { length: 128 }),
    providerType: varchar("provider_type", { length: 32 }),
    warehouseCode: varchar("warehouse_code", { length: 64 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    platformStatus: varchar("platform_status", { length: 64 }),
    rtsAt: timestamp("rts_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("shipments_org_idx").on(t.organizationId),
    index("shipments_shop_order_idx").on(t.shopId, t.orderId),
    uniqueIndex("shipments_shop_ext_pkg_uidx").on(t.shopId, t.externalPackageId),
  ],
)

export const shipmentItems = pgTable(
  "shipment_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id),
    orderLineId: text("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    qty: integer("qty").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("shipment_items_org_idx").on(t.organizationId),
    index("shipment_items_order_line_idx").on(t.orderLineId),
    uniqueIndex("shipment_items_shipment_line_uidx").on(t.shipmentId, t.orderLineId),
  ],
)

export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id),
    statusCode: varchar("status_code", { length: 64 }).notNull(),
    title: text("title"),
    description: text("description"),
    location: text("location"),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    /** api | manual | import — UED 要求区分来源；JSB 无 API 时走 import */
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tracking_events_org_idx").on(t.organizationId),
    index("tracking_events_shipment_time_idx").on(t.shipmentId, t.eventTime),
    index("tracking_events_source_idx").on(t.source),
    uniqueIndex("tracking_events_shipment_time_status_uidx").on(
      t.shipmentId,
      t.eventTime,
      t.statusCode,
    ),
  ],
)

export const fulfillmentAttempts = pgTable(
  "fulfillment_attempts",
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
    shipmentId: text("shipment_id").references(() => shipments.id),
    orderId: text("order_id").references(() => orders.id),
    externalPackageId: varchar("external_package_id", { length: 128 }),
    action: varchar("action", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    attemptNo: integer("attempt_no").notNull().default(1),
    result: varchar("result", { length: 32 }).notNull(),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    retryable: boolean("retryable").notNull().default(false),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("fulfillment_attempts_org_idx").on(t.organizationId),
    index("fulfillment_attempts_shipment_idx").on(t.shipmentId),
    uniqueIndex("fulfillment_attempts_org_action_key_uidx").on(
      t.organizationId,
      t.action,
      t.idempotencyKey,
    ),
  ],
)


// ---------------------------------------------------------------------------
// fulfillment_batches / fulfillment_batch_packages — LGS/JSB 交接批次（模块4）
// 与 shipments 通过 junction 关联，不在 shipments 上加 batch_id（避免一包多批歧义）。
// ---------------------------------------------------------------------------

export const fulfillmentBatches = pgTable(
  "fulfillment_batches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    batchNo: varchar("batch_no", { length: 64 }).notNull(),
    /** lgs | jsb | jsb_th | … */
    channel: varchar("channel", { length: 32 }).notNull(),
    site: varchar("site", { length: 16 }),
    country: varchar("country", { length: 8 }),
    warehouseCode: varchar("warehouse_code", { length: 64 }),
    /** open | submitted | accepted | rejected | closed | in_transit | delivered | exception */
    status: varchar("status", { length: 32 }).notNull().default("open"),
    carrier: varchar("carrier", { length: 64 }),
    trackingSummary: text("tracking_summary"),
    packageCount: integer("package_count").notNull().default(0),
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("fulfillment_batches_org_batch_no_uidx").on(t.organizationId, t.batchNo),
    index("fulfillment_batches_org_channel_idx").on(t.organizationId, t.channel),
    index("fulfillment_batches_org_status_idx").on(t.organizationId, t.status),
  ],
)

export const fulfillmentBatchPackages = pgTable(
  "fulfillment_batch_packages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    batchId: text("batch_id")
      .notNull()
      .references(() => fulfillmentBatches.id),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => shipments.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("fulfillment_batch_packages_batch_shipment_uidx").on(t.batchId, t.shipmentId),
    index("fulfillment_batch_packages_org_idx").on(t.organizationId),
    index("fulfillment_batch_packages_shipment_idx").on(t.shipmentId),
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

export const inventoryReservations = pgTable(
  "inventory_reservations",
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
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    orderLineId: text("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull().default("DEFAULT"),
    binCode: varchar("bin_code", { length: 64 }),
    qty: integer("qty").notNull().default(1),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("inventory_reservations_org_idx").on(t.organizationId),
    index("inventory_reservations_order_idx").on(t.orderId),
    index("inventory_reservations_variant_status_idx").on(t.variantId, t.status),
    uniqueIndex("inventory_reservations_shop_line_uidx").on(t.shopId, t.orderLineId),
  ],
)

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    shopId: text("shop_id").references(() => shops.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull().default("DEFAULT"),
    binCode: varchar("bin_code", { length: 64 }),
    movementType: varchar("movement_type", { length: 32 }).notNull(),
    qtyDelta: integer("qty_delta").notNull(),
    onHandAfter: integer("on_hand_after").notNull(),
    reservedAfter: integer("reserved_after").notNull(),
    qcHoldAfter: integer("qc_hold_after").notNull().default(0),
    damagedAfter: integer("damaged_after").notNull().default(0),
    sourceType: varchar("source_type", { length: 32 }),
    sourceId: text("source_id"),
    operator: text("operator"),
    /** 幂等键：同 org 下重复上架/流水写入时短路。 */
    idempotencyKey: varchar("idempotency_key", { length: 191 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("inventory_movements_org_variant_time_idx").on(
      t.organizationId,
      t.variantId,
      t.occurredAt,
    ),
    index("inventory_movements_source_idx").on(t.sourceType, t.sourceId),
    uniqueIndex("inventory_movements_org_idem_uidx").on(t.organizationId, t.idempotencyKey),
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
    /** → fee_template_versions.id；测算命中的费用模板版本 */
    feeTemplateVersionId: text("fee_template_version_id"),
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
    amountUnit: varchar("amount_unit", { length: 16 }).notNull().default("major"),
    billAmount: numeric("bill_amount", { precision: 18, scale: 4 }),
    itemRevenue: numeric("item_revenue", { precision: 18, scale: 4 }),
    otherRevenueTotal: numeric("other_revenue_total", { precision: 18, scale: 4 }),
    subtotal1: numeric("subtotal1", { precision: 18, scale: 4 }),
    subtotal2: numeric("subtotal2", { precision: 18, scale: 4 }),
    refundsAmount: numeric("refunds_amount", { precision: 18, scale: 4 }),
    feesOnRefundsTotal: numeric("fees_on_refunds_total", { precision: 18, scale: 4 }),
    shipmentFee: numeric("shipment_fee", { precision: 18, scale: 4 }),
    shipmentFeeCredit: numeric("shipment_fee_credit", { precision: 18, scale: 4 }),
    feesTotal: numeric("fees_total", { precision: 18, scale: 4 }),
    guaranteeDeposit: numeric("guarantee_deposit", { precision: 18, scale: 4 }),
    openingBalance: numeric("opening_balance", { precision: 18, scale: 4 }),
    closingBalance: numeric("closing_balance", { precision: 18, scale: 4 }),
    payoutAmount: numeric("payout_amount", { precision: 18, scale: 4 }),
    payoutStatus: varchar("payout_status", { length: 32 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    platformCreatedAt: timestamp("platform_created_at", { withTimezone: true }),
    platformUpdatedAt: timestamp("platform_updated_at", { withTimezone: true }),
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
    orderLineId: text("order_line_id").references(() => orderLines.id),
    variantId: text("variant_id").references(() => productVariants.id),
    /** platform / logistics / ads / jsb / refund / fx / other */
    feeKind: varchar("fee_kind", { length: 32 }),
    feeType: varchar("fee_type", { length: 64 }),
    feeName: text("fee_name"),
    transactionType: varchar("transaction_type", { length: 64 }),
    externalTransactionId: varchar("external_transaction_id", { length: 128 }),
    externalOrderNo: varchar("external_order_no", { length: 128 }),
    amount: numeric("amount", { precision: 18, scale: 4 }),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 4 }),
    whtAmount: numeric("wht_amount", { precision: 18, scale: 4 }),
    whtIncludedInAmount: boolean("wht_included_in_amount").notNull().default(false),
    currency: varchar("currency", { length: 3 }),
    amountUnit: varchar("amount_unit", { length: 16 }).notNull().default("major"),
    paidStatus: varchar("paid_status", { length: 32 }),
    paymentReference: varchar("payment_reference", { length: 128 }),
    sellerSku: varchar("seller_sku", { length: 128 }),
    platformSkuId: text("platform_sku_id"),
    shippingProvider: varchar("shipping_provider", { length: 128 }),
    shippingSpeed: varchar("shipping_speed", { length: 64 }),
    shipmentType: varchar("shipment_type", { length: 64 }),
    note: text("note"),
  },
  (t) => [
    index("settlement_lines_settlement_idx").on(t.settlementId),
    index("settlement_lines_org_idx").on(t.organizationId),
    index("settlement_lines_order_line_idx").on(t.orderLineId),
    uniqueIndex("settlement_lines_settlement_ext_txn_uidx").on(
      t.settlementId,
      t.externalTransactionId,
    ),
  ],
)

// ---------------------------------------------------------------------------
// reverse_orders / reverse_order_items / refunds — P1 售后
// ---------------------------------------------------------------------------

export const reverseOrders = pgTable(
  "reverse_orders",
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
    externalReverseOrderId: varchar("external_reverse_order_id", { length: 128 }).notNull(),
    orderId: text("order_id").references(() => orders.id),
    externalTradeOrderId: varchar("external_trade_order_id", { length: 128 }),
    requestType: varchar("request_type", { length: 32 }),
    returnToType: varchar("return_to_type", { length: 32 }),
    shippingType: varchar("shipping_type", { length: 32 }),
    isRtm: boolean("is_rtm").notNull().default(false),
    platformStatus: varchar("platform_status", { length: 64 }),
    fulfillmentStatus: varchar("fulfillment_status", { length: 64 }),
    disputeInProgress: boolean("dispute_in_progress").notNull().default(false),
    platformCreatedAt: timestamp("platform_created_at", { withTimezone: true }),
    platformUpdatedAt: timestamp("platform_updated_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("reverse_orders_org_idx").on(t.organizationId),
    index("reverse_orders_shop_order_idx").on(t.shopId, t.orderId),
    uniqueIndex("reverse_orders_shop_ext_uidx").on(t.shopId, t.externalReverseOrderId),
  ],
)

export const reverseOrderItems = pgTable(
  "reverse_order_items",
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
    reverseOrderId: text("reverse_order_id")
      .notNull()
      .references(() => reverseOrders.id),
    externalReverseLineId: varchar("external_reverse_line_id", { length: 128 }).notNull(),
    orderLineId: text("order_line_id").references(() => orderLines.id),
    externalOrderLineId: varchar("external_order_line_id", { length: 128 }),
    reverseStatus: varchar("reverse_status", { length: 64 }),
    fulfillmentStatus: varchar("fulfillment_status", { length: 64 }),
    reasonCode: varchar("reason_code", { length: 64 }),
    reasonText: text("reason_text"),
    refundAmount: numeric("refund_amount", { precision: 18, scale: 4 }),
    currency: varchar("currency", { length: 3 }),
    amountUnit: varchar("amount_unit", { length: 16 }).notNull().default("major"),
    qcDecision: varchar("qc_decision", { length: 64 }),
    trackingNumber: varchar("tracking_number", { length: 128 }),
    slaAt: timestamp("sla_at", { withTimezone: true }),
    isDispute: boolean("is_dispute").notNull().default(false),
    isNeedRefund: boolean("is_need_refund").notNull().default(false),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("reverse_order_items_org_idx").on(t.organizationId),
    index("reverse_order_items_order_idx").on(t.reverseOrderId),
    index("reverse_order_items_order_line_idx").on(t.orderLineId),
    uniqueIndex("reverse_order_items_shop_ext_uidx").on(t.shopId, t.externalReverseLineId),
  ],
)

export const reverseQcRecords = pgTable(
  "reverse_qc_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    reverseOrderLineId: text("reverse_order_line_id")
      .notNull()
      .references(() => reverseOrderItems.id),
    qcDecision: varchar("qc_decision", { length: 64 }).notNull(),
    qcAt: timestamp("qc_at", { withTimezone: true }).notNull(),
    warehouseCode: varchar("warehouse_code", { length: 64 }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("reverse_qc_records_org_idx").on(t.organizationId),
    index("reverse_qc_records_line_idx").on(t.reverseOrderLineId, t.qcAt),
  ],
)

export const reverseOrderEvents = pgTable(
  "reverse_order_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    reverseOrderId: text("reverse_order_id")
      .notNull()
      .references(() => reverseOrders.id),
    reverseOrderLineId: text("reverse_order_line_id").references(() => reverseOrderItems.id),
    direction: varchar("direction", { length: 16 }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    content: text("content"),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("reverse_order_events_org_idx").on(t.organizationId),
    index("reverse_order_events_order_time_idx").on(t.reverseOrderId, t.eventTime),
  ],
)

export const refunds = pgTable(
  "refunds",
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
    reverseOrderId: text("reverse_order_id").references(() => reverseOrders.id),
    reverseOrderLineId: text("reverse_order_line_id").references(() => reverseOrderItems.id),
    externalRefundId: varchar("external_refund_id", { length: 128 }),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountUnit: varchar("amount_unit", { length: 16 }).notNull().default("major"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("refunds_org_idx").on(t.organizationId),
    index("refunds_reverse_order_idx").on(t.reverseOrderId),
    uniqueIndex("refunds_shop_ext_uidx").on(t.shopId, t.externalRefundId),
  ],
)

export const returnShipments = pgTable(
  "return_shipments",
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
    reverseOrderId: text("reverse_order_id")
      .notNull()
      .references(() => reverseOrders.id),
    reverseOrderLineId: text("reverse_order_line_id").references(() => reverseOrderItems.id),
    trackingNumber: varchar("tracking_number", { length: 128 }),
    providerCode: varchar("provider_code", { length: 64 }),
    providerName: varchar("provider_name", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("return_shipments_org_idx").on(t.organizationId),
    index("return_shipments_reverse_order_idx").on(t.reverseOrderId),
  ],
)

// ---------------------------------------------------------------------------
// account_transactions / logistics_fee_details — P1 财务
// ---------------------------------------------------------------------------

export const accountTransactions = pgTable(
  "account_transactions",
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
    transactionNumber: varchar("transaction_number", { length: 128 }).notNull(),
    transactionTime: timestamp("transaction_time", { withTimezone: true }),
    type: varchar("type", { length: 64 }),
    subType: varchar("sub_type", { length: 64 }),
    amount: numeric("amount", { precision: 18, scale: 4 }),
    currency: varchar("currency", { length: 3 }),
    amountUnit: varchar("amount_unit", { length: 16 }).notNull().default("major"),
    status: varchar("status", { length: 32 }),
    reference: varchar("reference", { length: 128 }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [
    index("account_transactions_org_time_idx").on(t.organizationId, t.transactionTime),
    index("account_transactions_shop_time_idx").on(t.shopId, t.transactionTime),
    uniqueIndex("account_transactions_shop_ext_uidx").on(t.shopId, t.transactionNumber),
  ],
)

export const logisticsFeeDetails = pgTable(
  "logistics_fee_details",
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
    settlementId: text("settlement_id").references(() => settlements.id),
    statementId: varchar("statement_id", { length: 128 }),
    externalOrderId: varchar("external_order_id", { length: 128 }),
    orderId: text("order_id").references(() => orders.id),
    externalOrderLineId: varchar("external_order_line_id", { length: 128 }),
    orderLineId: text("order_line_id").references(() => orderLines.id),
    externalPackageId: varchar("external_package_id", { length: 128 }),
    shipmentId: text("shipment_id").references(() => shipments.id),
    feeCode: varchar("fee_code", { length: 64 }),
    feeName: text("fee_name"),
    amount: numeric("amount", { precision: 18, scale: 4 }),
    taxAmount: numeric("tax_amount", { precision: 18, scale: 4 }),
    currency: varchar("currency", { length: 3 }),
    amountUnit: varchar("amount_unit", { length: 16 }).notNull().default("major"),
    feeCreatedAt: timestamp("fee_created_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("logistics_fee_details_org_time_idx").on(t.organizationId, t.feeCreatedAt),
    index("logistics_fee_details_shop_time_idx").on(t.shopId, t.feeCreatedAt),
    index("logistics_fee_details_settlement_idx").on(t.settlementId),
    index("logistics_fee_details_order_line_idx").on(t.orderLineId),
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
    platformRequestId: varchar("platform_request_id", { length: 128 }),
    platformResponse: jsonb("platform_response").$type<Record<string, unknown>>(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    lastErrorMessage: text("last_error_message"),
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


// ---------------------------------------------------------------------------
// fee_templates / fee_template_versions — 已落库（migration 0012_commerce_fee_templates）
// UED 审核状态机：draft → in_review → published → disabled（驳回回 draft）
// published / review_needed 与 status 同步维护；解析仅命中 status=published
// @see apps/shop/content/design/fee-templates-ued.md
// @see docs/design/shop-module5-fee-templates-trpc.md
// ---------------------------------------------------------------------------

export const feeTemplateTypes = ["import_tax", "platform_fee"] as const
export type FeeTemplateTypeDb = (typeof feeTemplateTypes)[number]

/** 模板头状态：draft / active / disabled */
export const feeTemplateHeaderStatuses = ["draft", "active", "disabled"] as const
export type FeeTemplateHeaderStatusDb = (typeof feeTemplateHeaderStatuses)[number]

/** 版本审核状态机（UED v1.1 C8） */
export const feeTemplateVersionStatuses = [
  "draft",
  "in_review",
  "published",
  "disabled",
] as const
export type FeeTemplateVersionStatusDb = (typeof feeTemplateVersionStatuses)[number]

export const feeTemplates = pgTable(
  "fee_templates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    code: varchar("code", { length: 64 }).notNull(),
    name: text("name").notNull(),
    platform: varchar("platform", { length: 32 }).notNull(),
    country: varchar("country", { length: 8 }).notNull(),
    fulfillmentPool: varchar("fulfillment_pool", { length: 64 }),
    fulfillmentLogistics: varchar("fulfillment_logistics", { length: 32 }),
    type: varchar("type", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("fee_templates_org_code_uidx").on(t.organizationId, t.code),
    index("fee_templates_org_dim_idx").on(
      t.organizationId,
      t.platform,
      t.country,
      t.type,
    ),
  ],
)

export const feeTemplateVersions = pgTable(
  "fee_template_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    templateId: text("template_id")
      .notNull()
      .references(() => feeTemplates.id),
    versionNo: integer("version_no").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    /** 同维度重叠时人工优先级，越大越优先 */
    priority: integer("priority").notNull().default(10),
    formulaProfile: varchar("formula_profile", { length: 64 }),
    components: jsonb("components").$type<Record<string, unknown>[]>().notNull(),
    /** 与 status 同步：status=published 时为 true（兼容旧解析字段） */
    published: boolean("published").notNull().default(false),
    reviewNeeded: boolean("review_needed").notNull().default(true),
    /** UED v1.1：draft / in_review / published / disabled */
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("fee_template_versions_tpl_ver_uidx").on(t.templateId, t.versionNo),
    index("fee_template_versions_org_idx").on(t.organizationId),
    index("fee_template_versions_eff_idx").on(t.templateId, t.effectiveFrom),
    index("fee_template_versions_status_idx").on(t.templateId, t.status),
  ],
)


// ---------------------------------------------------------------------------
// 域 D：采购申请 → PO → 分批到货 → 质检 → 入库上架（模块2）
// 供应商/仓暂以展示码存储（无独立 suppliers/warehouses 表）；variant 经 product_variants.sku_code 解析。
// ---------------------------------------------------------------------------

export const purchaseRequestStatuses = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "converted",
  "cancelled",
] as const
export type PurchaseRequestStatusDb = (typeof purchaseRequestStatuses)[number]

export const purchaseOrderStatuses = [
  "draft",
  "sent",
  "partial_received",
  "received",
  "closed",
  "cancelled",
] as const
export type PurchaseOrderStatusDb = (typeof purchaseOrderStatuses)[number]

export const purchaseReceiptStatuses = [
  "draft",
  "qc_pending",
  "completed",
  "cancelled",
] as const
export type PurchaseReceiptStatusDb = (typeof purchaseReceiptStatuses)[number]

export const stockInboundStatuses = ["pending_shelve", "shelved", "cancelled"] as const
export type StockInboundStatusDb = (typeof stockInboundStatuses)[number]

export const stockInboundSourceTypes = [
  "purchase",
  "aftersale_return",
  "stocktake_gain",
  "transfer_in",
] as const
export type StockInboundSourceTypeDb = (typeof stockInboundSourceTypes)[number]

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    requestNo: varchar("request_no", { length: 32 }).notNull(),
    /** 供应商展示名（后续可迁 supplier_id） */
    supplierName: text("supplier_name").notNull(),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull().default("WH-CN-XMN-001"),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    expectedArrivalAt: varchar("expected_arrival_at", { length: 10 }),
    currency: varchar("currency", { length: 3 }).notNull().default("CNY"),
    totalAmount: numeric("total_amount", { precision: 15, scale: 4 }).notNull().default("0"),
    reason: text("reason"),
    remark: text("remark"),
    applicantName: text("applicant_name").notNull().default(""),
    approverName: text("approver_name").notNull().default(""),
    opinion: text("opinion"),
    convertedPoId: text("converted_po_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("purchase_requests_org_no_uidx").on(t.organizationId, t.requestNo),
    index("purchase_requests_org_status_idx").on(t.organizationId, t.status),
  ],
)

export const purchaseRequestLines = pgTable(
  "purchase_request_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    purchaseRequestId: text("purchase_request_id")
      .notNull()
      .references(() => purchaseRequests.id),
    lineNo: integer("line_no").notNull(),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    skuCode: varchar("sku_code", { length: 64 }).notNull(),
    supplierSku: varchar("supplier_sku", { length: 128 }),
    qty: integer("qty").notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 4 }).notNull().default("0"),
    amount: numeric("amount", { precision: 15, scale: 4 }).notNull().default("0"),
    remark: text("remark"),
    ...timestamps,
  },
  (t) => [
    index("purchase_request_lines_req_idx").on(t.purchaseRequestId),
    uniqueIndex("purchase_request_lines_req_line_uidx").on(t.purchaseRequestId, t.lineNo),
  ],
)

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    poNo: varchar("po_no", { length: 32 }).notNull(),
    purchaseRequestId: text("purchase_request_id").references(() => purchaseRequests.id),
    sourceRequestNo: varchar("source_request_no", { length: 32 }),
    supplierName: text("supplier_name").notNull(),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull().default("WH-CN-XMN-001"),
    status: varchar("status", { length: 32 }).notNull().default("sent"),
    expectedArrivalAt: varchar("expected_arrival_at", { length: 10 }),
    currency: varchar("currency", { length: 3 }).notNull().default("CNY"),
    totalAmount: numeric("total_amount", { precision: 15, scale: 4 }).notNull().default("0"),
    createdBy: text("created_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("purchase_orders_org_no_uidx").on(t.organizationId, t.poNo),
    index("purchase_orders_org_status_idx").on(t.organizationId, t.status),
    index("purchase_orders_request_idx").on(t.purchaseRequestId),
  ],
)

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    lineNo: integer("line_no").notNull(),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    skuCode: varchar("sku_code", { length: 64 }).notNull(),
    qtyOrdered: integer("qty_ordered").notNull(),
    qtyReceived: integer("qty_received").notNull().default(0),
    qtyQcPassed: integer("qty_qc_passed").notNull().default(0),
    qtyStocked: integer("qty_stocked").notNull().default(0),
    unitPrice: numeric("unit_price", { precision: 15, scale: 4 }).notNull().default("0"),
    amount: numeric("amount", { precision: 15, scale: 4 }).notNull().default("0"),
    ...timestamps,
  },
  (t) => [
    index("purchase_order_lines_po_idx").on(t.purchaseOrderId),
    uniqueIndex("purchase_order_lines_po_line_uidx").on(t.purchaseOrderId, t.lineNo),
  ],
)

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    receiptNo: varchar("receipt_no", { length: 32 }).notNull(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    poNo: varchar("po_no", { length: 32 }).notNull(),
    supplierName: text("supplier_name").notNull(),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    receivedBy: text("received_by"),
    deliveryNote: text("delivery_note"),
    remark: text("remark"),
    qcNo: varchar("qc_no", { length: 32 }),
    qcInspector: text("qc_inspector"),
    qcCompletedAt: timestamp("qc_completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("purchase_receipts_org_no_uidx").on(t.organizationId, t.receiptNo),
    index("purchase_receipts_po_idx").on(t.purchaseOrderId),
    index("purchase_receipts_org_status_idx").on(t.organizationId, t.status),
  ],
)

export const purchaseReceiptLines = pgTable(
  "purchase_receipt_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    purchaseReceiptId: text("purchase_receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id),
    lineNo: integer("line_no").notNull(),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => purchaseOrderLines.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    skuCode: varchar("sku_code", { length: 64 }).notNull(),
    qtyOrdered: integer("qty_ordered").notNull().default(0),
    qtyArrived: integer("qty_arrived").notNull(),
    qtyPendingQc: integer("qty_pending_qc").notNull().default(0),
    qtyPassed: integer("qty_passed").notNull().default(0),
    qtyFailed: integer("qty_failed").notNull().default(0),
    note: text("note"),
    suggestedBin: varchar("suggested_bin", { length: 64 }),
    ...timestamps,
  },
  (t) => [
    index("purchase_receipt_lines_receipt_idx").on(t.purchaseReceiptId),
    uniqueIndex("purchase_receipt_lines_receipt_line_uidx").on(t.purchaseReceiptId, t.lineNo),
  ],
)

export const stockInbounds = pgTable(
  "stock_inbounds",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    inboundNo: varchar("inbound_no", { length: 32 }).notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull().default("purchase"),
    sourceDoc: varchar("source_doc", { length: 64 }).notNull(),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
    poNo: varchar("po_no", { length: 32 }),
    purchaseReceiptId: text("purchase_receipt_id").references(() => purchaseReceipts.id),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull(),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    skuCode: varchar("sku_code", { length: 64 }).notNull(),
    quantity: integer("quantity").notNull(),
    qcResult: text("qc_result"),
    binCode: varchar("bin_code", { length: 64 }).notNull(),
    operator: text("operator"),
    status: varchar("status", { length: 32 }).notNull().default("pending_shelve"),
    idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull(),
    remark: text("remark"),
    shelvedAt: timestamp("shelved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stock_inbounds_org_no_uidx").on(t.organizationId, t.inboundNo),
    uniqueIndex("stock_inbounds_org_idem_uidx").on(t.organizationId, t.idempotencyKey),
    index("stock_inbounds_org_status_idx").on(t.organizationId, t.status),
    index("stock_inbounds_receipt_idx").on(t.purchaseReceiptId),
  ],
)



// ---------------------------------------------------------------------------
// stock_outbounds / stock_outbound_lines — 订单出库 / 拣货过账（模块3）
// ---------------------------------------------------------------------------

export const stockOutboundStatuses = [
  "pending_pick",
  "picking",
  "reviewed",
  "posted",
  "cancelled",
] as const
export type StockOutboundStatus = (typeof stockOutboundStatuses)[number]

export const stockOutboundTypes = [
  "order",
  "transfer",
  "purchase_return",
  "stocktake_loss",
  "sample",
  "other",
] as const
export type StockOutboundType = (typeof stockOutboundTypes)[number]

export const stockOutbounds = pgTable(
  "stock_outbounds",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    outboundNo: varchar("outbound_no", { length: 32 }).notNull(),
    outboundType: varchar("outbound_type", { length: 32 }).notNull().default("order"),
    warehouseCode: varchar("warehouse_code", { length: 64 }).notNull().default("WH-CN-XMN-001"),
    shopId: text("shop_id").references(() => shops.id),
    orderId: text("order_id").references(() => orders.id),
    externalOrderId: varchar("external_order_id", { length: 128 }),
    packageId: varchar("package_id", { length: 64 }),
    picker: text("picker"),
    status: varchar("status", { length: 32 }).notNull().default("pending_pick"),
    idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull(),
    reason: text("reason"),
    remark: text("remark"),
    pickedAt: timestamp("picked_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stock_outbounds_org_no_uidx").on(t.organizationId, t.outboundNo),
    uniqueIndex("stock_outbounds_org_idem_uidx").on(t.organizationId, t.idempotencyKey),
    index("stock_outbounds_org_status_idx").on(t.organizationId, t.status),
    index("stock_outbounds_order_idx").on(t.orderId),
  ],
)

export const stockOutboundLines = pgTable(
  "stock_outbound_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    stockOutboundId: text("stock_outbound_id")
      .notNull()
      .references(() => stockOutbounds.id),
    lineNo: integer("line_no").notNull(),
    orderLineId: text("order_line_id").references(() => orderLines.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    skuCode: varchar("sku_code", { length: 64 }).notNull(),
    binCode: varchar("bin_code", { length: 64 }).notNull(),
    qty: integer("qty").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("stock_outbound_lines_outbound_idx").on(t.stockOutboundId),
    index("stock_outbound_lines_org_idx").on(t.organizationId),
    uniqueIndex("stock_outbound_lines_outbound_line_uidx").on(t.stockOutboundId, t.lineNo),
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
export type OrderStatusEvent = typeof orderStatusEvents.$inferSelect
export type Shipment = typeof shipments.$inferSelect
export type ShipmentItem = typeof shipmentItems.$inferSelect
export type TrackingEvent = typeof trackingEvents.$inferSelect
export type FulfillmentAttempt = typeof fulfillmentAttempts.$inferSelect
export type FulfillmentBatch = typeof fulfillmentBatches.$inferSelect
export type FulfillmentBatchPackage = typeof fulfillmentBatchPackages.$inferSelect
export type InventoryReservation = typeof inventoryReservations.$inferSelect
export type InventoryMovement = typeof inventoryMovements.$inferSelect
export type ReverseOrder = typeof reverseOrders.$inferSelect
export type ReverseOrderItem = typeof reverseOrderItems.$inferSelect
export type ReverseQcRecord = typeof reverseQcRecords.$inferSelect
export type ReverseOrderEvent = typeof reverseOrderEvents.$inferSelect
export type Refund = typeof refunds.$inferSelect
export type ReturnShipment = typeof returnShipments.$inferSelect
export type AccountTransaction = typeof accountTransactions.$inferSelect
export type LogisticsFeeDetail = typeof logisticsFeeDetails.$inferSelect
export type SkuCost = typeof skuCosts.$inferSelect
export type FeeTemplateRow = typeof feeTemplates.$inferSelect
export type FeeTemplateVersionRow = typeof feeTemplateVersions.$inferSelect
export type AuditEvent = typeof auditEvents.$inferSelect
export type PlatformBrand = typeof platformBrands.$inferSelect
export type PlatformCategory = typeof platformCategories.$inferSelect
export type PendingAction = typeof pendingActions.$inferSelect
export type ProductCandidate = typeof productCandidates.$inferSelect
export type FxRate = typeof fxRates.$inferSelect
export type OceanShipment = typeof oceanShipments.$inferSelect
export type OceanShipmentLine = typeof oceanShipmentLines.$inferSelect

export type PurchaseRequestRow = typeof purchaseRequests.$inferSelect
export type PurchaseRequestLineRow = typeof purchaseRequestLines.$inferSelect
export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect
export type PurchaseOrderLineRow = typeof purchaseOrderLines.$inferSelect
export type PurchaseReceiptRow = typeof purchaseReceipts.$inferSelect
export type PurchaseReceiptLineRow = typeof purchaseReceiptLines.$inferSelect
export type StockOutboundRow = typeof stockOutbounds.$inferSelect
export type StockOutboundLineRow = typeof stockOutboundLines.$inferSelect
export type StockInboundRow = typeof stockInbounds.$inferSelect

