/**
 * Crossborder console IA, grouped by business workflow.
 * GPU legacy nav is kept in legacy-gpu-console-nav.ts (hidden from default shell).
 * @see docs/design/haoshiyun-erp-console-menu-ia.md §2
 */

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
      { url: '/console/dashboard', titleKey: 'nav.dashboard' },
      { url: '/console/pending', titleKey: 'nav.pending', badgeKey: 'pendingCount' },
      { url: '/console/candidates', titleKey: 'nav.candidates' },
    ],
  },
  {
    groupKey: 'products',
    labelKey: 'nav.productCenter',
    items: [
      { url: '/console/master-products', titleKey: 'nav.masterProducts' },
      { url: '/console/categories', titleKey: 'nav.categories' },
      { url: '/console/brands', titleKey: 'nav.brands' },
      { url: '/console/master-skus', titleKey: 'nav.masterSkus' },
      { url: '/console/supplier-skus', titleKey: 'nav.supplierSkus' },
      { url: '/console/reviews', titleKey: 'nav.reviews' },
      { url: '/console/compliance-hs-slsi', titleKey: 'nav.complianceHsSlsi' },
    ],
  },
  {
    groupKey: 'listings',
    labelKey: 'nav.listingCenter',
    items: [
      { url: '/console/listings', titleKey: 'nav.listings' },
      { url: '/console/mappings', titleKey: 'nav.mappings' },
      { url: '/console/sync-tasks', titleKey: 'nav.syncTasks' },
    ],
  },
  {
    groupKey: 'procurement',
    labelKey: 'nav.procurementCenter',
    items: [
      { url: '/console/purchase-requests', titleKey: 'nav.purchaseRequests' },
      { url: '/console/purchase-approvals', titleKey: 'nav.purchaseApprovals', badgeKey: 'approvalPending' },
      { url: '/console/purchase-orders', titleKey: 'nav.purchaseOrders' },
      { url: '/console/purchase-receipts', titleKey: 'nav.purchaseReceipts' },
      { url: '/console/suppliers', titleKey: 'nav.suppliers' },
    ],
  },
  {
    groupKey: 'warehouse',
    labelKey: 'nav.warehouseCenter',
    items: [
      { url: '/console/inventory-balances', titleKey: 'nav.inventoryBalances' },
      { url: '/console/ocean-containers', titleKey: 'nav.oceanContainers' },
      { url: '/console/carriers', titleKey: 'nav.carriers' },
      { url: '/console/carton-specs', titleKey: 'nav.cartonSpecs' },
      { url: '/console/warehouse', titleKey: 'nav.warehouse' },
      { url: '/console/warehouse-zones', titleKey: 'nav.warehouseZones' },
      { url: '/console/inventory-pools', titleKey: 'nav.inventoryPools' },
      { url: '/console/stock-inbounds', titleKey: 'nav.stockInbounds' },
      { url: '/console/stock-outbounds', titleKey: 'nav.stockOutbounds' },
      { url: '/console/inventory-ledger', titleKey: 'nav.inventoryLedger' },
      { url: '/console/stock-adjustments', titleKey: 'nav.stockAdjustments' },
      { url: '/console/inventory', titleKey: 'nav.inventoryOverview', badgeKey: 'inventoryAlerts' },
    ],
  },
  {
    groupKey: 'fulfillment',
    labelKey: 'nav.orderFulfillment',
    items: [
      { url: '/console/orders', titleKey: 'nav.orders' },
      { url: '/console/order-exceptions', titleKey: 'nav.orderExceptions', badgeKey: 'orderExceptions' },
      { url: '/console/picking', titleKey: 'nav.picking' },
      { url: '/console/logistics-lgs', titleKey: 'nav.logisticsLgs' },
      { url: '/console/logistics-jsb', titleKey: 'nav.logisticsJsb' },
    ],
  },
  {
    groupKey: 'aftersales',
    labelKey: 'nav.aftersaleCenter',
    items: [
      { url: '/console/aftersale-cancels', titleKey: 'nav.aftersaleCancels' },
      { url: '/console/aftersale-returns', titleKey: 'nav.aftersaleReturns' },
      { url: '/console/cs-inbox', titleKey: 'nav.csInbox' },
    ],
  },
  {
    groupKey: 'finance',
    labelKey: 'nav.costFinance',
    items: [
      { url: '/console/costs', titleKey: 'nav.costs' },
      { url: '/console/fee-templates', titleKey: 'nav.feeTemplates' },
      { url: '/console/settlements', titleKey: 'nav.settlements' },
      { url: '/console/profits', titleKey: 'nav.profits' },
      { url: '/console/freight-rate-cards', titleKey: 'nav.freightRateCards' },
      { url: '/console/freight', titleKey: 'nav.freight' },
    ],
  },
  {
    groupKey: 'reports',
    labelKey: 'nav.reports',
    items: [
      { url: '/console/reports', titleKey: 'nav.reports' },
      { url: '/console/reports/sell-through', titleKey: 'nav.sellThrough' },
      { url: '/console/reports/stock-risk', titleKey: 'nav.stockRisk' },
      { url: '/console/reports/attribution', titleKey: 'nav.attribution' },
    ],
  },
]

