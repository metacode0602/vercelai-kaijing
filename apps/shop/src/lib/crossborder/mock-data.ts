/**
 * Console DEMO mock data.
 * Field names intentionally mirror packages/db/src/commerce-schema.ts
 * (shops, products, listings, orders, inventory_balances, stock_alerts,
 * cost_components, settlements, product_candidates, integration_*,
 * platform_brands / platform_categories).
 * No tRPC — display only.
 *
 * Canonical shop ids (cuid2) — must match packages/db/seeds/commerce-daraz-lk-shop.sql
 * so OAuth authorize `shopId` hits a real shops.id row:
 *   Daraz LK:  b5ofcwj2mzauov29y08m0q99  (slug alias: daraz-lk)
 *   Lazada MY: s8v7xkqw0asyz4zhswxwzdd3  (slug alias: lazada-my)
 *   TikTok:    kqw7alhkgefjmffogbib1z79  (slug alias: tiktok-global)
 *   Shopee SG: gw9fqrrft8zrmvri020o73mb  (preview only; no connector yet)
 */

export type MockPlatform = "daraz" | "lazada" | "shopee" | "tiktok_shop"

export type ReviewItem = {
  reviewId: string
  platform: 'daraz' | 'lazada' | 'tiktok_shop'
  itemId: string
  sku?: string
  rating: number
  title?: string
  content?: string
  contentZh?: string
  buyerName?: string
  createdAt?: string
  purchasedAt?: string
  images?: Array<{ url: string }>
  tags?: string[]
  sentiment?: 'pos' | 'neu' | 'neg' | 'void'
  source: 'api' | 'ai_scrape' | 'mixed'
}

export type ProductReviewsData = {
  product: {
    itemId: string
    sku: string
    title: string
    imageUrl?: string
    platformUrl?: string
  }
  kpis: {
    total: number
    avg: number
    pos: number
    neu: number
    neg: number
    withImage: number
  }
  ratingDist: Array<{ star: 1 | 2 | 3 | 4 | 5; count: number; pct: number; actualCount: number }>
  reviews: ReviewItem[]
  meta: {
    fetchedAt: string | null
    source: 'api' | 'ai_scrape' | 'mixed' | null
    totalFetched: number
    deduped: number
  }
}

export const MOCK_SHOPS = [
  {
    id: "b5ofcwj2mzauov29y08m0q99",
    slug: "daraz-lk",
    name: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    region: "LK",
    marketplaceCountry: "lk",
    currency: "LKR",
    timezone: "Asia/Colombo",
    sellerName: "Open Shop LK Seller",
    externalShopId: "dz-lk-88021",
    status: "active",
    syncStatus: "success",
    health: "success",
    lastSyncAt: "2026-10-20 20:40",
    lastOrdersSyncAt: "2026-10-20 20:40",
    lastInventorySyncAt: "2026-10-20 20:38",
    lastProductsSyncAt: "2026-10-20 20:35",
    lastListingsSyncAt: "2026-10-20 20:36",
    authExpiresAt: "2026-12-01",
    lastError: null as string | null,
    credentialKind: "oauth",
    credentialMask: "····a91f",
    credentialExpiresAt: "2026-12-01",
    meta: { sellerFlags: ["crossborder"], warehouseDefault: "CMB-01" },
  },
  {
    id: "s8v7xkqw0asyz4zhswxwzdd3",
    slug: "lazada-my",
    name: "Lazada MY · Sandbox",
    platform: "lazada" as MockPlatform,
    region: "MY",
    marketplaceCountry: "my",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
    sellerName: "Open Shop MY Sandbox",
    externalShopId: "lz-my-10288",
    status: "connecting",
    syncStatus: "idle",
    health: "idle",
    lastSyncAt: "—",
    lastOrdersSyncAt: null as string | null,
    lastInventorySyncAt: null as string | null,
    lastProductsSyncAt: null as string | null,
    lastListingsSyncAt: null as string | null,
    authExpiresAt: null as string | null,
    lastError: "OAuth pending merchant approval（示例）",
    credentialKind: "oauth",
    credentialMask: "····pending",
    credentialExpiresAt: null as string | null,
    meta: { sandbox: true },
  },
  {
    id: "kqw7alhkgefjmffogbib1z79",
    slug: "tiktok-global",
    name: "TikTok Shop · Demo",
    platform: "tiktok_shop" as MockPlatform,
    region: "GLOBAL",
    marketplaceCountry: "global",
    currency: "USD",
    timezone: "UTC",
    sellerName: "Open Shop TTS Demo",
    externalShopId: "tts-748812",
    status: "draft",
    syncStatus: "idle",
    health: "idle",
    lastSyncAt: "—",
    lastOrdersSyncAt: null as string | null,
    lastInventorySyncAt: null as string | null,
    lastProductsSyncAt: null as string | null,
    lastListingsSyncAt: null as string | null,
    authExpiresAt: null as string | null,
    lastError: null as string | null,
    credentialKind: "oauth",
    credentialMask: "····none",
    credentialExpiresAt: null as string | null,
    meta: { shopCipherHint: "TTS_*" },
  },
  {
    id: "gw9fqrrft8zrmvri020o73mb",
    slug: "shopee-sg",
    name: "Shopee SG · Preview",
    platform: "shopee" as MockPlatform,
    region: "SG",
    marketplaceCountry: "sg",
    currency: "SGD",
    timezone: "Asia/Singapore",
    sellerName: "Open Shop SG Preview",
    externalShopId: "sp-sg-44102",
    status: "error",
    syncStatus: "error",
    health: "error",
    lastSyncAt: "2026-10-18 09:12",
    lastOrdersSyncAt: "2026-10-18 09:12",
    lastInventorySyncAt: "2026-10-17 22:01",
    lastProductsSyncAt: null as string | null,
    lastListingsSyncAt: null as string | null,
    authExpiresAt: "2026-11-15",
    lastError: "API rate limit · retry after 3600s（示例）",
    credentialKind: "api_key",
    credentialMask: "····7c2e",
    credentialExpiresAt: "2026-11-15",
    meta: { connector: "pending" },
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
    recommendedShops: ["b5ofcwj2mzauov29y08m0q99"],
    aiSignals: ["高搜索意图", "低退货类目", "可拼柜"],
    evidenceStatus: "assumption" as const,
    evidenceLabel: "示例数据 · 待核实",
    evidenceSources: [
      { label: "市场需求", status: "assumption", detail: "示例内容，未附原始搜索数据" },
      { label: "运费/税率", status: "estimated", detail: "使用演示输入，需复核有效报价和税率" },
    ],
    reviewReason: "市场需求和报价数据尚未提供可核验来源。",
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
    recommendedShops: ["b5ofcwj2mzauov29y08m0q99", "s8v7xkqw0asyz4zhswxwzdd3"],
    aiSignals: ["竞品价差 8%", "需样品质检", "HS 8544 提示"],
    evidenceStatus: "estimated" as const,
    evidenceLabel: "估算 · 待补证",
    evidenceSources: [
      { label: "竞品价差", status: "assumption", detail: "演示差异，需补竞品链接和采集时间" },
      { label: "成本", status: "estimated", detail: "需核实供应商报价、物流和平台费用" },
    ],
    reviewReason: "请确认产品兼容性、样品质量，并补充竞品和采购报价证据。",
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
    recommendedShops: ["b5ofcwj2mzauov29y08m0q99"],
    aiSignals: ["库龄≥90d", "建议闪购", "暂缓加订"],
    evidenceStatus: "assumption" as const,
    evidenceLabel: "示例数据 · 待核实",
    evidenceSources: [
      { label: "库存风险", status: "assumption", detail: "示例库存信号，并非实时店铺数据" },
      { label: "利润", status: "estimated", detail: "示例成本口径，需核实实际费用" },
    ],
    reviewReason: "当前库存和销售数据为示例，不应据此下补货或促销决策。",
  },
] as const

