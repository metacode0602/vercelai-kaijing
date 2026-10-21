/**
 * Console DEMO mock data.
 * Field names intentionally mirror packages/db/src/commerce-schema.ts
 * (shops, products, listings, orders, inventory_balances, stock_alerts,
 * cost_components, settlements, product_candidates, integration_*).
 * No tRPC — display only.
 */

export type MockPlatform = "daraz" | "lazada" | "shopee" | "tiktok_shop"

export const MOCK_SHOPS = [
  {
    id: "shop-daraz-lk",
    name: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    region: "LK",
    currency: "LKR",
    externalShopId: "dz-lk-88021",
    status: "active",
    syncStatus: "success",
    health: "success",
    lastSyncAt: "2026-10-20 20:40",
    lastOrdersSyncAt: "2026-10-20 20:40",
    lastInventorySyncAt: "2026-10-20 20:38",
    lastError: null as string | null,
    credentialKind: "oauth",
    credentialMask: "····a91f",
    credentialExpiresAt: "2026-12-01",
  },
  {
    id: "shop-lazada-my",
    name: "Lazada MY · Sandbox",
    platform: "lazada" as MockPlatform,
    region: "MY",
    currency: "MYR",
    externalShopId: "lz-my-10288",
    status: "connecting",
    syncStatus: "idle",
    health: "idle",
    lastSyncAt: "—",
    lastOrdersSyncAt: null as string | null,
    lastInventorySyncAt: null as string | null,
    lastError: "OAuth pending merchant approval（示例）",
    credentialKind: "oauth",
    credentialMask: "····pending",
    credentialExpiresAt: null as string | null,
  },
  {
    id: "shop-shopee-sg",
    name: "Shopee SG · Preview",
    platform: "shopee" as MockPlatform,
    region: "SG",
    currency: "SGD",
    externalShopId: "sp-sg-44102",
    status: "error",
    syncStatus: "error",
    health: "error",
    lastSyncAt: "2026-10-18 09:12",
    lastOrdersSyncAt: "2026-10-18 09:12",
    lastInventorySyncAt: "2026-10-17 22:01",
    lastError: "API rate limit · retry after 3600s（示例）",
    credentialKind: "api_key",
    credentialMask: "····7c2e",
    credentialExpiresAt: "2026-11-15",
  },
] as const

export type MockShop = (typeof MOCK_SHOPS)[number]

export const MOCK_CANDIDATES = [
  {
    id: "c1",
    title: "Oversized Cotton Tee",
    score: 0.91,
    status: "new",
    categoryHint: "Apparel",
    url: "https://example.com/sourcing/tee-001",
    landedCost: 5.6,
    suggestPrice: 12.5,
    marginPct: 38,
    currency: "USD",
    competition: "中",
    risk: "低 · 季节性弱",
    marketPotential: "高 · Colombo 服饰搜索增速 +18%（示例）",
    rationale: {
      demand: "近 30 天同类 GMV 上升",
      margin: "到仓后净利率可达 35%+",
      risk: "尺码退货率可控",
    },
    goNoGo: "GO",
    recommendedShops: ["shop-daraz-lk"],
    aiSignals: ["高搜索意图", "低退货类目", "可拼柜"],
  },
  {
    id: "c2",
    title: "USB-C Hub 7-in-1",
    score: 0.84,
    status: "new",
    categoryHint: "Electronics",
    url: "https://example.com/sourcing/hub-01",
    landedCost: 12.3,
    suggestPrice: 24.0,
    marginPct: 32,
    currency: "USD",
    competition: "高",
    risk: "中 · 兼容性投诉",
    marketPotential: "中高 · 数码配件常青（示例）",
    rationale: {
      demand: "办公/学生刚需",
      margin: "运费占比偏高需 LCL",
      risk: "平台同质化严重",
    },
    goNoGo: "CONDITIONAL",
    recommendedShops: ["shop-daraz-lk", "shop-lazada-my"],
    aiSignals: ["竞品价差 8%", "需样品质检", "HS 8544 提示"],
  },
  {
    id: "c3",
    title: "Yoga Mat Pro",
    score: 0.72,
    status: "accepted",
    categoryHint: "Sports",
    url: "https://example.com/sourcing/mat-02",
    landedCost: 8.1,
    suggestPrice: 18.9,
    marginPct: 29,
    currency: "USD",
    competition: "中",
    risk: "中 · 库龄风险已现",
    marketPotential: "中 · 运动品类平稳（示例）",
    rationale: {
      demand: "稳定但非爆款",
      margin: "体积大抬高头程",
      risk: "已有库存积压信号",
    },
    goNoGo: "HOLD",
    recommendedShops: ["shop-daraz-lk"],
    aiSignals: ["库龄≥90d", "建议闪购", "暂缓加订"],
  },
] as const

