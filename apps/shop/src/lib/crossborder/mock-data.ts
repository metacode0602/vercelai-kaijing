export const MOCK_CANDIDATES = [
  {
    id: "c1",
    title: "Oversized Cotton Tee",
    score: 0.91,
    status: "new",
    category: "Apparel",
    landedCost: "5.60 USD",
    suggestPrice: "12.50 USD",
    margin: "38%",
  },
  {
    id: "c2",
    title: "USB-C Hub 7-in-1",
    score: 0.84,
    status: "new",
    category: "Electronics",
    landedCost: "12.30 USD",
    suggestPrice: "24.00 USD",
    margin: "32%",
  },
  {
    id: "c3",
    title: "Yoga Mat Pro",
    score: 0.72,
    status: "accepted",
    category: "Sports",
    landedCost: "8.10 USD",
    suggestPrice: "18.90 USD",
    margin: "29%",
  },
]

export const MOCK_PENDING = [
  {
    id: "pa1",
    kind: "listing_submit",
    title: "刊登 Oversized Cotton Tee",
    shop: "Daraz LK · Demo",
    status: "pending",
    createdBy: "ai-agent",
  },
  {
    id: "pa2",
    kind: "inventory_push",
    title: "推库存 SKU-HUB-01",
    shop: "Daraz LK · Demo",
    status: "pending",
    createdBy: "ai-agent",
  },
]

export const MOCK_PRODUCTS = [
  { sku: "TEE-001", title: "Oversized Cotton Tee", shop: "Daraz LK", listing: "draft", price: "12.50 USD", updatedAt: "2026-10-20" },
  { sku: "HUB-01", title: "USB-C Hub 7-in-1", shop: "Daraz LK", listing: "live", price: "24.00 USD", updatedAt: "2026-10-19" },
]

export const MOCK_ORDERS = [
  { id: "DZ-10021", shop: "Daraz LK · Demo", status: "paid", total: "36.50", placedAt: "2026-10-20 08:12", city: "Colombo" },
  { id: "DZ-10018", shop: "Daraz LK · Demo", status: "shipped", total: "24.00", placedAt: "2026-10-19 21:03", city: "Kandy" },
  { id: "DZ-10012", shop: "Daraz LK · Demo", status: "delivered", total: "18.90", placedAt: "2026-10-18 14:22", city: "Galle" },
]

export const MOCK_INVENTORY = [
  { sku: "TEE-001", onHand: 12, reserved: 3, threshold: 20, ageDays: 45, alert: "open", suggestion: "补货 80（拼柜）" },
  { sku: "HUB-01", onHand: 80, reserved: 5, threshold: 10, ageDays: 12, alert: null, suggestion: "—" },
  { sku: "MAT-02", onHand: 4, reserved: 1, threshold: 15, ageDays: 90, alert: "critical", suggestion: "闪购清仓 / 补货 40" },
]

export const MOCK_COSTS = [
  {
    sku: "TEE-001",
    purchase: 4.2,
    freight: 1.1,
    customs: 0.15,
    pal: 0.05,
    cess: 0.02,
    vat: 0.38,
    sscl: 0.08,
    currency: "USD",
  },
  {
    sku: "HUB-01",
    purchase: 9.5,
    freight: 2.0,
    customs: 0.4,
    pal: 0.1,
    cess: 0.05,
    vat: 0.9,
    sscl: 0.2,
    currency: "USD",
  },
]

export const MOCK_FINANCE = [
  { platform: "Daraz", revenue: 12840, cost: 8120, profit: 4720, margin: "36.8%" },
  { platform: "Lazada", revenue: 0, cost: 0, profit: 0, margin: "—", disabled: true },
  { platform: "Shopee", revenue: 0, cost: 0, profit: 0, margin: "—", disabled: true },
]

export const MOCK_DASHBOARD_KPIS = [
  { label: "GMV（近 7 天）", value: "12,840 USD", delta: "+8.2% 示例" },
  { label: "订单数", value: "186", delta: "+12 示例" },
  { label: "净利润", value: "4,720 USD", delta: "+5.1% 示例" },
  { label: "在售 SKU", value: "42", delta: "+3 示例" },
]

export const MOCK_DASHBOARD_ALERTS = [
  { type: "库存", message: "TEE-001 低于阈值（12 / 20）", href: "/console/inventory" },
  { type: "待审", message: "2 条动作等待确认", href: "/console/pending" },
  { type: "连接", message: "Daraz LK 最近同步正常", href: "/console/settings/shops" },
]

export const MOCK_DASHBOARD_TODOS = [
  { title: "确认刊登 Oversized Cotton Tee", href: "/console/pending" },
  { title: "查看 Yoga Mat 库龄预警", href: "/console/inventory" },
  { title: "复核本周成本定价", href: "/console/costs" },
]

export const MOCK_SHOPS = [
  {
    id: "shop-1",
    name: "Daraz LK · Demo",
    platform: "daraz",
    region: "LK",
    currency: "LKR",
    status: "connected",
    syncStatus: "ok",
    lastSyncAt: "2026-10-20 20:40",
    lastError: null as string | null,
  },
]

export const MOCK_PENDING_COUNT = MOCK_PENDING.filter((p) => p.status === "pending").length
export const MOCK_INVENTORY_ALERT_COUNT = MOCK_INVENTORY.filter((i) => i.alert).length
