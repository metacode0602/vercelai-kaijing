/**
 * 控制台侧栏路径 → 权限模块。无 read 则隐藏对应入口。
 * owner 在调用方视为拥有全部模块。
 */

const PREFIX_MODULES: Array<{ prefix: string; module: string }> = [
  { prefix: '/console/dashboard', module: 'dashboard' },
  { prefix: '/console/pending', module: 'dashboard' },
  { prefix: '/console/candidates', module: 'dashboard' },
  { prefix: '/console/master-products', module: 'product' },
  { prefix: '/console/categories', module: 'product' },
  { prefix: '/console/brands', module: 'product' },
  { prefix: '/console/master-skus', module: 'product' },
  { prefix: '/console/supplier-skus', module: 'product' },
  { prefix: '/console/reviews', module: 'product' },
  { prefix: '/console/compliance-hs-slsi', module: 'product' },
  { prefix: '/console/listings', module: 'product' },
  { prefix: '/console/mappings', module: 'product' },
  { prefix: '/console/products', module: 'product' },
  { prefix: '/console/sync-tasks', module: 'sync' },
  { prefix: '/console/purchase-requests', module: 'purchase' },
  { prefix: '/console/purchase-approvals', module: 'purchase' },
  { prefix: '/console/purchase-orders', module: 'purchase' },
  { prefix: '/console/purchase-receipts', module: 'purchase' },
  { prefix: '/console/suppliers', module: 'purchase' },
  { prefix: '/console/purchases', module: 'purchase' },
  { prefix: '/console/inventory-balances', module: 'inventory' },
  { prefix: '/console/warehouse-zones', module: 'inventory' },
  { prefix: '/console/inventory-pools', module: 'inventory' },
  { prefix: '/console/warehouse', module: 'inventory' },
  { prefix: '/console/stock-inbounds', module: 'inventory' },
  { prefix: '/console/stock-outbounds', module: 'inventory' },
  { prefix: '/console/inventory-ledger', module: 'inventory' },
  { prefix: '/console/stock-adjustments', module: 'inventory' },
  { prefix: '/console/inventory', module: 'inventory' },
  { prefix: '/console/ocean-containers', module: 'logistics' },
  { prefix: '/console/carriers', module: 'logistics' },
  { prefix: '/console/carton-specs', module: 'logistics' },
  { prefix: '/console/logistics-lgs', module: 'logistics' },
  { prefix: '/console/logistics-jsb', module: 'logistics' },
  { prefix: '/console/shipments', module: 'logistics' },
  { prefix: '/console/orders', module: 'order' },
  { prefix: '/console/order-exceptions', module: 'order' },
  { prefix: '/console/picking', module: 'order' },
  { prefix: '/console/aftersale-cancels', module: 'aftersale' },
  { prefix: '/console/aftersale-returns', module: 'aftersale' },
  { prefix: '/console/cs-inbox', module: 'aftersale' },
  { prefix: '/console/aftersales', module: 'aftersale' },
  { prefix: '/console/costs', module: 'finance' },
  { prefix: '/console/fee-templates', module: 'finance' },
  { prefix: '/console/settlements', module: 'finance' },
  { prefix: '/console/profits', module: 'finance' },
  { prefix: '/console/freight-rate-cards', module: 'finance' },
  { prefix: '/console/freight', module: 'finance' },
  { prefix: '/console/finance', module: 'finance' },
  { prefix: '/console/reports', module: 'report' },
  { prefix: '/settings/integration-log', module: 'sync' },
  { prefix: '/settings', module: 'settings' },
]

/** 个人项始终可见，不参与模块过滤。 */
const ALWAYS_VISIBLE = new Set([
  '/settings/notifications',
  '/settings/preferences',
  '/console/profile/account',
  '/console/profile/preferences',
])

export function navItemPermissionModule(url: string): string | null {
  if (ALWAYS_VISIBLE.has(url)) return null
  const match = PREFIX_MODULES.filter((item) => url === item.prefix || url.startsWith(`${item.prefix}/`)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0]
  return match?.module ?? null
}

export function canSeeNavItem(
  url: string,
  access: { isOwner: boolean; permissions: readonly string[] },
): boolean {
  // 本轮暂不按角色隐藏入口：组织成员可看到全部已上线功能。阶段 C 再恢复 *.read 过滤。
  void url
  void access
  return true
}