export type MockCandidate = (typeof MOCK_CANDIDATES)[number]

export const MOCK_PENDING = [
  {
    id: "pa1",
    kind: "listing_submit",
    title: "刊登 Oversized Cotton Tee",
    shopId: "shop-daraz-lk",
    shop: "Daraz LK · Demo",
    status: "pending",
    createdBy: "ai-agent",
    expiresAt: "2026-10-22 18:00",
  },
  {
    id: "pa2",
    kind: "inventory_push",
    title: "推库存 SKU-HUB-01",
    shopId: "shop-daraz-lk",
    shop: "Daraz LK · Demo",
    status: "pending",
    createdBy: "ai-agent",
    expiresAt: "2026-10-21 23:59",
  },
] as const

export const MOCK_PRODUCTS = [
  {
    id: "prod-tee",
    sku: "TEE-001",
    variantId: "var-tee-001",
    title: "Oversized Cotton Tee",
    description: "200gsm 纯棉落肩短袖 · 多色（示例）",
    status: "active",
    source: "sourcing",
    categoryHint: "Apparel",
    barcode: "8901001001001",
    attrs: { color: "Black", size: "L" },
    updatedAt: "2026-10-20",
    aiSignals: ["选品分 0.91", "建议补货拼柜"],
    listings: [
      {
        id: "lst-tee-daraz",
        shopId: "shop-daraz-lk",
        shopName: "Daraz LK · Demo",
        platform: "daraz" as MockPlatform,
        status: "draft",
        priceAmount: 12.5,
        priceCurrency: "USD",
        platformSku: "DZ-TEE-001",
        categoryExternalId: "cat-apparel-tee",
        lastError: null as string | null,
        submittedAt: null as string | null,
        liveAt: null as string | null,
        updatedAt: "2026-10-20",
      },
      {
        id: "lst-tee-lazada",
        shopId: "shop-lazada-my",
        shopName: "Lazada MY · Sandbox",
        platform: "lazada" as MockPlatform,
        status: "pending_review",
        priceAmount: 55.0,
        priceCurrency: "MYR",
        platformSku: "LZ-TEE-001",
        categoryExternalId: "cat-fashion",
        lastError: null as string | null,
        submittedAt: "2026-10-19 11:20",
        liveAt: null as string | null,
        updatedAt: "2026-10-19",
      },
    ],
  },
  {
    id: "prod-hub",
    sku: "HUB-01",
    variantId: "var-hub-01",
    title: "USB-C Hub 7-in-1",
    description: "HDMI / USB3 / SD / PD 100W（示例）",
    status: "active",
    source: "import",
    categoryHint: "Electronics",
    barcode: "8901001002002",
    attrs: { ports: "7", pd: "100W" },
    updatedAt: "2026-10-19",
    aiSignals: ["在售健康", "竞品价差收窄"],
    listings: [
      {
        id: "lst-hub-daraz",
        shopId: "shop-daraz-lk",
        shopName: "Daraz LK · Demo",
        platform: "daraz" as MockPlatform,
        status: "live",
        priceAmount: 24.0,
        priceCurrency: "USD",
        platformSku: "DZ-HUB-01",
        categoryExternalId: "cat-electronics-hub",
        lastError: null as string | null,
        submittedAt: "2026-10-10 09:00",
        liveAt: "2026-10-11 14:22",
        updatedAt: "2026-10-19",
      },
    ],
  },
  {
    id: "prod-mat",
    sku: "MAT-02",
    variantId: "var-mat-02",
    title: "Yoga Mat Pro",
    description: "6mm TPE 防滑瑜伽垫（示例）",
    status: "active",
    source: "manual",
    categoryHint: "Sports",
    barcode: "8901001003003",
    attrs: { thickness: "6mm", material: "TPE" },
    updatedAt: "2026-10-18",
    aiSignals: ["库龄预警", "建议闪购"],
    listings: [
      {
        id: "lst-mat-daraz",
        shopId: "shop-daraz-lk",
        shopName: "Daraz LK · Demo",
        platform: "daraz" as MockPlatform,
        status: "live",
        priceAmount: 18.9,
        priceCurrency: "USD",
        platformSku: "DZ-MAT-02",
        categoryExternalId: "cat-sports-mat",
        lastError: null as string | null,
        submittedAt: "2026-09-01 10:00",
        liveAt: "2026-09-02 16:40",
        updatedAt: "2026-10-18",
      },
      {
        id: "lst-mat-shopee",
        shopId: "shop-shopee-sg",
        shopName: "Shopee SG · Preview",
        platform: "shopee" as MockPlatform,
        status: "failed",
        priceAmount: 26.9,
        priceCurrency: "SGD",
        platformSku: "SP-MAT-02",
        categoryExternalId: "cat-sports",
        lastError: "Category mapping rejected（示例）",
        submittedAt: "2026-10-17 08:30",
        liveAt: null as string | null,
        updatedAt: "2026-10-17",
      },
    ],
  },
] as const

