import {
  Activity,
  AlertTriangle,
  Building2,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'

export type SiteNavItem = {
  title: string
  url: string
  icon: ReactNode
  exact?: boolean
  soon?: boolean
}

export type SiteNavGroup = {
  title: string
  items: SiteNavItem[]
}

export const OVERVIEW_NAV: SiteNavItem[] = [
  {
    title: '运营总览',
    url: '/crossborder',
    icon: <LayoutDashboard className="size-4" />,
    exact: true,
  },
]

export const SITE_NAV_GROUPS: SiteNavGroup[] = [
  {
    title: '租户与店铺',
    items: [
      {
        title: '租户',
        url: '/crossborder/tenants',
        icon: <Building2 className="size-4" />,
      },
      {
        title: '入驻审核',
        url: '/crossborder/onboarding',
        icon: <ClipboardCheck className="size-4" />,
      },
      {
        title: '店铺',
        url: '/crossborder/shops',
        icon: <Store className="size-4" />,
      },
      {
        title: '用户',
        url: '/crossborder/users',
        icon: <Users className="size-4" />,
      },
    ],
  },
  {
    title: '风控与同步',
    items: [
      {
        title: '店铺冲突',
        url: '/crossborder/shop-conflicts',
        icon: <AlertTriangle className="size-4" />,
      },
      {
        title: '同步健康',
        url: '/crossborder/sync-health',
        icon: <Activity className="size-4" />,
      },
      {
        title: '待审动作',
        url: '/crossborder/pending-actions',
        icon: <FileClock className="size-4" />,
      },
    ],
  },
  {
    title: '平台管理（即将上线）',
    items: [
      {
        title: '平台配置',
        url: '/crossborder/platform-config',
        icon: <Settings className="size-4" />,
        soon: true,
      },
      {
        title: '操作日志',
        url: '/crossborder/audit-logs',
        icon: <ScrollText className="size-4" />,
        soon: true,
      },
      {
        title: '系统公告',
        url: '/crossborder/announcements',
        icon: <Megaphone className="size-4" />,
        soon: true,
      },
      {
        title: '角色权限',
        url: '/crossborder/roles',
        icon: <ShieldCheck className="size-4" />,
        soon: true,
      },
    ],
  },
]

export const SECONDARY_NAV: SiteNavItem[] = [
  {
    title: '设置',
    url: '/settings',
    icon: <Settings className="size-4" />,
  },
]

export const ALL_SITE_NAV_ITEMS: SiteNavItem[] = [
  ...OVERVIEW_NAV,
  ...SITE_NAV_GROUPS.flatMap((group) => group.items),
  ...SECONDARY_NAV,
]

export function findBestMatchingNavItem(
  pathname: string
): SiteNavItem | undefined {
  return ALL_SITE_NAV_ITEMS.filter(
    (item) => pathname === item.url || pathname.startsWith(`${item.url}/`)
  ).sort((a, b) => b.url.length - a.url.length)[0]
}

export function isNavItemActive(pathname: string, item: SiteNavItem) {
  if (!pathname) return false
  if (item.exact) return pathname === item.url
  return pathname === item.url || pathname.startsWith(`${item.url}/`)
}
