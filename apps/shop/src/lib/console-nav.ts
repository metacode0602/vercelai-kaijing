/**
 * Crossborder console IA, grouped by business workflow.
 * GPU legacy nav is kept in legacy-gpu-console-nav.ts (hidden from default shell).
 * Every menu item carries its own distinct lucide icon, referenced by a
 * serializable `NavIconName` key so this config can cross the RSC boundary.
 * @see docs/design/haoshiyun-erp-console-menu-ia.md §2
 */

import type { NavIconName } from '@/components/console/nav-icon'

export type ConsoleNavTitleKey =
  | 'nav.dashboard'
  | 'nav.workbench'
  | 'nav.candidates'
  | 'nav.pending'
  | 'nav.productCenter'
  | 'nav.masterProducts'
  | 'nav.categories'
  | 'nav.brands'
  | 'nav.masterSkus'
  | 'nav.supplierSkus'
  | 'nav.reviews'
  | 'nav.listingCenter'
  | 'nav.listings'
  | 'nav.mappings'
  | 'nav.syncTasks'
  | 'nav.procurementCenter'
  | 'nav.purchaseRequests'
  | 'nav.purchaseApprovals'
  | 'nav.purchaseOrders'
  | 'nav.purchaseReceipts'
  | 'nav.suppliers'
  | 'nav.warehouseCenter'
  | 'nav.inventoryBalances'
  | 'nav.warehouse'
  | 'nav.warehouseZones'
  | 'nav.stockInbounds'
  | 'nav.stockOutbounds'
  | 'nav.inventoryLedger'
  | 'nav.stockAdjustments'
  | 'nav.inventoryOverview'
  | 'nav.inventoryPools'
  | 'nav.orderFulfillment'
  | 'nav.orders'
  | 'nav.orderExceptions'
  | 'nav.picking'
  | 'nav.logisticsLgs'
  | 'nav.logisticsJsb'
  | 'nav.aftersaleCenter'
  | 'nav.aftersaleCancels'
  | 'nav.aftersaleReturns'
  | 'nav.costFinance'
  | 'nav.costs'
  | 'nav.feeTemplates'
  | 'nav.settlements'
  | 'nav.profits'
  | 'nav.freight'
  | 'nav.freightRateCards'
  | 'nav.carriers'
  | 'nav.cartonSpecs'
  | 'nav.reports'
  | 'nav.oceanContainers'
  | 'nav.sellThrough'
  | 'nav.stockRisk'
  | 'nav.attribution'
  | 'nav.complianceHsSlsi'
  | 'nav.csInbox'
  | 'nav.settings'
  | 'nav.products'
  | 'nav.purchases'
  | 'nav.shipments'
  | 'nav.aftersales'
  | 'nav.finance'

export type ConsoleNavItemConfig = {
  url: string
  titleKey: ConsoleNavTitleKey
  icon: NavIconName
  badgeKey?: 'pendingCount' | 'inventoryAlerts' | 'approvalPending' | 'orderExceptions'
}

export type ConsoleNavGroupConfig = {
  groupKey:
    | 'workbench'
    | 'products'
    | 'listings'
    | 'procurement'
    | 'warehouse'
    | 'fulfillment'
    | 'aftersales'
    | 'finance'
    | 'reports'
  labelKey: ConsoleNavTitleKey
  items: ConsoleNavItemConfig[]
}