export type MockProduct = (typeof MOCK_PRODUCTS)[number]

/** Flattened rows for products list (primary shop listing). */
export const MOCK_PRODUCT_LIST_ROWS = MOCK_PRODUCTS.map((p) => {
  const primary = p.listings[0]!
  return {
    id: p.id,
    sku: p.sku,
    title: p.title,
    shop: primary.shopName,
    shopCount: p.listings.length,
    listing: primary.status,
    price: `${primary.priceAmount.toFixed(2)} ${primary.priceCurrency}`,
    updatedAt: p.updatedAt,
  }
})

export const MOCK_ORDERS = [
  {
    id: "ord-10021",
    externalOrderId: "DZ-10021",
    shopId: "shop-daraz-lk",
    shopName: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    status: "paid",
    buyerNameMask: "N****a",
    city: "Colombo",
    shippingSummary: "Colombo · Standard · ETA 2–3d（示例）",
    placedAt: "2026-10-20 08:12",
    paidAt: "2026-10-20 08:15",
    currency: "USD",
    totalAmount: 36.5,
    shippingAmount: 2.5,
    lines: [
      {
        id: "ol-10021-1",
        sku: "TEE-001",
        title: "Oversized Cotton Tee",
        qty: 2,
        unitPrice: 12.5,
        platformSku: "DZ-TEE-001",
      },
      {
        id: "ol-10021-2",
        sku: "HUB-01",
        title: "USB-C Hub 7-in-1",
        qty: 1,
        unitPrice: 11.5,
        platformSku: "DZ-HUB-01",
      },
    ],
    timeline: [
      { at: "2026-10-20 08:12", status: "created", note: "平台下单" },
      { at: "2026-10-20 08:15", status: "paid", note: "买家已付款" },
      { at: "—", status: "ready_to_ship", note: "待拣货出库（当前）", current: true },
      { at: "—", status: "shipped", note: "待揽收" },
      { at: "—", status: "delivered", note: "待签收" },
    ],
  },
  {
    id: "ord-10018",
    externalOrderId: "DZ-10018",
    shopId: "shop-daraz-lk",
    shopName: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    status: "shipped",
    buyerNameMask: "K****i",
    city: "Kandy",
    shippingSummary: "Kandy · Express · tracking DZLK9981（示例）",
    placedAt: "2026-10-19 21:03",
    paidAt: "2026-10-19 21:05",
    currency: "USD",
    totalAmount: 24.0,
    shippingAmount: 3.0,
    lines: [
      {
        id: "ol-10018-1",
        sku: "HUB-01",
        title: "USB-C Hub 7-in-1",
        qty: 1,
        unitPrice: 24.0,
        platformSku: "DZ-HUB-01",
      },
    ],
    timeline: [
      { at: "2026-10-19 21:03", status: "created", note: "平台下单" },
      { at: "2026-10-19 21:05", status: "paid", note: "买家已付款" },
      { at: "2026-10-20 09:40", status: "ready_to_ship", note: "拣货完成" },
      { at: "2026-10-20 14:10", status: "shipped", note: "已揽收 · 在途（当前）", current: true },
      { at: "—", status: "delivered", note: "待签收" },
    ],
  },
  {
    id: "ord-10012",
    externalOrderId: "DZ-10012",
    shopId: "shop-daraz-lk",
    shopName: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    status: "delivered",
    buyerNameMask: "S****a",
    city: "Galle",
    shippingSummary: "Galle · Standard · delivered（示例）",
    placedAt: "2026-10-18 14:22",
    paidAt: "2026-10-18 14:25",
    currency: "USD",
    totalAmount: 18.9,
    shippingAmount: 2.0,
    lines: [
      {
        id: "ol-10012-1",
        sku: "MAT-02",
        title: "Yoga Mat Pro",
        qty: 1,
        unitPrice: 18.9,
        platformSku: "DZ-MAT-02",
      },
    ],
    timeline: [
      { at: "2026-10-18 14:22", status: "created", note: "平台下单" },
      { at: "2026-10-18 14:25", status: "paid", note: "买家已付款" },
      { at: "2026-10-18 18:00", status: "ready_to_ship", note: "拣货完成" },
      { at: "2026-10-19 08:20", status: "shipped", note: "已发货" },
      { at: "2026-10-20 11:05", status: "delivered", note: "已签收（当前）", current: true },
    ],
  },
  {
    id: "ord-lz-2201",
    externalOrderId: "LZ-2201",
    shopId: "shop-lazada-my",
    shopName: "Lazada MY · Sandbox",
    platform: "lazada" as MockPlatform,
    status: "created",
    buyerNameMask: "A****n",
    city: "Kuala Lumpur",
    shippingSummary: "KL · 连接未完成 · 订单仅预览（示例）",
    placedAt: "2026-10-20 16:01",
    paidAt: null as string | null,
    currency: "MYR",
    totalAmount: 55.0,
    shippingAmount: 5.0,
    lines: [
      {
        id: "ol-lz-1",
        sku: "TEE-001",
        title: "Oversized Cotton Tee",
        qty: 1,
        unitPrice: 55.0,
        platformSku: "LZ-TEE-001",
      },
    ],
    timeline: [
      { at: "2026-10-20 16:01", status: "created", note: "沙箱下单（当前）", current: true },
      { at: "—", status: "paid", note: "待支付" },
      { at: "—", status: "ready_to_ship", note: "—" },
      { at: "—", status: "shipped", note: "—" },
      { at: "—", status: "delivered", note: "—" },
    ],
  },
] as const

