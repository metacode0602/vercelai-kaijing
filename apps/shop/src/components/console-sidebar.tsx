'use client'

import * as React from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Calculator,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Container,
  FileText,
  FolderTree,
  LayoutDashboard,
  Map,
  Package,
  PackageOpen,
  PackageSearch,
  RefreshCw,
  Scale,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Tags,
  Truck,
  TrendingUp,
  Undo2,
  Warehouse,
  Wallet,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  CONSOLE_FOOTER_NAV,
  CONSOLE_NAV_GROUPS,
  type ConsoleNavItemConfig,
} from '@/lib/console-nav'
import {
  MOCK_APPROVAL_PENDING_COUNT,
  MOCK_INVENTORY_ALERT_COUNT,
  MOCK_ORDER_EXCEPTION_COUNT,
  MOCK_PENDING_COUNT,
} from '@/lib/crossborder/mock-data'
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
  '/console/pending': <ClipboardList className="size-4" />,
  '/console/candidates': <Sparkles className="size-4" />,
  '/console/master-products': <Package className="size-4" />,
  '/console/categories': <FolderTree className="size-4" />,
  '/console/master-skus': <Tags className="size-4" />,
  '/console/supplier-skus': <PackageSearch className="size-4" />,
  '/console/dictionaries': <Tags className="size-4" />,
  '/console/reviews': <Star className="size-4" />,
  '/console/listings': <Package className="size-4" />,
  '/console/mappings': <PackageSearch className="size-4" />,
  '/console/sync-tasks': <RefreshCw className="size-4" />,
  '/console/purchase-requests': <FileText className="size-4" />,
  '/console/purchase-approvals': <ClipboardCheck className="size-4" />,
  '/console/purchase-orders': <ShoppingCart className="size-4" />,
  '/console/purchase-receipts': <ArrowDownToLine className="size-4" />,
  '/console/suppliers': <Package className="size-4" />,
  '/console/inventory-balances': <Boxes className="size-4" />,
  '/console/warehouse': <Warehouse className="size-4" />,
  '/console/warehouse-zones': <Map className="size-4" />,
  '/console/stock-inbounds': <ArrowDownToLine className="size-4" />,
  '/console/stock-outbounds': <ArrowUpFromLine className="size-4" />,
  '/console/inventory-ledger': <Warehouse className="size-4" />,
  '/console/stock-adjustments': <Scale className="size-4" />,
  '/console/inventory': <Warehouse className="size-4" />,
  '/console/orders': <ShoppingCart className="size-4" />,
  '/console/order-exceptions': <ShoppingCart className="size-4" />,
  '/console/picking': <ClipboardCheck className="size-4" />,
  '/console/logistics-lgs': <Truck className="size-4" />,
  '/console/logistics-jsb': <Truck className="size-4" />,
  '/console/aftersale-cancels': <Undo2 className="size-4" />,
  '/console/aftersale-returns': <Undo2 className="size-4" />,
  '/console/costs': <Calculator className="size-4" />,
  '/console/settlements': <Wallet className="size-4" />,
  '/console/profits': <TrendingUp className="size-4" />,
  '/console/carriers': <Truck className="size-4" />,
  '/console/carton-specs': <PackageOpen className="size-4" />,
  '/console/freight': <Container className="size-4" />,
  '/console/reports': <LayoutDashboard className="size-4" />,
  '/console/products': <Package className="size-4" />,
  '/console/purchases': <ShoppingCart className="size-4" />,
  '/console/shipments': <Truck className="size-4" />,
  '/console/aftersales': <Undo2 className="size-4" />,
  '/console/finance': <Wallet className="size-4" />,
  '/console/settings/platform-basics': <Settings className="size-4" />,
  '/console/settings': <Settings className="size-4" />,
}

function getNavIcon(url: string) {
  return NAV_ICONS[url] ?? <Circle className="size-4" />
}

const BADGE_VALUES: Record<NonNullable<ConsoleNavItemConfig['badgeKey']>, number> = {
  pendingCount: MOCK_PENDING_COUNT,
  inventoryAlerts: MOCK_INVENTORY_ALERT_COUNT,
  approvalPending: MOCK_APPROVAL_PENDING_COUNT,
  orderExceptions: MOCK_ORDER_EXCEPTION_COUNT,
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
                    {getNavIcon(item.url)}
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
          <SidebarGroup key={group.groupKey}>
            <SidebarGroupContent>
              <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{t(group.labelKey)}</p>
              <NavList items={group.items} />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