export const CONSOLE_NAV_GROUPS: ConsoleNavGroupConfig[] = [
  {
    groupKey: 'workbench',
    labelKey: 'nav.workbench',
    items: [
      { url: '/console/dashboard', titleKey: 'nav.dashboard', icon: 'layout-dashboard' },
      { url: '/console/pending', titleKey: 'nav.pending', icon: 'clipboard-list', badgeKey: 'pendingCount' },
      { url: '/console/candidates', titleKey: 'nav.candidates', icon: 'sparkles' },
    ],
  },
  {
    groupKey: 'products',
    labelKey: 'nav.productCenter',
    items: [
      { url: '/console/master-products', titleKey: 'nav.masterProducts', icon: 'package' },
      { url: '/console/categories', titleKey: 'nav.categories', icon: 'folder-tree' },
      { url: '/console/brands', titleKey: 'nav.brands', icon: 'badge-check' },
      { url: '/console/master-skus', titleKey: 'nav.masterSkus', icon: 'tags' },
      { url: '/console/supplier-skus', titleKey: 'nav.supplierSkus', icon: 'package-search' },
      { url: '/console/reviews', titleKey: 'nav.reviews', icon: 'star' },
      { url: '/console/compliance-hs-slsi', titleKey: 'nav.complianceHsSlsi', icon: 'file-badge' },
    ],
  },
  {
    groupKey: 'listings',
    labelKey: 'nav.listingCenter',
    items: [
      { url: '/console/listings', titleKey: 'nav.listings', icon: 'list-checks' },
      { url: '/console/mappings', titleKey: 'nav.mappings', icon: 'link-2' },
      { url: '/console/sync-tasks', titleKey: 'nav.syncTasks', icon: 'refresh-cw' },
    ],
  },
  {
    groupKey: 'procurement',
    labelKey: 'nav.procurementCenter',
    items: [
      { url: '/console/purchase-requests', titleKey: 'nav.purchaseRequests', icon: 'file-text' },
      { url: '/console/purchase-approvals', titleKey: 'nav.purchaseApprovals', icon: 'clipboard-check', badgeKey: 'approvalPending' },
      { url: '/console/purchase-orders', titleKey: 'nav.purchaseOrders', icon: 'shopping-cart' },
      { url: '/console/purchase-receipts', titleKey: 'nav.purchaseReceipts', icon: 'package-check' },
      { url: '/console/suppliers', titleKey: 'nav.suppliers', icon: 'factory' },
    ],
  },
  {
    groupKey: 'warehouse',
    labelKey: 'nav.warehouseCenter',
    items: [
      { url: '/console/inventory-balances', titleKey: 'nav.inventoryBalances', icon: 'boxes' },
      { url: '/console/ocean-containers', titleKey: 'nav.oceanContainers', icon: 'container' },
      { url: '/console/carriers', titleKey: 'nav.carriers', icon: 'truck' },
      { url: '/console/carton-specs', titleKey: 'nav.cartonSpecs', icon: 'package-open' },
      { url: '/console/warehouse', titleKey: 'nav.warehouse', icon: 'warehouse' },
      { url: '/console/warehouse-zones', titleKey: 'nav.warehouseZones', icon: 'map' },
      { url: '/console/inventory-pools', titleKey: 'nav.inventoryPools', icon: 'layers' },
      { url: '/console/stock-inbounds', titleKey: 'nav.stockInbounds', icon: 'arrow-down-to-line' },
      { url: '/console/stock-outbounds', titleKey: 'nav.stockOutbounds', icon: 'arrow-up-from-line' },
      { url: '/console/inventory-ledger', titleKey: 'nav.inventoryLedger', icon: 'book-open-text' },
      { url: '/console/stock-adjustments', titleKey: 'nav.stockAdjustments', icon: 'scale' },
      { url: '/console/inventory', titleKey: 'nav.inventoryOverview', icon: 'chart-pie', badgeKey: 'inventoryAlerts' },
    ],
  },
  {
    groupKey: 'fulfillment',
    labelKey: 'nav.orderFulfillment',
    items: [
      { url: '/console/orders', titleKey: 'nav.orders', icon: 'shopping-bag' },
      { url: '/console/order-exceptions', titleKey: 'nav.orderExceptions', icon: 'circle-alert', badgeKey: 'orderExceptions' },
      { url: '/console/picking', titleKey: 'nav.picking', icon: 'barcode' },
      { url: '/console/logistics-lgs', titleKey: 'nav.logisticsLgs', icon: 'route' },
      { url: '/console/logistics-jsb', titleKey: 'nav.logisticsJsb', icon: 'zap' },
    ],
  },
  {
    groupKey: 'aftersales',
    labelKey: 'nav.aftersaleCenter',
    items: [
      { url: '/console/aftersale-cancels', titleKey: 'nav.aftersaleCancels', icon: 'circle-x' },
      { url: '/console/aftersale-returns', titleKey: 'nav.aftersaleReturns', icon: 'undo-2' },
      { url: '/console/cs-inbox', titleKey: 'nav.csInbox', icon: 'inbox' },
    ],
  },
  {
    groupKey: 'finance',
    labelKey: 'nav.costFinance',
    items: [
      { url: '/console/costs', titleKey: 'nav.costs', icon: 'calculator' },
      { url: '/console/fee-templates', titleKey: 'nav.feeTemplates', icon: 'percent' },
      { url: '/console/settlements', titleKey: 'nav.settlements', icon: 'wallet' },
      { url: '/console/profits', titleKey: 'nav.profits', icon: 'trending-up' },
      { url: '/console/freight-rate-cards', titleKey: 'nav.freightRateCards', icon: 'credit-card' },
      { url: '/console/freight', titleKey: 'nav.freight', icon: 'ship' },
    ],
  },
  {
    groupKey: 'reports',
    labelKey: 'nav.reports',
    items: [
      // { url: '/console/reports', titleKey: 'nav.reports' },
      { url: '/console/reports/sell-through', titleKey: 'nav.sellThrough', icon: 'chart-line' },
      { url: '/console/reports/stock-risk', titleKey: 'nav.stockRisk', icon: 'shield-alert' },
      { url: '/console/reports/attribution', titleKey: 'nav.attribution', icon: 'target' },
    ],
  },
]