export type MockCandidate = (typeof MOCK_CANDIDATES)[number]

/** Demo-only candidate review state. This does not write to a backend. */
export const MOCK_CANDIDATE_REVIEW_STATE: Record<string, { decision: string; reason: string }> = {}

export const MOCK_PENDING = [
  {
    id: "pa1",
    kind: "listing_submit",
    title: "刊登 Oversized Cotton Tee",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    shop: "Daraz LK · Demo",
    status: "pending",
    createdBy: "ai-agent",
    expiresAt: "2026-10-22 18:00",
  },
  {
    id: "pa2",
    kind: "inventory_push",
    title: "推库存 SKU-HUB-01",
    shopId: "b5ofcwj2mzauov29y08m0q99",
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
    brand: "OpenBasics",
    categoryHint: "Apparel > Men > T-Shirts",
    barcode: "8901001001001",
    attrs: { color: "Black", size: "L" },
    images: [
      { url: "https://cdn.example.com/tee-001-main.jpg", sort: 0 },
      { url: "https://cdn.example.com/tee-001-back.jpg", sort: 1 },
    ],
    weightGrams: 220,
    lengthMm: 280,
    widthMm: 200,
    heightMm: 20,
    updatedAt: "2026-10-20",
    aiSignals: ["选品分 0.91", "建议补货拼柜"],
    listings: [
      {
        id: "lst-tee-daraz",
        shopId: "b5ofcwj2mzauov29y08m0q99",
        shopName: "Daraz LK · Demo",
        platform: "daraz" as MockPlatform,
        status: "draft",
        publishState: "INACTIVE",
        title: "Oversized Cotton Tee · Black L",
        priceAmount: 12.5,
        priceCurrency: "USD",
        platformSku: "DZ-TEE-001",
        externalItemId: null as string | null,
        brandExternalId: "br-openbasics",
        brandName: "OpenBasics",
        categoryExternalId: "cat-apparel-tee",
        categoryPath: "Fashion > Men > T-Shirts",
        stockOnHand: 12,
        warehouseCode: "CMB-01",
        logisticsChannel: "Daraz Standard",
        lastError: null as string | null,
        submittedAt: null as string | null,
        liveAt: null as string | null,
        updatedAt: "2026-10-20",
        payload: { description: "200gsm cotton tee", images: ["https://cdn.example.com/tee-001-main.jpg"] },
      },
      {
        id: "lst-tee-lazada",
        shopId: "s8v7xkqw0asyz4zhswxwzdd3",
        shopName: "Lazada MY · Sandbox",
        platform: "lazada" as MockPlatform,
        status: "pending_review",
        publishState: "PENDING",
        title: "Oversized Cotton Tee",
        priceAmount: 55.0,
        priceCurrency: "MYR",
        platformSku: "LZ-TEE-001",
        externalItemId: "lz-item-991002",
        brandExternalId: "br-openbasics-my",
        brandName: "OpenBasics",
        categoryExternalId: "cat-fashion",
        categoryPath: "Fashion > Men > Tops",
        stockOnHand: 0,
        warehouseCode: "KUL-SBX",
        logisticsChannel: "Lazada Dropshipping",
        lastError: null as string | null,
        submittedAt: "2026-10-19 11:20",
        liveAt: null as string | null,
        updatedAt: "2026-10-19",
        payload: { qcStatus: "pending" },
      },
      {
        id: "lst-tee-white-daraz",
        shopId: "b5ofcwj2mzauov29y08m0q99",
        shopName: "Daraz LK · Demo",
        platform: "daraz" as MockPlatform,
        status: "live",
        publishState: "ACTIVE",
        title: "Oversized Cotton Tee · White L",
        priceAmount: 12.9,
        priceCurrency: "USD",
        platformSku: "DZ-TEE-001-WH",
        externalItemId: "dz-item-tee-wh" as string | null,
        brandExternalId: "br-openbasics",
        brandName: "OpenBasics",
        categoryExternalId: "cat-apparel-tee",
        categoryPath: "Fashion > Men > T-Shirts",
        stockOnHand: 8,
        warehouseCode: "CMB-01",
        logisticsChannel: "Daraz Standard",
        lastError: null as string | null,
        submittedAt: "2026-10-12 09:00" as string | null,
        liveAt: "2026-10-13 11:00" as string | null,
        updatedAt: "2026-10-18",
        payload: { description: "White L variant (mock)", note: "示例数据 · 对应内部 SKU HSY000001002" },
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
    brand: "LinkForge",
    categoryHint: "Electronics > Computer Accessories",
    barcode: "8901001002002",
    attrs: { ports: "7", pd: "100W" },
    images: [{ url: "https://cdn.example.com/hub-01.jpg", sort: 0 }],
    weightGrams: 95,
    lengthMm: 110,
    widthMm: 45,
    heightMm: 15,
    updatedAt: "2026-10-19",
    aiSignals: ["在售健康", "竞品价差收窄"],
    listings: [
      {
        id: "lst-hub-daraz",
        shopId: "b5ofcwj2mzauov29y08m0q99",
        shopName: "Daraz LK · Demo",
        platform: "daraz" as MockPlatform,
        status: "live",
        publishState: "ACTIVE",
        title: "USB-C Hub 7-in-1 PD 100W",
        priceAmount: 24.0,
        priceCurrency: "USD",
        platformSku: "DZ-HUB-01",
        externalItemId: "dz-item-550881",
        brandExternalId: "br-linkforge",
        brandName: "LinkForge",
        categoryExternalId: "cat-electronics-hub",
        categoryPath: "Electronics > Computer Accessories > Hubs",
        stockOnHand: 80,
        warehouseCode: "CMB-01",
        logisticsChannel: "Daraz Express",
        lastError: null as string | null,
        submittedAt: "2026-10-10 09:00",
        liveAt: "2026-10-11 14:22",
        updatedAt: "2026-10-19",
        payload: { itemId: "dz-item-550881", skus: ["DZ-HUB-01"] },
      },
      {
        id: "lst-hub-tiktok",
        shopId: "kqw7alhkgefjmffogbib1z79",
        shopName: "TikTok Shop · Demo",
        platform: "tiktok_shop" as MockPlatform,
        status: "draft",
        publishState: "DRAFT",
        title: "USB-C Hub 7-in-1",
        priceAmount: 26.9,
        priceCurrency: "USD",
        platformSku: "TTS-HUB-01",
        externalItemId: null as string | null,
        brandExternalId: "tts-br-linkforge",
        brandName: "LinkForge",
        categoryExternalId: "600001",
        categoryPath: "Electronics > Accessories",
        stockOnHand: 0,
        warehouseCode: "TTS-GLOBAL",
        logisticsChannel: "TikTok FBT",
        lastError: null as string | null,
        submittedAt: null as string | null,
        liveAt: null as string | null,
        updatedAt: "2026-10-18",
        payload: { needsShopCipher: true },
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
    brand: "FlexFlow",
    categoryHint: "Sports > Yoga",
    barcode: "8901001003003",
    attrs: { thickness: "6mm", material: "TPE" },
    images: [{ url: "https://cdn.example.com/mat-02.jpg", sort: 0 }],
    weightGrams: 1100,
    lengthMm: 1830,
    widthMm: 610,
    heightMm: 6,
    updatedAt: "2026-10-18",
    aiSignals: ["库龄预警", "建议闪购"],
    listings: [
      {
        id: "lst-mat-daraz",
        shopId: "b5ofcwj2mzauov29y08m0q99",
        shopName: "Daraz LK · Demo",
        platform: "daraz" as MockPlatform,
        status: "live",
        publishState: "ACTIVE",
        title: "Yoga Mat Pro 6mm TPE",
        priceAmount: 18.9,
        priceCurrency: "USD",
        platformSku: "DZ-MAT-02",
        externalItemId: "dz-item-441120",
        brandExternalId: "br-flexflow",
        brandName: "FlexFlow",
        categoryExternalId: "cat-sports-mat",
        categoryPath: "Sports & Outdoors > Yoga > Mats",
        stockOnHand: 4,
        warehouseCode: "CMB-01",
        logisticsChannel: "Daraz Standard",
        lastError: null as string | null,
        submittedAt: "2026-09-01 10:00",
        liveAt: "2026-09-02 16:40",
        updatedAt: "2026-10-18",
        payload: { itemId: "dz-item-441120" },
      },
      {
        id: "lst-mat-shopee",
        shopId: "gw9fqrrft8zrmvri020o73mb",
        shopName: "Shopee SG · Preview",
        platform: "shopee" as MockPlatform,
        status: "failed",
        publishState: "REJECTED",
        title: "Yoga Mat Pro",
        priceAmount: 26.9,
        priceCurrency: "SGD",
        platformSku: "SP-MAT-02",
        externalItemId: null as string | null,
        brandExternalId: null as string | null,
        brandName: "FlexFlow",
        categoryExternalId: "cat-sports",
        categoryPath: "Sports > Yoga",
        stockOnHand: 0,
        warehouseCode: "SG-01",
        logisticsChannel: "Shopee Standard",
        lastError: "Category mapping rejected（示例）",
        submittedAt: "2026-10-17 08:30",
        liveAt: null as string | null,
        updatedAt: "2026-10-17",
        payload: { rejectCode: "CATEGORY_MISMATCH" },
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
    shopId: primary.shopId,
    platform: primary.platform,
    shopCount: p.listings.length,
    listing: primary.status,
    priceAmount: primary.priceAmount,
    priceCurrency: primary.priceCurrency,
    price: `${primary.priceAmount.toFixed(2)} ${primary.priceCurrency}`,
    updatedAt: p.updatedAt,
    lastError: primary.lastError,
  }
})

/** Flattened listings for /console/listings (mirrors enriched listings columns). */
export const MOCK_LISTINGS = MOCK_PRODUCTS.flatMap((p) =>
  p.listings.map((l) => ({
    id: l.id,
    productId: p.id,
    sku: p.sku,
    variantId: p.variantId,
    productTitle: p.title,
    brand: p.brand,
    shopId: l.shopId,
    shopName: l.shopName,
    platform: l.platform,
    status: l.status,
    publishState: l.publishState,
    title: l.title,
    externalItemId: l.externalItemId,
    brandExternalId: l.brandExternalId,
    brandName: l.brandName,
    categoryExternalId: l.categoryExternalId,
    categoryPath: l.categoryPath,
    priceAmount: l.priceAmount,
    priceCurrency: l.priceCurrency,
    stockOnHand: l.stockOnHand,
    warehouseCode: l.warehouseCode,
    logisticsChannel: l.logisticsChannel,
    platformSku: l.platformSku,
    lastError: l.lastError,
    submittedAt: l.submittedAt,
    liveAt: l.liveAt,
    updatedAt: l.updatedAt,
    payload: l.payload,
  })),
)

export type MockListing = (typeof MOCK_LISTINGS)[number]

export const MOCK_LISTING_LIST_ROWS = MOCK_LISTINGS.map((l) => ({
  id: l.id,
  title: l.title,
  sku: l.sku,
  shop: l.shopName,
  shopId: l.shopId,
  platform: l.platform,
  status: l.status,
  publishState: l.publishState,
  brandName: l.brandName ?? "—",
  categoryPath: l.categoryPath ?? "—",
  externalItemId: l.externalItemId ?? "—",
  stockOnHand: l.stockOnHand ?? 0,
  warehouseCode: l.warehouseCode ?? "—",
  logisticsChannel: l.logisticsChannel ?? "—",
  priceAmount: l.priceAmount,
  priceCurrency: l.priceCurrency,
  updatedAt: l.updatedAt,
  lastError: l.lastError,
}))

export const MOCK_PLATFORM_BRANDS = [
  {
    id: "pb-1",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    platform: "daraz" as MockPlatform,
    externalId: "br-openbasics",
    name: "OpenBasics",
  },
  {
    id: "pb-2",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    platform: "daraz" as MockPlatform,
    externalId: "br-linkforge",
    name: "LinkForge",
  },
  {
    id: "pb-3",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    platform: "daraz" as MockPlatform,
    externalId: "br-flexflow",
    name: "FlexFlow",
  },
  {
    id: "pb-4",
    shopId: "s8v7xkqw0asyz4zhswxwzdd3",
    platform: "lazada" as MockPlatform,
    externalId: "br-openbasics-my",
    name: "OpenBasics",
  },
  {
    id: "pb-5",
    shopId: "kqw7alhkgefjmffogbib1z79",
    platform: "tiktok_shop" as MockPlatform,
    externalId: "tts-br-linkforge",
    name: "LinkForge",
  },
] as const

export const MOCK_PLATFORM_CATEGORIES = [
  {
    id: "pc-1",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    platform: "daraz" as MockPlatform,
    externalId: "cat-apparel-tee",
    name: "T-Shirts",
    path: "Fashion > Men > T-Shirts",
    leaf: "true",
  },
  {
    id: "pc-2",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    platform: "daraz" as MockPlatform,
    externalId: "cat-electronics-hub",
    name: "Hubs",
    path: "Electronics > Computer Accessories > Hubs",
    leaf: "true",
  },
  {
    id: "pc-3",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    platform: "daraz" as MockPlatform,
    externalId: "cat-sports-mat",
    name: "Mats",
    path: "Sports & Outdoors > Yoga > Mats",
    leaf: "true",
  },
] as const


export const MOCK_ORDERS = [
  {
    id: "ord-10021",
    externalOrderId: "DZ-10021",
    shopId: "b5ofcwj2mzauov29y08m0q99",
    shopName: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    status: "paid",
    platformStatus: "pending",
    fulfillmentStatus: "unfulfilled",
    buyerNameMask: "N****a",
    buyerRegion: "Western · Colombo",
    city: "Colombo",
    paymentMethod: "COD",
    shippingProvider: "Daraz Logistics",
    trackingNumber: null as string | null,
    packageId: null as string | null,
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
        fulfillmentStatus: "unfulfilled",
        packageId: null as string | null,
        trackingNumber: null as string | null,
        shippingProvider: null as string | null,
      },
      {
        id: "ol-10021-2",
        sku: "HUB-01",
        title: "USB-C Hub 7-in-1",
        qty: 1,
        unitPrice: 11.5,
        platformSku: "DZ-HUB-01",
        fulfillmentStatus: "unfulfilled",
        packageId: null as string | null,
        trackingNumber: null as string | null,
        shippingProvider: null as string | null,
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
    shopId: "b5ofcwj2mzauov29y08m0q99",
    shopName: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    status: "shipped",
    platformStatus: "shipped",
    fulfillmentStatus: "shipped",
    buyerNameMask: "K****i",
    buyerRegion: "Central · Kandy",
    city: "Kandy",
    paymentMethod: "Visa",
    shippingProvider: "Daraz Express",
    trackingNumber: "DZLK9981",
    packageId: "PKG-DZ-10018",
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
        fulfillmentStatus: "shipped",
        packageId: "PKG-DZ-10018",
        trackingNumber: "DZLK9981",
        shippingProvider: "Daraz Express",
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
    shopId: "b5ofcwj2mzauov29y08m0q99",
    shopName: "Daraz LK · Demo",
    platform: "daraz" as MockPlatform,
    status: "delivered",
    platformStatus: "delivered",
    fulfillmentStatus: "delivered",
    buyerNameMask: "S****a",
    buyerRegion: "Southern · Galle",
    city: "Galle",
    paymentMethod: "COD",
    shippingProvider: "Daraz Logistics",
    trackingNumber: "DZLK7712",
    packageId: "PKG-DZ-10012",
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
        fulfillmentStatus: "delivered",
        packageId: "PKG-DZ-10012",
        trackingNumber: "DZLK7712",
        shippingProvider: "Daraz Logistics",
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
    shopId: "s8v7xkqw0asyz4zhswxwzdd3",
    shopName: "Lazada MY · Sandbox",
    platform: "lazada" as MockPlatform,
    status: "created",
    platformStatus: "unpaid",
    fulfillmentStatus: "unfulfilled",
    buyerNameMask: "A****n",
    buyerRegion: "WP · Kuala Lumpur",
    city: "Kuala Lumpur",
    paymentMethod: null as string | null,
    shippingProvider: null as string | null,
    trackingNumber: null as string | null,
    packageId: null as string | null,
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
        fulfillmentStatus: "unfulfilled",
        packageId: null as string | null,
        trackingNumber: null as string | null,
        shippingProvider: null as string | null,
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
  {
    id: "ord-tts-901",
    externalOrderId: "TTS-901",
    shopId: "kqw7alhkgefjmffogbib1z79",
    shopName: "TikTok Shop · Demo",
    platform: "tiktok_shop" as MockPlatform,
    status: "ready_to_ship",
    platformStatus: "AWAITING_SHIPMENT",
    fulfillmentStatus: "ready_to_ship",
    buyerNameMask: "T****k",
    buyerRegion: "US · CA",
    city: "Los Angeles",
    paymentMethod: "TikTok Pay",
    shippingProvider: "TikTok FBT",
    trackingNumber: null as string | null,
    packageId: "PKG-TTS-901",
    shippingSummary: "LA · FBT · awaiting label（示例）",
    placedAt: "2026-10-20 12:40",
    paidAt: "2026-10-20 12:41",
    currency: "USD",
    totalAmount: 26.9,
    shippingAmount: 0,
    lines: [
      {
        id: "ol-tts-1",
        sku: "HUB-01",
        title: "USB-C Hub 7-in-1",
        qty: 1,
        unitPrice: 26.9,
        platformSku: "TTS-HUB-01",
        fulfillmentStatus: "ready_to_ship",
        packageId: "PKG-TTS-901",
        trackingNumber: null as string | null,
        shippingProvider: "TikTok FBT",
      },
    ],
    timeline: [
      { at: "2026-10-20 12:40", status: "created", note: "平台下单" },
      { at: "2026-10-20 12:41", status: "paid", note: "已付款" },
      { at: "2026-10-20 13:00", status: "ready_to_ship", note: "待打单（当前）", current: true },
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
  shopId: o.shopId,
  platform: o.platform,
  status: o.status,
  platformStatus: o.platformStatus,
  fulfillmentStatus: o.fulfillmentStatus,
  paymentMethod: o.paymentMethod,
  shippingProvider: o.shippingProvider,
  trackingNumber: o.trackingNumber,
  buyerRegion: o.buyerRegion,
  total: o.totalAmount.toFixed(2),
  totalAmount: o.totalAmount,
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
        shopId: "b5ofcwj2mzauov29y08m0q99",
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
        shopId: "s8v7xkqw0asyz4zhswxwzdd3",
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
        shopId: "b5ofcwj2mzauov29y08m0q99",
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
        shopId: "b5ofcwj2mzauov29y08m0q99",
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
        shopId: "gw9fqrrft8zrmvri020o73mb",
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
      shopId: "b5ofcwj2mzauov29y08m0q99",
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

export type DashboardTrendRange = 7 | 30 | 90

export type DashboardTrendPoint = {
  day: string
  orders: number
  revenue: number
  units: number
  aov: number
  refundRate: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
}

/** Deterministic mock series ending 2026-10-21 (box-local demo date). */
function buildDashboardTrend(days: number): DashboardTrendPoint[] {
  const end = Date.UTC(2026, 9, 21) // Oct is month 9
  const points: DashboardTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(end - i * 86_400_000)
    const mm = String(t.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(t.getUTCDate()).padStart(2, "0")
    // Stable pseudo-random from day index
    const n = days - i
    const wave = Math.sin(n / 3.2) * 26 + Math.cos(n / 5.1) * 18
    const weekend = t.getUTCDay() === 0 || t.getUTCDay() === 6 ? -24 : 12
    const orders = Math.max(150, Math.round(260 + wave + weekend + (n % 7) * 6 - 18))
    const aov = Math.round(690 + Math.sin(n / 4.7) * 28 + (n % 5) * 4)
    const revenue = orders * aov
    const units = Math.round(orders * (1.55 + (n % 4) * 0.06))
    const refundRate = Number((2.8 + Math.abs(Math.sin(n / 4.3)) * 1.8).toFixed(1))
    const grossMargin = Number((26 + Math.sin(n / 6) * 2.2 + (n % 3) * 0.2).toFixed(1))
    const netMargin = Number((grossMargin - (11 + Math.cos(n / 5) * 1.2)).toFixed(1))
    const grossProfit = Math.round((revenue * grossMargin) / 100)
    const netProfit = Math.round((revenue * netMargin) / 100)
    points.push({
      day: `${mm}-${dd}`,
      orders,
      revenue,
      units,
      aov,
      refundRate,
      grossProfit,
      grossMargin,
      netProfit,
      netMargin,
    })
  }
  return points
}

export const MOCK_DASHBOARD_TREND_BY_RANGE: Record<DashboardTrendRange, DashboardTrendPoint[]> = {
  7: buildDashboardTrend(7),
  30: buildDashboardTrend(30),
  90: buildDashboardTrend(90),
}

/** @deprecated Prefer MOCK_DASHBOARD_TREND_BY_RANGE[7]; kept for callers expecting 近 N 天 default. */
export const MOCK_DASHBOARD_TREND = MOCK_DASHBOARD_TREND_BY_RANGE[7]

export function getDashboardTrend(range: DashboardTrendRange = 7): DashboardTrendPoint[] {
  return MOCK_DASHBOARD_TREND_BY_RANGE[range]
}

export type DashboardSummary = {
  revenue: number
  orders: number
  units: number
  aov: number
  refundRate: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
}

export function getDashboardSummary(range: DashboardTrendRange = 7): DashboardSummary {
  const points = getDashboardTrend(range)
  const revenue = points.reduce((sum, point) => sum + point.revenue, 0)
  const orders = points.reduce((sum, point) => sum + point.orders, 0)
  const units = points.reduce((sum, point) => sum + point.units, 0)
  const grossProfit = points.reduce((sum, point) => sum + point.grossProfit, 0)
  const netProfit = points.reduce((sum, point) => sum + point.netProfit, 0)
  const refundRate =
    points.reduce((sum, point) => sum + point.refundRate, 0) / Math.max(points.length, 1)

  return {
    revenue,
    orders,
    units,
    aov: Math.round(revenue / Math.max(orders, 1)),
    refundRate: Number(refundRate.toFixed(1)),
    grossProfit,
    grossMargin: Number(((grossProfit / Math.max(revenue, 1)) * 100).toFixed(1)),
    netProfit,
    netMargin: Number(((netProfit / Math.max(revenue, 1)) * 100).toFixed(1)),
  }
}

export const MOCK_DASHBOARD_KPI_DELTAS = {
  revenue: { value: "+8.2%", tone: "positive" as const },
  orders: { value: "+6.1%", tone: "positive" as const },
  units: { value: "+5.4%", tone: "positive" as const },
  aov: { value: "+2.0%", tone: "positive" as const },
  refundRate: { value: "-0.4pp", tone: "positive" as const },
  grossProfit: { value: "+9.1%", tone: "positive" as const },
  netProfit: { value: "+5.1%", tone: "positive" as const },
}

export const MOCK_DASHBOARD_PLATFORM_MIX = [
  { platform: "Daraz LK", share: 82 },
  { platform: "Daraz MY", share: 12 },
  { platform: "未开通 / 其他", share: 6 },
] as const

export const MOCK_DASHBOARD_INVENTORY = {
  totalStock: 8420,
  turnoverDays: 28.6,
  shortageSkuCount: 6,
  inTransitUnits: 2300,
  categories: [
    { category: "服饰", stock: 3200, inTransit: 900, turnoverDays: 32 },
    { category: "3C 配件", stock: 2100, inTransit: 600, turnoverDays: 24 },
    { category: "家居", stock: 1800, inTransit: 450, turnoverDays: 30 },
    { category: "运动户外", stock: 1320, inTransit: 350, turnoverDays: 21 },
  ],
  shortages: [
    { sku: "TEE-001", title: "Oversized Cotton Tee", gap: 8, eta: "2026-11-03" },
    { sku: "HUB-01", title: "USB-C Hub 7-in-1", gap: 14, eta: "2026-11-05" },
    { sku: "MAT-02", title: "Yoga Mat Pro", gap: 6, eta: "2026-11-02" },
    { sku: "BAG-03", title: "Canvas Tote Bag", gap: 21, eta: "2026-11-08" },
    { sku: "LMP-04", title: "LED Desk Lamp", gap: 5, eta: "2026-11-06" },
    { sku: "SOK-05", title: "Cotton Crew Socks", gap: 32, eta: "2026-11-10" },
  ],
}

/** SKU presets for landed-cost calculator Demo（箱规 / HS / 默认批量） */
export const MOCK_COST_CALC_PRESETS = [
  {
    sku: "TEE-001",
    title: "Oversized Cotton Tee",
    fobUnit: 4.2,
    units: 500,
    unitsPerCarton: 50,
    cartonLcm: 60,
    cartonWcm: 40,
    cartonHcm: 35,
    kgPerCarton: 12,
    airVolumetricDivisor: 6000,
    firstMileTotal: 80,
    clearanceMiscTotal: 45,
    tariffProfileId: "apparel" as const,
    hsHint: "6109.10",
    lastMileUnit: 0.6,
    platformCommissionPct: 8,
    paymentFeePct: 2.5,
    defaultMarginPct: 20,
  },
  {
    sku: "HUB-01",
    title: "USB-C Hub 7-in-1",
    fobUnit: 9.5,
    units: 400,
    unitsPerCarton: 40,
    cartonLcm: 50,
    cartonWcm: 35,
    cartonHcm: 30,
    kgPerCarton: 10,
    airVolumetricDivisor: 6000,
    firstMileTotal: 95,
    clearanceMiscTotal: 55,
    tariffProfileId: "electronics" as const,
    hsHint: "8471.80",
    lastMileUnit: 0.8,
    platformCommissionPct: 6,
    paymentFeePct: 2.5,
    defaultMarginPct: 20,
  },
  {
    sku: "MAT-02",
    title: "Yoga Mat Pro",
    fobUnit: 5.8,
    units: 300,
    unitsPerCarton: 20,
    cartonLcm: 70,
    cartonWcm: 25,
    cartonHcm: 25,
    kgPerCarton: 14,
    airVolumetricDivisor: 6000,
    firstMileTotal: 70,
    clearanceMiscTotal: 40,
    tariffProfileId: "home_sports" as const,
    hsHint: "9506.91",
    lastMileUnit: 1.2,
    platformCommissionPct: 8,
    paymentFeePct: 2.5,
    defaultMarginPct: 20,
  },
] as const

export type MockCostCalcPreset = (typeof MOCK_COST_CALC_PRESETS)[number]

export function getCostCalcPreset(sku: string) {
  return MOCK_COST_CALC_PRESETS.find((p) => p.sku === sku) ?? MOCK_COST_CALC_PRESETS[0]!
}

export const MOCK_DASHBOARD_ALERTS = [
  { type: "库存", message: "TEE-001 低于阈值（12 / 20）", href: "/console/inventory/TEE-001" },
  { type: "待审", message: "2 条动作等待确认", href: "/console/pending" },
  { type: "连接", message: "Daraz LK 最近同步正常", href: "/console/settings/shops/b5ofcwj2mzauov29y08m0q99" },
]

export const MOCK_DASHBOARD_TODOS = [
  { title: "确认刊登 Oversized Cotton Tee", href: "/console/pending" },
  { title: "查看 Yoga Mat 库龄预警", href: "/console/inventory/MAT-02" },
  { title: "复核本周成本定价", href: "/console/costs/TEE-001" },
]

export const MOCK_PENDING_COUNT = MOCK_PENDING.filter((p) => p.status === "pending").length
export const MOCK_INVENTORY_ALERT_COUNT = MOCK_INVENTORY_LIST_ROWS.filter((i) => i.alert).length
export const MOCK_APPROVAL_PENDING_COUNT = 2
export const MOCK_ORDER_EXCEPTION_COUNT = 4


export function getListingById(id: string) {
  return MOCK_LISTINGS.find((l) => l.id === id)
}

export function getShopById(id: string) {
  return MOCK_SHOPS.find((s) => s.id === id || s.slug === id)
}

export function getProductBySku(sku: string) {
  return MOCK_PRODUCTS.find((p) => p.sku === sku) ?? null
}

export const MOCK_PRODUCT_REVIEWS: Record<string, ProductReviewsData> = {
  'TEE-001': {
    product: {
      itemId: '593629355',
      sku: 'TEE-001',
      title: 'DIY Luminous T13 Multi-Jointed Movable Shapeshift Robot 3D Printed Mannequin',
      imageUrl: 'https://lk-live-21.slatic.net/kf/Sa899876a2a1a445b8eaf1abd6623ac8dO.png',
      platformUrl: 'https://www.daraz.lk/products/diy-luminous-t13-multi-jointed-movable-shapeshift-robot-3d-printed-mannequin-lucky-robot-and-dog-action-figures-toys-kids-gifts-i593629355-s2725029270.html',
    },
    kpis: { total: 26, avg: 4.69, pos: 12, neu: 4, neg: 6, withImage: 16 },
    ratingDist: [
      { star: 5, count: 28, pct: 87.5, actualCount: 22 },
      { star: 4, count: 1, pct: 3.1, actualCount: 1 },
      { star: 3, count: 2, pct: 6.2, actualCount: 2 },
      { star: 2, count: 1, pct: 3.1, actualCount: 1 },
      { star: 1, count: 0, pct: 0, actualCount: 0 },
    ],
    reviews: [
      {
        reviewId: 'r1',
        platform: 'daraz',
        itemId: '593629355',
        sku: 'Color:Blue, Size:25cm',
        rating: 5,
        content: 'Do not buy this. The quality of the product is very poor. Not worth for the price.',
        contentZh: '（5星但内容差评）别买。产品质量非常差，这个价格完全不值。',
        buyerName: '******008',
        createdAt: '25 May 2026',
        images: [],
        tags: ['高分差评'],
        sentiment: 'neg',
        source: 'api',
      },
      {
        reviewId: 'r2',
        platform: 'daraz',
        itemId: '593629355',
        sku: 'Color:green, Size:25cm',
        rating: 5,
        content: 'Poor quality. Parts do not fit together. Waste of money.',
        contentZh: '（5星但内容差评）谁都别买这个，根本装不起来，零件之间对不上，纯属浪费钱。',
        buyerName: '0***5',
        createdAt: '14 Mar 2026',
        images: [{ url: 'https://lzd-u.slatic.net/673d9b56d688469bb78bbc76bd917cd8_740dabaf59894162bf99801b9dfc2ce7.jpg' }],
        tags: ['高分差评'],
        sentiment: 'neg',
        source: 'api',
      },
      {
        reviewId: 'r3',
        platform: 'daraz',
        itemId: '593629355',
        sku: 'Color:Yellow, Size:25cm',
        rating: 5,
        content: 'I ordered yellow but got orange. Good product but plastic quality is low.',
        contentZh: '我下单的是黄色，发来的是橙色。东西本身确实不错，但塑料质感偏低。',
        buyerName: '0***4',
        createdAt: '27 Apr 2026',
        images: [
          { url: 'https://lzd-u.slatic.net/41479ebde8a04c559cd913045925a140_a9f34d9537264c6e8cd95688094824c0.jpg' },
          { url: 'https://lzd-u.slatic.net/41479ebde8a04c559cd913045925a140_8b15a3e9c1f74fe2b23c92f1df8af639.jpg' },
        ],
        tags: [],
        sentiment: 'neu',
        source: 'api',
      },
      {
        reviewId: 'r4',
        platform: 'daraz',
        itemId: '593629355',
        sku: 'Color:DEEP BLUE, Size:25cm',
        rating: 5,
        content: 'Good product. Material is smooth but size is smaller than described.',
        contentZh: '东西不错，材质有点像橡胶，摸起来很顺滑。但是尺寸不对，标 25cm 实际大概只有 15cm。',
        buyerName: 'Hijas',
        createdAt: '07 Apr 2026',
        images: [{ url: 'https://lzd-u.slatic.net/d586aba1f47044cf9e704bc7922d49b3_5045d8d965d843eab95ddbf4766fb3c1.jpg' }],
        tags: [],
        sentiment: 'neu',
        source: 'api',
      },
    ],
    meta: { fetchedAt: '2026-10-28T06:32:00Z', source: 'api', totalFetched: 26, deduped: 26 },
  },
}

export function getProductReviewsBySku(sku: string): ProductReviewsData | null {
  return MOCK_PRODUCT_REVIEWS[sku] ?? null
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
