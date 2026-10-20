'use client'

import * as React from 'react'
import {
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Package,
  PackageSearch,
  Settings,
  ShoppingCart,
  Sparkles,
  Warehouse,
  Wallet,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  CONSOLE_FOOTER_NAV,
  CONSOLE_NAV_GROUPS,
  type ConsoleNavItemConfig,
} from '@/lib/console-nav'
import { MOCK_INVENTORY_ALERT_COUNT, MOCK_PENDING_COUNT } from '@/lib/crossborder/mock-data'
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
import { Badge } from '@workspace/ui/components/badge'

const NAV_ICONS: Record<string, React.ReactNode> = {
  '/console/dashboard': <LayoutDashboard className="size-4" />,
  '/console/candidates': <Sparkles className="size-4" />,
  '/console/pending': <ClipboardList className="size-4" />,
  '/console/products': <Package className="size-4" />,
  '/console/orders': <ShoppingCart className="size-4" />,
  '/console/inventory': <Warehouse className="size-4" />,
  '/console/costs': <Calculator className="size-4" />,
  '/console/finance': <Wallet className="size-4" />,
  '/console/settings': <Settings className="size-4" />,
}

const BADGE_VALUES: Record<NonNullable<ConsoleNavItemConfig['badgeKey']>, number> = {
  pendingCount: MOCK_PENDING_COUNT,
  inventoryAlerts: MOCK_INVENTORY_ALERT_COUNT,
}

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

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const badge =
              item.badgeKey != null ? formatBadge(BADGE_VALUES[item.badgeKey] ?? 0) : null
            const exact = item.url === '/console/dashboard'
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={t(item.titleKey)}
                  isActive={isActive(pathname, item.url, exact)}
                >
                  <LocaleLink href={item.url}>
                    {NAV_ICONS[item.url]}
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

export function ConsoleSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations('Console')
  const mainItems = CONSOLE_NAV_GROUPS.flatMap((g) => g.items)

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
        <NavList items={mainItems} />
        <div className="mt-auto">
          <NavList items={CONSOLE_FOOTER_NAV} />
        </div>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-3 pb-2">
          <Badge variant="secondary" className="text-[10px]">
            {t('mockBadge')}
          </Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
