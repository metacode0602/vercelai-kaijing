export type ConsoleNavTitleKey =
  | 'nav.usage'
  | 'nav.apps'
  | 'nav.templates'
  | 'nav.deployInstance'
  | 'nav.myInstances'
  | 'nav.deployServerless'
  | 'nav.myEndpoints'
  | 'nav.deployMetal'
  | 'nav.myMetalInstances'
  | 'nav.preloaded'
  | 'nav.storage'
  | 'nav.tasks'
  | 'nav.settings'
  | 'nav.billing'
  | 'nav.recharge'
  | 'docs'

export type ConsoleBreadcrumbTitleKey =
  | 'breadcrumbs.createInstance'
  | 'breadcrumbs.confirmRental'
  | 'breadcrumbs.details'

export type ConsoleNavItemConfig = {
  url: string
  titleKey: ConsoleNavTitleKey
}

export type ConsoleNavGroupConfig = {
  groupKey?: 'groups.instances' | 'groups.serverless' | 'groups.metal' | 'groups.other'
  items: ConsoleNavItemConfig[]
}

export const CONSOLE_NAV_GROUPS: ConsoleNavGroupConfig[] = [
  {
    items: [
      { url: '/console/usage', titleKey: 'nav.usage' },
      { url: '/console/apps', titleKey: 'nav.apps' },
      { url: '/console/templates', titleKey: 'nav.templates' },
    ],
  },
  {
    groupKey: 'groups.instances',
    items: [
      { url: '/console/server/list', titleKey: 'nav.deployInstance' },
      { url: '/console/server/instances', titleKey: 'nav.myInstances' },
    ],
  },
  {
    groupKey: 'groups.serverless',
    items: [
      { url: '/console/serverless/deploy', titleKey: 'nav.deployServerless' },
      { url: '/console/serverless/instances', titleKey: 'nav.myEndpoints' },
    ],
  },
  {
    groupKey: 'groups.metal',
    items: [
      { url: '/console/metal/list', titleKey: 'nav.deployMetal' },
      { url: '/console/metal/instances', titleKey: 'nav.myMetalInstances' },
    ],
  },
  {
    groupKey: 'groups.other',
    items: [
      { url: '/console/preloaded', titleKey: 'nav.preloaded' },
      { url: '/console/storage', titleKey: 'nav.storage' },
      { url: '/console/tasks', titleKey: 'nav.tasks' },
    ],
  },
]

export const CONSOLE_FOOTER_NAV: ConsoleNavItemConfig[] = [
  { url: '/console/settings', titleKey: 'nav.settings' },
  { url: '/console/billing', titleKey: 'nav.billing' },
  { url: '/console/recharge', titleKey: 'nav.recharge' },
]

export const CONSOLE_DOCS_NAV: ConsoleNavItemConfig = {
  url: '/docs',
  titleKey: 'docs',
}

export type ConsoleChildRouteConfig = {
  pattern: RegExp
  parentUrl: string
  titleKey?: ConsoleBreadcrumbTitleKey
  dynamic?: 'serverInstance' | 'serverlessEndpoint' | 'metalInstance'
}

export const CONSOLE_CHILD_ROUTES: ConsoleChildRouteConfig[] = [
  {
    pattern: /^\/server\/deploy$/,
    parentUrl: '/console/server/list',
    titleKey: 'breadcrumbs.createInstance',
  },
  {
    pattern: /^\/server\/instances\/([^/]+)$/,
    parentUrl: '/console/server/instances',
    dynamic: 'serverInstance',
  },
  {
    pattern: /^\/serverless\/instances\/([^/]+)$/,
    parentUrl: '/console/serverless/instances',
    dynamic: 'serverlessEndpoint',
  },
  {
    pattern: /^\/metal\/deploy$/,
    parentUrl: '/console/metal/list',
    titleKey: 'breadcrumbs.confirmRental',
  },
  {
    pattern: /^\/metal\/instances\/([^/]+)$/,
    parentUrl: '/console/metal/instances',
    dynamic: 'metalInstance',
  },
  {
    pattern: /^\/billing\/details$/,
    parentUrl: '/console/billing',
    titleKey: 'breadcrumbs.details',
  },
]

export type BreadcrumbSegment = {
  href?: string
  label: string
}

export function getAllConsoleNavItems(): ConsoleNavItemConfig[] {
  return [...CONSOLE_NAV_GROUPS.flatMap((group) => group.items), ...CONSOLE_FOOTER_NAV, CONSOLE_DOCS_NAV]
}

export function findNavItemByUrl(url: string): ConsoleNavItemConfig | undefined {
  return getAllConsoleNavItems().find((item) => item.url === url)
}

export function findBestMatchingNavItem(pathname: string): ConsoleNavItemConfig | undefined {
  const items = getAllConsoleNavItems().sort((a, b) => b.url.length - a.url.length)

  return items.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`))
}