/**
 * D6 并存路由：功能与拆分页不完全一致，保留旧路由可直达，但不在主侧栏展示。
 * @see docs/design/haoshiyun-erp-console-menu-ia.md §5.3
 */
export const COEXIST_NAV: ConsoleNavItemConfig[] = [
  { url: '/console/products', titleKey: 'nav.products' },
  { url: '/console/purchases', titleKey: 'nav.purchases' },
  { url: '/console/shipments', titleKey: 'nav.shipments' },
  { url: '/console/aftersales', titleKey: 'nav.aftersales' },
  // /console/finance 已重定向至 settlements，不再并存入口
]

export const CONSOLE_FOOTER_NAV: ConsoleNavItemConfig[] = [
  { url: '/settings', titleKey: 'nav.settings' },
]

export type SettingsNavTitleKey =
  | 'settings.organization'
  | 'settings.shops'
  | 'settings.marketplaceApps'
  | 'settings.platformBasics'
  | 'settings.fxRates'
  | 'settings.stockAlerts'
  | 'settings.aftersalePolicy'
  | 'settings.dictionaries'
  | 'settings.imports'
  | 'settings.importTemplates'
  | 'settings.integrationLog'
  | 'settings.erpAccess'
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
      { url: '/settings/organization', titleKey: 'settings.organization' },
      { url: '/settings/shops', titleKey: 'settings.shops' },
      { url: '/settings/marketplace-apps', titleKey: 'settings.marketplaceApps' },
    ],
  },
  {
    groupKey: 'basics',
    labelKey: 'settings.groups.basics',
    items: [
      { url: '/settings/platform-basics', titleKey: 'settings.platformBasics' },
      { url: '/settings/dictionaries', titleKey: 'settings.dictionaries' },
      { url: '/settings/fx-rates', titleKey: 'settings.fxRates' },
      { url: '/settings/stock-alerts', titleKey: 'settings.stockAlerts' },
      { url: '/settings/aftersale-policy', titleKey: 'settings.aftersalePolicy' },
    ],
  },
  {
    groupKey: 'data',
    labelKey: 'settings.groups.data',
    items: [
      { url: '/settings/import-templates', titleKey: 'settings.importTemplates' },
    ],
  },
  {
    groupKey: 'system',
    labelKey: 'settings.groups.system',
    items: [
      { url: '/settings/integration-log', titleKey: 'settings.integrationLog' },
      { url: '/settings/erp-access', titleKey: 'settings.erpAccess' },
      { url: '/settings/audit', titleKey: 'settings.audit' },
    ],
  },
  {
    groupKey: 'team',
    labelKey: 'settings.groups.team',
    items: [
      { url: '/settings/members', titleKey: 'settings.members' },
      { url: '/settings/notifications', titleKey: 'settings.notifications' },
    ],
  },
  {
    groupKey: 'personal',
    labelKey: 'settings.groups.personal',
    items: [{ url: '/settings/preferences', titleKey: 'settings.preferences' }],
  },
]

export type ProfileNavTitleKey = 'profile.account' | 'profile.preferences'

export const PROFILE_NAV: { url: string; titleKey: ProfileNavTitleKey }[] = [
  { url: '/console/profile/account', titleKey: 'profile.account' },
  { url: '/console/profile/preferences', titleKey: 'profile.preferences' },
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
