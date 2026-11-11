import type { ReactNode } from 'react'
import React from 'react'
import {
  Activity,
  AlertTriangle,
  CircleAlert,
  Building2,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  Megaphone,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  UserRound,
  Users,
} from 'lucide-react'

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
    url: '/console',
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
        url: '/console/tenants',
        icon: <Building2 className="size-4" />,
      },
      {
        title: '入驻审核',
        url: '/console/onboarding',
        icon: <ClipboardCheck className="size-4" />,
      },
      {
        title: '店铺',
        url: '/console/shops',
        icon: <Store className="size-4" />,
      },
      {
        title: '用户',
        url: '/console/users',
        icon: <Users className="size-4" />,
      },
    ],
  },
  {
    title: '风控与同步',
    items: [
      {
        title: '店铺冲突',
        url: '/console/shop-conflicts',
        icon: <AlertTriangle className="size-4" />,
      },
      {
        title: '授权异常',
        url: '/console/auth-exceptions',
        icon: <CircleAlert className="size-4" />,
      },
      {
        title: '同步健康',
        url: '/console/sync-health',
        icon: <Activity className="size-4" />,
      },
      {
        title: '待审动作',
        url: '/console/pending-actions',
        icon: <FileClock className="size-4" />,
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

export const SETTINGS_ACCOUNT_NAV: SiteNavItem[] = [
  {
    title: '账号设置',
    url: '/settings',
    icon: <UserRound className="size-4" />,
    exact: true,
  },
]

export const SETTINGS_NAV_GROUPS: SiteNavGroup[] = [
  {
    title: '账号',
    items: SETTINGS_ACCOUNT_NAV,
  },
  {
    title: '平台管理（即将上线）',
    items: [
      {
        title: '平台配置',
        url: '/settings/platform-config',
        icon: <Settings className="size-4" />,
        soon: true,
      },
      {
        title: '操作日志',
        url: '/settings/audit-logs',
        icon: <ScrollText className="size-4" />,
        soon: true,
      },
      {
        title: '系统公告',
        url: '/settings/announcements',
        icon: <Megaphone className="size-4" />,
        soon: true,
      },
      {
        title: '角色权限',
        url: '/settings/roles',
        icon: <ShieldCheck className="size-4" />,
        soon: true,
      },
    ],
  },
]

export const ALL_SITE_NAV_ITEMS: SiteNavItem[] = [
  ...OVERVIEW_NAV,
  ...SITE_NAV_GROUPS.flatMap((group) => group.items),
  ...SECONDARY_NAV,
  ...SETTINGS_NAV_GROUPS.flatMap((group) => group.items),
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