/**
 * D6 并存路由：功能与拆分页不完全一致，保留旧路由可直达，但不在主侧栏展示。
 * @see docs/design/haoshiyun-erp-console-menu-ia.md §5.3
 */
export const COEXIST_NAV: ConsoleNavItemConfig[] = [
  { url: '/console/products', titleKey: 'nav.products', icon: 'package-2' },
  { url: '/console/purchases', titleKey: 'nav.purchases', icon: 'shopping-basket' },
  { url: '/console/shipments', titleKey: 'nav.shipments', icon: 'send' },
  { url: '/console/aftersales', titleKey: 'nav.aftersales', icon: 'rotate-ccw' },
  // /console/finance 已重定向至 settlements，不再并存入口
]

export const CONSOLE_FOOTER_NAV: ConsoleNavItemConfig[] = [
  { url: '/settings', titleKey: 'nav.settings', icon: 'settings' },
]

export type SettingsNavTitleKey =
  | 'settings.organization'
  | 'settings.shops'
  | 'settings.marketplaceApps'
  | 'settings.platformBasics'
  | 'settings.fxRates'
  | 'settings.stockAlerts'
  | 'settings.shopPolicy'
  | 'settings.dictionaries'
  | 'settings.imports'
  | 'settings.importTemplates'
  | 'settings.integrationLog'
  | 'settings.erpAccess'
  | 'settings.mcpAccess'
  | 'settings.audit'
  | 'settings.members'
  | 'settings.notifications'
  | 'settings.preferences'

export type SettingsNavGroupLabelKey =
  | 'settings.groups.enterprise'
  | 'settings.groups.basics'
  | 'settings.groups.data'
  | 'settings.groups.system'
  | 'settings.groups.team'
  | 'settings.groups.personal'

export type SettingsNavItemConfig = {
  url: string
  titleKey: SettingsNavTitleKey
  icon: NavIconName
}

export type SettingsNavGroupConfig = {
  groupKey: 'enterprise' | 'basics' | 'data' | 'system' | 'team' | 'personal'
  labelKey: SettingsNavGroupLabelKey
  items: SettingsNavItemConfig[]
}

