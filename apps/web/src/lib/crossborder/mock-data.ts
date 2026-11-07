export const MOCK_TENANTS = [
  { id: "org_t1", name: "PK Fashion Co", slug: "pk-fashion", status: "active", shops: 2, pending: 3 },
  { id: "org_t2", name: "BD Gadgets", slug: "bd-gadgets", status: "active", shops: 1, pending: 1 },
  { id: "org_t3", name: "Demo Seller", slug: "demo-seller", status: "disabled", shops: 0, pending: 0 },
]

export const MOCK_SYNC_HEALTH = [
  { shop: "Daraz PK · Main", platform: "daraz", health: "success", lastOrders: "2026-10-20 10:12", lastInventory: "2026-10-20 10:05", error: null },
  { shop: "Daraz BD · Outlet", platform: "daraz", health: "error", lastOrders: "2026-10-19 22:01", lastInventory: "—", error: "token expired" },
  { shop: "Lazada MY (draft)", platform: "lazada", health: "idle", lastOrders: "—", lastInventory: "—", error: null },
]

export const MOCK_PENDING_ACTIONS = [
  { id: "pa_1", org: "PK Fashion Co", kind: "listing_submit", title: "刊登 SKU-TEE-001", status: "pending", createdAt: "2026-10-20 09:40" },
  { id: "pa_2", org: "BD Gadgets", kind: "price_change", title: "调价 SKU-CHG-12", status: "pending", createdAt: "2026-10-20 08:15" },
  { id: "pa_3", org: "PK Fashion Co", kind: "inventory_push", title: "推库存 SKU-TEE-001", status: "confirmed", createdAt: "2026-10-19 18:00" },
]

export const MOCK_DASHBOARD = {
  tenants: 3,
  activeShops: 2,
  pendingActions: 4,
  syncErrors: 1,
  ordersToday: 128,
  candidatesNew: 9,
}

export const CROSSBORDER_NAV = [
  { href: "/crossborder", label: "仪表盘" },
  { href: "/crossborder/tenants", label: "租户" },
  { href: "/crossborder/onboarding", label: "入驻审核" },
  { href: "/crossborder/shop-conflicts", label: "店铺冲突" },
  { href: "/crossborder/sync-health", label: "同步健康" },
  { href: "/crossborder/pending-actions", label: "待审动作" },
] as const