export type MockOrder = (typeof MOCK_ORDERS)[number]

export const MOCK_ORDER_LIST_ROWS = MOCK_ORDERS.map((o) => ({
  id: o.id,
  externalOrderId: o.externalOrderId,
  shop: o.shopName,
  status: o.status,
  total: o.totalAmount.toFixed(2),
  currency: o.currency,
  placedAt: o.placedAt,
  city: o.city,
}))

export const MOCK_INVENTORY = [
  {
    sku: "TEE-001",
    variantId: "var-tee-001",
    title: "Oversized Cotton Tee",
    ageDays: 45,
    suggestion: "补货 80（拼柜）",
    reorderSignal: "below_threshold",
    shopBalances: [
      {
        shopId: "shop-daraz-lk",
        shopName: "Daraz LK · Demo",
        onHand: 12,
        reserved: 3,
        available: 9,
        threshold: 20,
        alertStatus: "open" as const,
        alertId: "alert-tee-daraz",
        triggeredAt: "2026-10-19 07:00",
      },
      {
        shopId: "shop-lazada-my",
        shopName: "Lazada MY · Sandbox",
        onHand: 0,
        reserved: 0,
        available: 0,
        threshold: 10,
        alertStatus: null,
        alertId: null,
        triggeredAt: null as string | null,
      },
    ],
  },
  {
    sku: "HUB-01",
    variantId: "var-hub-01",
    title: "USB-C Hub 7-in-1",
    ageDays: 12,
    suggestion: "—",
    reorderSignal: "healthy",
    shopBalances: [
      {
        shopId: "shop-daraz-lk",
        shopName: "Daraz LK · Demo",
        onHand: 80,
        reserved: 5,
        available: 75,
        threshold: 10,
        alertStatus: null,
        alertId: null,
        triggeredAt: null as string | null,
      },
    ],
  },
  {
    sku: "MAT-02",
    variantId: "var-mat-02",
    title: "Yoga Mat Pro",
    ageDays: 90,
    suggestion: "闪购清仓 / 补货 40",
    reorderSignal: "critical_age",
    shopBalances: [
      {
        shopId: "shop-daraz-lk",
        shopName: "Daraz LK · Demo",
        onHand: 4,
        reserved: 1,
        available: 3,
        threshold: 15,
        alertStatus: "open" as const,
        alertId: "alert-mat-daraz",
        triggeredAt: "2026-10-15 12:30",
      },
      {
        shopId: "shop-shopee-sg",
        shopName: "Shopee SG · Preview",
        onHand: 0,
        reserved: 0,
        available: 0,
        threshold: 8,
        alertStatus: null,
        alertId: null,
        triggeredAt: null as string | null,
      },
    ],
  },
] as const

