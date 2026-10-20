'use client'

import * as React from 'react'
import {
  Boxes,
  CreditCard,
  FileText,
  HardDrive,
  HardDriveDownload,
  LayoutGrid,
  ListChecks,
  Radio,
  Server,
  Settings,
  Zap,
  DollarSign,
  AppWindow,
  BarChart3,
  Building2,
  ServerCog,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import { ProductSwitcher } from '@/components/product-switcher'
import {
  CONSOLE_DOCS_NAV,
  CONSOLE_FOOTER_NAV,
  CONSOLE_NAV_GROUPS,
  type ConsoleNavItemConfig,
} from '@/lib/console-nav'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar'
import { LocaleLink } from '@/lib/i18n/navigation'
import GPURunFullIcon from '@workspace/ui/components/icons/gpurun-full'

const NAV_ICONS: Record<string, React.ReactNode> = {
  '/console/usage': <BarChart3 className="size-4" />,
  '/console/apps': <AppWindow className="size-4" />,
  '/console/templates': <LayoutGrid className="size-4" />,
  '/console/server/list': <Server className="size-4" />,
  '/console/server/instances': <Boxes className="size-4" />,
  '/console/serverless/deploy': <Zap className="size-4" />,
  '/console/serverless/instances': <Radio className="size-4" />,
  '/console/metal/list': <Building2 className="size-4" />,
  '/console/metal/instances': <ServerCog className="size-4" />,
  '/console/preloaded': <HardDriveDownload className="size-4" />,
  '/console/storage': <HardDrive className="size-4" />,
  '/console/tasks': <ListChecks className="size-4" />,
  '/console/settings': <Settings className="size-4" />,
  '/console/billing': <CreditCard className="size-4" />,
  '/console/recharge': <DollarSign className="size-4" />,
  '/console/docs': <FileText className="size-4" />,
}

function toNavItems(items: ConsoleNavItemConfig[], t: ReturnType<typeof useTranslations<'Console'>>) {
  return items.map((item) => ({
    title: t(item.titleKey),
    url: item.url,
    icon: NAV_ICONS[item.url],
  }))
}

export function ConsoleSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations('Console')

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <LocaleLink href="/console/server/list" className="mb-2 flex items-center gap-2">
                <GPURunFullIcon className="size-8 shrink-0" />
                <span className="font-semibold tracking-tight">{t('brand')}</span>
              </LocaleLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ProductSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {CONSOLE_NAV_GROUPS.map((group, index) => (
          <React.Fragment key={group.groupKey ?? `group-${index}`}>
            {group.groupKey ? (
              <SidebarMenuItem>
                <p className="mx-4 text-xs uppercase tracking-wider text-muted-foreground">{t(group.groupKey)}</p>
              </SidebarMenuItem>
            ) : null}
            <NavMain items={toNavItems(group.items, t)} />
          </React.Fragment>
        ))}
        <NavSecondary items={toNavItems(CONSOLE_FOOTER_NAV, t)} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavSecondary items={toNavItems([CONSOLE_DOCS_NAV], t)} />
      </SidebarFooter>
    </Sidebar>
  )
}
