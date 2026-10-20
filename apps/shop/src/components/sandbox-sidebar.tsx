'use client'

import * as React from 'react'
import {
  BarChart3,
  CreditCard,
  FileText,
  Gauge,
  LayoutGrid,
  Rocket,
  Settings,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import { ProductSwitcher } from '@/components/product-switcher'
import {
  SANDBOX_DOCS_NAV,
  SANDBOX_FOOTER_NAV,
  SANDBOX_NAV_ITEMS,
  SANDBOX_ROOT_URL,
  type SandboxNavItemConfig,
} from '@/lib/sandbox-nav'
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
import { DollarSignIcon } from 'lucide-react'
import GPURunFullIcon from '@workspace/ui/components/icons/gpurun-full'

const NAV_ICONS: Record<string, React.ReactNode> = {
  [SANDBOX_ROOT_URL]: <Rocket className="size-4" />,
  [`${SANDBOX_ROOT_URL}/template`]: <LayoutGrid className="size-4" />,
  [`${SANDBOX_ROOT_URL}/usage`]: <BarChart3 className="size-4" />,
  [`${SANDBOX_ROOT_URL}/quota`]: <Gauge className="size-4" />,
  [`${SANDBOX_ROOT_URL}/settings`]: <Settings className="size-4" />,
  [`${SANDBOX_ROOT_URL}/billing`]: <CreditCard className="size-4" />,
  [`${SANDBOX_ROOT_URL}/recharge`]: <DollarSignIcon className="size-4" />,
  '/console/docs': <FileText className="size-4" />,
}

function toNavItems(items: SandboxNavItemConfig[], t: ReturnType<typeof useTranslations<'Sandbox'>>) {
  return items.map((item) => ({
    title: t(item.titleKey),
    url: item.url,
    icon: NAV_ICONS[item.url],
    exact: item.exact,
  }))
}

export function SandboxSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const t = useTranslations('Sandbox')

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <LocaleLink href={SANDBOX_ROOT_URL} className="mb-2 flex items-center gap-2">
                <GPURunFullIcon className="size-8 shrink-0" />
                <span className="font-semibold tracking-tight">{t('brand')}</span>
              </LocaleLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ProductSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={toNavItems(SANDBOX_NAV_ITEMS, t)} />
        <NavSecondary items={toNavItems(SANDBOX_FOOTER_NAV, t)} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavSecondary items={toNavItems([SANDBOX_DOCS_NAV], t)} />
      </SidebarFooter>
    </Sidebar>
  )
}
