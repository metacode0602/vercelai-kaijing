export type SandboxNavTitleKey =
  | 'nav.quickStart'
  | 'nav.templates'
  | 'nav.usage'
  | 'nav.quota'
  | 'nav.settings'
  | 'nav.billing'
  | 'nav.recharge'
  | 'docs'

export type SandboxNavItemConfig = {
  url: string
  titleKey: SandboxNavTitleKey
  exact?: boolean
}

export const SANDBOX_ROOT_URL = '/console/sandbox'

export const SANDBOX_NAV_ITEMS: SandboxNavItemConfig[] = [
  { url: SANDBOX_ROOT_URL, titleKey: 'nav.quickStart', exact: true },
  { url: `${SANDBOX_ROOT_URL}/template`, titleKey: 'nav.templates', exact: true },
  { url: `${SANDBOX_ROOT_URL}/usage`, titleKey: 'nav.usage', exact: true },
  { url: `${SANDBOX_ROOT_URL}/quota`, titleKey: 'nav.quota', exact: true },
]

export const SANDBOX_FOOTER_NAV: SandboxNavItemConfig[] = [
  { url: `${SANDBOX_ROOT_URL}/settings`, titleKey: 'nav.settings', exact: true },
  { url: `${SANDBOX_ROOT_URL}/billing`, titleKey: 'nav.billing', exact: true },
  { url: `${SANDBOX_ROOT_URL}/recharge`, titleKey: 'nav.recharge', exact: true },
]

export const SANDBOX_DOCS_NAV: SandboxNavItemConfig = {
  url: '/console/docs',
  titleKey: 'docs',
  exact: true,
}

export function getAllSandboxNavItems(): SandboxNavItemConfig[] {
  return [...SANDBOX_NAV_ITEMS, ...SANDBOX_FOOTER_NAV, SANDBOX_DOCS_NAV]
}

export function findBestMatchingSandboxNavItem(pathname: string): SandboxNavItemConfig | undefined {
  const items = getAllSandboxNavItems().sort((a, b) => b.url.length - a.url.length)

  return items.find((item) => {
    if (item.url === SANDBOX_ROOT_URL) {
      return pathname === SANDBOX_ROOT_URL
    }

    return pathname === item.url || pathname.startsWith(`${item.url}/`)
  })
}
