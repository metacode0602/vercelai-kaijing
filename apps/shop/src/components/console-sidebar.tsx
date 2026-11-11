'use client'

import * as React from 'react'
import { PackageSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  CONSOLE_FOOTER_NAV,
  CONSOLE_NAV_GROUPS,
  type ConsoleNavItemConfig,
} from '@/lib/console-nav'
import { trpc } from '@/lib/trpc/client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import { canSeeNavItem } from '@/lib/rbac-nav'
import { Badge } from '@workspace/ui/components/badge'
import { NavIcon } from '@/components/console/nav-icon'

function formatBadge(n: number) {
  if (n <= 0) return null
  return n > 99 ? '99+' : String(n)
}

function isActive(pathname: string, href: string, exact = false) {
  if (!pathname || !href) return false
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavList({ items }: { items: ConsoleNavItemConfig[] }) {
  const t = useTranslations('Console')
  const pathname = useLocalePathname() ?? ''
  const badgesQuery = trpc.dashboard.navBadges.useQuery(undefined, { staleTime: 30_000 })
  const accessQuery = trpc.roles.myAccess.useQuery(undefined, { staleTime: 30_000 })
  const access = accessQuery.data ?? { isOwner: true, permissions: [] as string[] }
  const visibleItems = items.filter((item) => canSeeNavItem(item.url, access))
  const badgeValues: Record<NonNullable<ConsoleNavItemConfig['badgeKey']>, number> = {
    pendingCount: badgesQuery.data?.pendingCount ?? 0,
    inventoryAlerts: badgesQuery.data?.inventoryAlerts ?? 0,
    approvalPending: badgesQuery.data?.approvalPending ?? 0,
    orderExceptions: badgesQuery.data?.orderExceptions ?? 0,
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {visibleItems.map((item) => {
            const badge =
              item.badgeKey != null ? formatBadge(badgeValues[item.badgeKey] ?? 0) : null
            const exact = item.url === '/console/dashboard'
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={t(item.titleKey)}
                  isActive={isActive(pathname, item.url, exact)}
                >
                  <LocaleLink href={item.url}>
                    <NavIcon name={item.icon} className="size-4" />
                    <span>{t(item.titleKey)}</span>
                  </LocaleLink>
                </SidebarMenuButton>
                {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}


function VisibleNavGroup({ label, items }: { label: string; items: ConsoleNavItemConfig[] }) {
  const accessQuery = trpc.roles.myAccess.useQuery(undefined, { staleTime: 30_000 })
  const access = accessQuery.data ?? { isOwner: true, permissions: [] as string[] }
  const visibleItems = items.filter((item) => canSeeNavItem(item.url, access))
  if (visibleItems.length === 0) return null
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{label}</p>
        <NavList items={visibleItems} />
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function ConsoleSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations('Console')
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <LocaleLink href="/console/dashboard" className="mb-2 flex items-center gap-2">
                <PackageSearch className="size-7 shrink-0 text-primary" />
                <span className="font-semibold tracking-tight">{t('brand')}</span>
              </LocaleLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="px-3 pb-2 text-xs text-muted-foreground">{t('subtitle')}</p>
      </SidebarHeader>
      <SidebarContent>
        {CONSOLE_NAV_GROUPS.map((group) => (
          <VisibleNavGroup key={group.groupKey} label={t(group.labelKey)} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <NavList items={CONSOLE_FOOTER_NAV} />
        <div className="px-3 pb-2">
          <Badge variant="outline" className="text-[10px]">
            ERP · DB
          </Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
