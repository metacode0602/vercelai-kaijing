/**
 * Crossborder console IA, grouped by business workflow.
 * GPU legacy nav is kept in legacy-gpu-console-nav.ts (hidden from default shell).
 * Every menu item carries its own distinct lucide icon.
 * @see docs/design/haoshiyun-erp-console-menu-ia.md §2
 */

import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Banknote,
  Barcode,
  Bell,
  BookOpenText,
  Boxes,
  Building,
  Calculator,
  ChartLine,
  ChartPie,
  CircleAlert,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Container,
  CreditCard,
  Factory,
  FileBadge,
  FileSpreadsheet,
  FileText,
  FolderTree,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Layers,
  Library,
  LifeBuoy,
  Link2,
  ListChecks,
  Map,
  Package,
  Package2,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Percent,
  RefreshCw,
  RotateCcw,
  Route,
  Scale,
  ScrollText,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Ship,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Tags,
  Target,
  TrendingUp,
  TriangleAlert,
  Truck,
  Undo2,
  User,
  UserCog,
  Users,
  Warehouse,
  Wallet,
  Zap,
} from 'lucide-react'

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
  icon: LucideIcon
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
      { url: '/console/dashboard', titleKey: 'nav.dashboard', icon: LayoutDashboard },
      { url: '/console/pending', titleKey: 'nav.pending', icon: ClipboardList, badgeKey: 'pendingCount' },
      { url: '/console/candidates', titleKey: 'nav.candidates', icon: Sparkles },
    ],
  },
  {
    groupKey: 'products',
    labelKey: 'nav.productCenter',
    items: [
      { url: '/console/master-products', titleKey: 'nav.masterProducts', icon: Package },
      { url: '/console/categories', titleKey: 'nav.categories', icon: FolderTree },
      { url: '/console/brands', titleKey: 'nav.brands', icon: BadgeCheck },
      { url: '/console/master-skus', titleKey: 'nav.masterSkus', icon: Tags },
      { url: '/console/supplier-skus', titleKey: 'nav.supplierSkus', icon: PackageSearch },
      { url: '/console/reviews', titleKey: 'nav.reviews', icon: Star },
      { url: '/console/compliance-hs-slsi', titleKey: 'nav.complianceHsSlsi', icon: FileBadge },
    ],
  },
  {
    groupKey: 'listings',
    labelKey: 'nav.listingCenter',
    items: [
      { url: '/console/listings', titleKey: 'nav.listings', icon: ListChecks },
      { url: '/console/mappings', titleKey: 'nav.mappings', icon: Link2 },
      { url: '/console/sync-tasks', titleKey: 'nav.syncTasks', icon: RefreshCw },
    ],
  },
  {
    groupKey: 'procurement',
    labelKey: 'nav.procurementCenter',
    items: [
      { url: '/console/purchase-requests', titleKey: 'nav.purchaseRequests', icon: FileText },
      { url: '/console/purchase-approvals', titleKey: 'nav.purchaseApprovals', icon: ClipboardCheck, badgeKey: 'approvalPending' },
      { url: '/console/purchase-orders', titleKey: 'nav.purchaseOrders', icon: ShoppingCart },
      { url: '/console/purchase-receipts', titleKey: 'nav.purchaseReceipts', icon: PackageCheck },
      { url: '/console/suppliers', titleKey: 'nav.suppliers', icon: Factory },
    ],
  },
  {
    groupKey: 'warehouse',
    labelKey: 'nav.warehouseCenter',
    items: [
      { url: '/console/inventory-balances', titleKey: 'nav.inventoryBalances', icon: Boxes },
      { url: '/console/ocean-containers', titleKey: 'nav.oceanContainers', icon: Container },
      { url: '/console/carriers', titleKey: 'nav.carriers', icon: Truck },
      { url: '/console/carton-specs', titleKey: 'nav.cartonSpecs', icon: PackageOpen },
      { url: '/console/warehouse', titleKey: 'nav.warehouse', icon: Warehouse },
      { url: '/console/warehouse-zones', titleKey: 'nav.warehouseZones', icon: Map },
      { url: '/console/inventory-pools', titleKey: 'nav.inventoryPools', icon: Layers },
      { url: '/console/stock-inbounds', titleKey: 'nav.stockInbounds', icon: ArrowDownToLine },
      { url: '/console/stock-outbounds', titleKey: 'nav.stockOutbounds', icon: ArrowUpFromLine },
      { url: '/console/inventory-ledger', titleKey: 'nav.inventoryLedger', icon: BookOpenText },
      { url: '/console/stock-adjustments', titleKey: 'nav.stockAdjustments', icon: Scale },
      { url: '/console/inventory', titleKey: 'nav.inventoryOverview', icon: ChartPie, badgeKey: 'inventoryAlerts' },
    ],
  },
  {
    groupKey: 'fulfillment',
    labelKey: 'nav.orderFulfillment',
    items: [
      { url: '/console/orders', titleKey: 'nav.orders', icon: ShoppingBag },
      { url: '/console/order-exceptions', titleKey: 'nav.orderExceptions', icon: CircleAlert, badgeKey: 'orderExceptions' },
      { url: '/console/picking', titleKey: 'nav.picking', icon: Barcode },
      { url: '/console/logistics-lgs', titleKey: 'nav.logisticsLgs', icon: Route },
      { url: '/console/logistics-jsb', titleKey: 'nav.logisticsJsb', icon: Zap },
    ],
  },
  {
    groupKey: 'aftersales',
    labelKey: 'nav.aftersaleCenter',
    items: [
      { url: '/console/aftersale-cancels', titleKey: 'nav.aftersaleCancels', icon: CircleX },
      { url: '/console/aftersale-returns', titleKey: 'nav.aftersaleReturns', icon: Undo2 },
      { url: '/console/cs-inbox', titleKey: 'nav.csInbox', icon: Inbox },
    ],
  },
  {
    groupKey: 'finance',
    labelKey: 'nav.costFinance',
    items: [
      { url: '/console/costs', titleKey: 'nav.costs', icon: Calculator },
      { url: '/console/fee-templates', titleKey: 'nav.feeTemplates', icon: Percent },
      { url: '/console/settlements', titleKey: 'nav.settlements', icon: Wallet },
      { url: '/console/profits', titleKey: 'nav.profits', icon: TrendingUp },
      { url: '/console/freight-rate-cards', titleKey: 'nav.freightRateCards', icon: CreditCard },
      { url: '/console/freight', titleKey: 'nav.freight', icon: Ship },
    ],
  },
  {
    groupKey: 'reports',
    labelKey: 'nav.reports',
    items: [
      // { url: '/console/reports', titleKey: 'nav.reports' },
      { url: '/console/reports/sell-through', titleKey: 'nav.sellThrough', icon: ChartLine },
      { url: '/console/reports/stock-risk', titleKey: 'nav.stockRisk', icon: ShieldAlert },
      { url: '/console/reports/attribution', titleKey: 'nav.attribution', icon: Target },
    ],
  },
]