export type MockInventory = (typeof MOCK_INVENTORY)[number]

/** List-row shape kept for inventory table compatibility. */
export const MOCK_INVENTORY_LIST_ROWS = MOCK_INVENTORY.map((row) => {
  const primary = row.shopBalances[0]!
  const alert =
    row.reorderSignal === "critical_age"
      ? "critical"
      : primary.alertStatus
        ? "open"
        : null
  return {
    sku: row.sku,
    title: row.title,
    onHand: primary.onHand,
    reserved: primary.reserved,
    threshold: primary.threshold,
    ageDays: row.ageDays,
    alert,
    suggestion: row.suggestion,
    shopCount: row.shopBalances.length,
  }
})

export const MOCK_COSTS = [
  {
    sku: "TEE-001",
    variantId: "var-tee-001",
    title: "Oversized Cotton Tee",
    currency: "USD",
    suggestPrice: 12.5,
    targetMarginPct: 35,
    components: [
      { component: "purchase", amount: 4.2, note: "FOB 采购" },
      { component: "freight", amount: 1.1, note: "头程 LCL" },
      { component: "duty", amount: 0.15, note: "customs" },
      { component: "other", amount: 0.05, note: "PAL" },
      { component: "other", amount: 0.02, note: "CESS" },
      { component: "other", amount: 0.38, note: "VAT" },
      { component: "other", amount: 0.08, note: "SSCL" },
    ],
    // Flat LK tax view for list compatibility
    purchase: 4.2,
    freight: 1.1,
    customs: 0.15,
    pal: 0.05,
    cess: 0.02,
    vat: 0.38,
    sscl: 0.08,
    shippingOptions: [
      { mode: "LCL", unitCost: 1.1, leadDays: 18, note: "拼柜 · 推荐" },
      { mode: "FCL", unitCost: 0.85, leadDays: 22, note: "整柜 · 量不足" },
    ],
  },
  {
    sku: "HUB-01",
    variantId: "var-hub-01",
    title: "USB-C Hub 7-in-1",
    currency: "USD",
    suggestPrice: 24.0,
    targetMarginPct: 32,
    components: [
      { component: "purchase", amount: 9.5, note: "FOB 采购" },
      { component: "freight", amount: 2.0, note: "头程 LCL" },
      { component: "duty", amount: 0.4, note: "customs" },
      { component: "other", amount: 0.1, note: "PAL" },
      { component: "other", amount: 0.05, note: "CESS" },
      { component: "other", amount: 0.9, note: "VAT" },
      { component: "other", amount: 0.2, note: "SSCL" },
    ],
    purchase: 9.5,
    freight: 2.0,
    customs: 0.4,
    pal: 0.1,
    cess: 0.05,
    vat: 0.9,
    sscl: 0.2,
    shippingOptions: [
      { mode: "LCL", unitCost: 2.0, leadDays: 16, note: "拼柜" },
      { mode: "Air", unitCost: 4.5, leadDays: 5, note: "紧急补货" },
    ],
  },
  {
    sku: "MAT-02",
    variantId: "var-mat-02",
    title: "Yoga Mat Pro",
    currency: "USD",
    suggestPrice: 18.9,
    targetMarginPct: 28,
    components: [
      { component: "purchase", amount: 5.8, note: "FOB 采购" },
      { component: "freight", amount: 1.6, note: "体积重偏高" },
      { component: "duty", amount: 0.22, note: "customs" },
      { component: "other", amount: 0.48, note: "VAT+杂费" },
    ],
    purchase: 5.8,
    freight: 1.6,
    customs: 0.22,
    pal: 0.06,
    cess: 0.02,
    vat: 0.32,
    sscl: 0.08,
    shippingOptions: [
      { mode: "LCL", unitCost: 1.6, leadDays: 20, note: "暂缓加订" },
    ],
  },
] as const

export type MockCost = (typeof MOCK_COSTS)[number]