/**
 * 设置区 /settings/* 左侧菜单分组（风格与 console 主侧栏一致）。
 * @see docs/design/haoshiyun-erp-console-menu-ia.md §2.3
 */
export const SETTINGS_NAV_GROUPS: SettingsNavGroupConfig[] = [
  {
    groupKey: 'enterprise',
    labelKey: 'settings.groups.enterprise',
    items: [
      { url: '/settings/organization', titleKey: 'settings.organization', icon: 'building' },
      { url: '/settings/shops', titleKey: 'settings.shops', icon: 'store' },
      { url: '/settings/marketplace-apps', titleKey: 'settings.marketplaceApps', icon: 'key-round' },
    ],
  },
  {
    groupKey: 'basics',
    labelKey: 'settings.groups.basics',
    items: [
      { url: '/settings/platform-basics', titleKey: 'settings.platformBasics', icon: 'sliders-horizontal' },
      { url: '/settings/dictionaries', titleKey: 'settings.dictionaries', icon: 'library' },
      { url: '/settings/fx-rates', titleKey: 'settings.fxRates', icon: 'banknote' },
      { url: '/settings/stock-alerts', titleKey: 'settings.stockAlerts', icon: 'triangle-alert' },
      { url: '/settings/shop-policy', titleKey: 'settings.shopPolicy', icon: 'life-buoy' },
    ],
  },
  {
    groupKey: 'data',
    labelKey: 'settings.groups.data',
    items: [
      { url: '/settings/import-templates', titleKey: 'settings.importTemplates', icon: 'file-spreadsheet' },
    ],
  },
  {
    groupKey: 'system',
    labelKey: 'settings.groups.system',
    items: [
      { url: '/settings/integration-log', titleKey: 'settings.integrationLog', icon: 'scroll-text' },
      { url: '/settings/erp-access', titleKey: 'settings.erpAccess', icon: 'shield-check' },
      { url: '/settings/mcp-access', titleKey: 'settings.mcpAccess', icon: 'key-round' },
      { url: '/settings/audit', titleKey: 'settings.audit', icon: 'history' },
    ],
  },
  {
    groupKey: 'team',
    labelKey: 'settings.groups.team',
    items: [
      { url: '/settings/members', titleKey: 'settings.members', icon: 'users' },
      { url: '/settings/notifications', titleKey: 'settings.notifications', icon: 'bell' },
    ],
  },
  {
    groupKey: 'personal',
    labelKey: 'settings.groups.personal',
    items: [{ url: '/settings/preferences', titleKey: 'settings.preferences', icon: 'cog' }],
  },
]

export type ProfileNavTitleKey = 'profile.account' | 'profile.preferences'

export const PROFILE_NAV: { url: string; titleKey: ProfileNavTitleKey; icon: NavIconName }[] = [
  { url: '/console/profile/account', titleKey: 'profile.account', icon: 'user' },
  { url: '/console/profile/preferences', titleKey: 'profile.preferences', icon: 'user-cog' },
]

export function getAllConsoleNavItems(): ConsoleNavItemConfig[] {
  return [
    ...CONSOLE_NAV_GROUPS.flatMap((group) => group.items),
    ...COEXIST_NAV,
    ...CONSOLE_FOOTER_NAV,
  ]
}

export function findBestMatchingNavItem(pathname: string): ConsoleNavItemConfig | undefined {
  const items = getAllConsoleNavItems().sort((a, b) => b.url.length - a.url.length)
  return items.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`))
}

export function getConsolePageTitleKey(pathname: string): string {
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'pages.settings'
  if (pathname.startsWith('/console/profile')) return 'pages.profile'
  const item = findBestMatchingNavItem(pathname)
  if (!item) return 'pages.dashboard'
  return `pages.${item.titleKey.replace('nav.', '')}`
}