/**
 * D6 并存路由：功能与拆分页不完全一致，保留旧路由可直达，但不在主侧栏展示。
 * @see docs/design/haoshiyun-erp-console-menu-ia.md §5.3
 */
export const COEXIST_NAV: ConsoleNavItemConfig[] = [
  { url: '/console/products', titleKey: 'nav.products', icon: Package2 },
  { url: '/console/purchases', titleKey: 'nav.purchases', icon: ShoppingBasket },
  { url: '/console/shipments', titleKey: 'nav.shipments', icon: Send },
  { url: '/console/aftersales', titleKey: 'nav.aftersales', icon: RotateCcw },
  // /console/finance 已重定向至 settlements，不再并存入口
]

export const CONSOLE_FOOTER_NAV: ConsoleNavItemConfig[] = [
  { url: '/settings', titleKey: 'nav.settings', icon: Settings },
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
  icon: LucideIcon
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
      { url: '/settings/organization', titleKey: 'settings.organization', icon: Building },
      { url: '/settings/shops', titleKey: 'settings.shops', icon: Store },
      { url: '/settings/marketplace-apps', titleKey: 'settings.marketplaceApps', icon: KeyRound },
    ],
  },
  {
    groupKey: 'basics',
    labelKey: 'settings.groups.basics',
    items: [
      { url: '/settings/platform-basics', titleKey: 'settings.platformBasics', icon: SlidersHorizontal },
      { url: '/settings/dictionaries', titleKey: 'settings.dictionaries', icon: Library },
      { url: '/settings/fx-rates', titleKey: 'settings.fxRates', icon: Banknote },
      { url: '/settings/stock-alerts', titleKey: 'settings.stockAlerts', icon: TriangleAlert },
      { url: '/settings/aftersale-policy', titleKey: 'settings.aftersalePolicy', icon: LifeBuoy },
    ],
  },
  {
    groupKey: 'data',
    labelKey: 'settings.groups.data',
    items: [
      { url: '/settings/import-templates', titleKey: 'settings.importTemplates', icon: FileSpreadsheet },
    ],
  },
  {
    groupKey: 'system',
    labelKey: 'settings.groups.system',
    items: [
      { url: '/settings/integration-log', titleKey: 'settings.integrationLog', icon: ScrollText },
      { url: '/settings/erp-access', titleKey: 'settings.erpAccess', icon: ShieldCheck },
      { url: '/settings/audit', titleKey: 'settings.audit', icon: History },
    ],
  },
  {
    groupKey: 'team',
    labelKey: 'settings.groups.team',
    items: [
      { url: '/settings/members', titleKey: 'settings.members', icon: Users },
      { url: '/settings/notifications', titleKey: 'settings.notifications', icon: Bell },
    ],
  },
  {
    groupKey: 'personal',
    labelKey: 'settings.groups.personal',
    items: [{ url: '/settings/preferences', titleKey: 'settings.preferences', icon: Cog }],
  },
]

export type ProfileNavTitleKey = 'profile.account' | 'profile.preferences'

export const PROFILE_NAV: { url: string; titleKey: ProfileNavTitleKey; icon: LucideIcon }[] = [
  { url: '/console/profile/account', titleKey: 'profile.account', icon: User },
  { url: '/console/profile/preferences', titleKey: 'profile.preferences', icon: UserCog },
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
