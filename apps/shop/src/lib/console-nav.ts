/**
 * Crossborder console IA (lean sidebar).
 * GPU legacy nav is kept in legacy-gpu-console-nav.ts (hidden from default shell).
 */

export type ConsoleNavTitleKey =
  | 'nav.dashboard'
  | 'nav.masterData'
  | 'nav.suppliers'
  | 'nav.warehouse'
  | 'nav.purchases'
  | 'nav.mappings'
  | 'nav.inventoryLedger'
  | 'nav.aftersales'
  | 'nav.reports'
  | 'nav.imports'
  | 'nav.systemLog'
  | 'nav.accessControl'
  | 'nav.candidates'
  | 'nav.pending'
  | 'nav.products'
  | 'nav.listings'
  | 'nav.orders'
  | 'nav.inventory'
  | 'nav.costs'
  | 'nav.finance'
  | 'nav.settings'

export type ConsoleNavItemConfig = {
  url: string
  titleKey: ConsoleNavTitleKey
  badgeKey?: 'pendingCount' | 'inventoryAlerts'
}

export type ConsoleNavGroupConfig = {
  groupKey?: string
  items: ConsoleNavItemConfig[]
}

export const CONSOLE_NAV_GROUPS: ConsoleNavGroupConfig[] = [
  {
    items: [
      { url: '/console/dashboard', titleKey: 'nav.dashboard' },
      { url: '/console/master-products', titleKey: 'nav.masterData' },
      { url: '/console/suppliers', titleKey: 'nav.suppliers' },
      { url: '/console/mappings', titleKey: 'nav.mappings' },
      { url: '/console/warehouse', titleKey: 'nav.warehouse' },
      { url: '/console/purchases', titleKey: 'nav.purchases' },
      { url: '/console/inventory-ledger', titleKey: 'nav.inventoryLedger' },
      { url: '/console/candidates', titleKey: 'nav.candidates' },
      { url: '/console/pending', titleKey: 'nav.pending', badgeKey: 'pendingCount' },
      { url: '/console/products', titleKey: 'nav.products' },
      { url: '/console/listings', titleKey: 'nav.listings' },
      { url: '/console/orders', titleKey: 'nav.orders' },
      { url: '/console/inventory', titleKey: 'nav.inventory', badgeKey: 'inventoryAlerts' },
      { url: '/console/costs', titleKey: 'nav.costs' },
      { url: '/console/finance', titleKey: 'nav.finance' },
      { url: '/console/aftersales', titleKey: 'nav.aftersales' },
      { url: '/console/reports', titleKey: 'nav.reports' },
      { url: '/console/imports', titleKey: 'nav.imports' },
      { url: '/console/system-log', titleKey: 'nav.systemLog' },
      { url: '/console/access-control', titleKey: 'nav.accessControl' },
    ],
  },
]

export const CONSOLE_FOOTER_NAV: ConsoleNavItemConfig[] = [
  { url: '/console/settings', titleKey: 'nav.settings' },
]

export const SETTINGS_NAV = [
  { url: '/console/settings/shops', titleKey: 'settings.shops' as const },
  { url: '/console/settings/platform-basics', titleKey: 'settings.platformBasics' as const },
  { url: '/console/settings/dictionaries', titleKey: 'settings.dictionaries' as const },
  { url: '/console/settings/credentials', titleKey: 'settings.credentials' as const },
  { url: '/console/settings/notifications', titleKey: 'settings.notifications' as const },
  { url: '/console/settings/members', titleKey: 'settings.members' as const },
  { url: '/console/settings/preferences', titleKey: 'settings.preferences' as const },
] as const

export const PROFILE_NAV = [
  { url: '/console/profile/account', titleKey: 'profile.account' as const },
  { url: '/console/profile/preferences', titleKey: 'profile.preferences' as const },
] as const

export function getAllConsoleNavItems(): ConsoleNavItemConfig[] {
  return [...CONSOLE_NAV_GROUPS.flatMap((group) => group.items), ...CONSOLE_FOOTER_NAV]
}

export function findBestMatchingNavItem(pathname: string): ConsoleNavItemConfig | undefined {
  const items = getAllConsoleNavItems().sort((a, b) => b.url.length - a.url.length)
  return items.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`))
}

export function getConsolePageTitleKey(pathname: string): string {
  if (pathname.startsWith('/console/settings')) return 'pages.settings'
  if (pathname.startsWith('/console/profile')) return 'pages.profile'
  const item = findBestMatchingNavItem(pathname)
  if (!item) return 'pages.dashboard'
  return `pages.${item.titleKey.replace('nav.', '')}`
}