export const MOCK_FINANCE = [
  {
    platform: "Daraz",
    platformKey: "daraz",
    revenue: 12840,
    cost: 8120,
    profit: 4720,
    margin: "36.8%",
    fees: 980,
    disabled: false,
    settlement: {
      id: "set-daraz-2026w42",
      externalSettlementId: "DZ-SET-2026W42",
      shopId: "shop-daraz-lk",
      shopName: "Daraz LK · Demo",
      periodStart: "2026-10-13",
      periodEnd: "2026-10-19",
      currency: "USD",
      lines: [
        { orderExternalId: "DZ-10012", amount: 16.4, note: "货款净额" },
        { orderExternalId: "DZ-10008", amount: 22.1, note: "货款净额" },
        { orderExternalId: "fees", amount: -180.0, note: "佣金+支付费" },
      ],
    },
  },
  {
    platform: "Lazada",
    platformKey: "lazada",
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: "—",
    fees: 0,
    disabled: true,
    settlement: null,
  },
  {
    platform: "Shopee",
    platformKey: "shopee",
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: "—",
    fees: 0,
    disabled: true,
    settlement: null,
  },
] as const

export type MockFinance = (typeof MOCK_FINANCE)[number]

/** 近 14 天订单 / 营收示例（多店合计 USD） */
export const MOCK_DASHBOARD_TREND = [
  { day: "10-08", orders: 18, revenue: 1120 },
  { day: "10-09", orders: 24, revenue: 1490 },
  { day: "10-10", orders: 21, revenue: 1380 },
  { day: "10-11", orders: 29, revenue: 1810 },
  { day: "10-12", orders: 17, revenue: 1050 },
  { day: "10-13", orders: 33, revenue: 2060 },
  { day: "10-14", orders: 27, revenue: 1690 },
  { day: "10-15", orders: 22, revenue: 1480 },
  { day: "10-16", orders: 28, revenue: 1720 },
  { day: "10-17", orders: 19, revenue: 1310 },
  { day: "10-18", orders: 31, revenue: 1980 },
  { day: "10-19", orders: 26, revenue: 1650 },
  { day: "10-20", orders: 34, revenue: 2140 },
  { day: "10-21", orders: 26, revenue: 1560 },
]

export const MOCK_DASHBOARD_KPIS = [
  { label: "GMV（近 14 天）", value: "22,440 USD", delta: "+11.4% 示例" },
  { label: "订单数", value: "355", delta: "+28 示例" },
  { label: "净利润", value: "8,160 USD", delta: "+6.8% 示例" },
  { label: "在售 SKU", value: "42", delta: "+3 示例" },
]

export const MOCK_DASHBOARD_ALERTS = [
  { type: "库存", message: "TEE-001 低于阈值（12 / 20）", href: "/console/inventory/TEE-001" },
  { type: "待审", message: "2 条动作等待确认", href: "/console/pending" },
  { type: "连接", message: "Daraz LK 最近同步正常", href: "/console/settings/shops/shop-daraz-lk" },
]

export const MOCK_DASHBOARD_TODOS = [
  { title: "确认刊登 Oversized Cotton Tee", href: "/console/pending" },
  { title: "查看 Yoga Mat 库龄预警", href: "/console/inventory/MAT-02" },
  { title: "复核本周成本定价", href: "/console/costs/TEE-001" },
]

export const MOCK_PENDING_COUNT = MOCK_PENDING.filter((p) => p.status === "pending").length
export const MOCK_INVENTORY_ALERT_COUNT = MOCK_INVENTORY_LIST_ROWS.filter((i) => i.alert).length

export function getShopById(id: string) {
  return MOCK_SHOPS.find((s) => s.id === id)
}

export function getProductBySku(sku: string) {
  return MOCK_PRODUCTS.find((p) => p.sku === sku)
}

export function getOrderById(id: string) {
  return MOCK_ORDERS.find((o) => o.id === id || o.externalOrderId === id)
}

export function getInventoryBySku(sku: string) {
  return MOCK_INVENTORY.find((i) => i.sku === sku)
}

export function getCandidateById(id: string) {
  return MOCK_CANDIDATES.find((c) => c.id === id)
}

export function getCostBySku(sku: string) {
  return MOCK_COSTS.find((c) => c.sku === sku)
}

export function getFinanceByPlatform(platformKey: string) {
  return MOCK_FINANCE.find((f) => f.platformKey === platformKey)
}

export function costLandedTotal(row: {
  purchase: number
  freight: number
  customs: number
  pal: number
  cess: number
  vat: number
  sscl: number
}) {
  return (
    row.purchase +
    row.freight +
    row.customs +
    row.pal +
    row.cess +
    row.vat +
    row.sscl
  )
}
