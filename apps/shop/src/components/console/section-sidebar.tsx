'use client'

import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar'
import { Button } from '@workspace/ui/components/button'

type SectionItem = { url: string; titleKey: string }

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SectionSidebar({
  title,
  backHref = '/console/dashboard',
  items,
}: {
  title: string
  backHref?: string
  items: readonly SectionItem[]
}) {
  const t = useTranslations('Console')
  const pathname = useLocalePathname() ?? ''

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2 border-b border-sidebar-border p-3">
        <Button variant="ghost" size="sm" className="justify-start gap-2 px-2" asChild>
          <LocaleLink href={backHref}>
            <ArrowLeft className="size-4" />
            {t('backToWorkbench')}
          </LocaleLink>
        </Button>
        <p className="px-2 text-sm font-semibold">{title}</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(pathname, item.url)}>
                    <LocaleLink href={item.url}>
                      {t(item.titleKey as 'settings.shops' | 'settings.platformBasics' | 'settings.dictionaries' | 'settings.erpAccess' | 'nav.masterData' | 'nav.masterProducts' | 'nav.suppliers' | 'nav.warehouse' | 'nav.purchases' | 'nav.mappings' | 'nav.inventoryLedger' | 'nav.aftersales' | 'nav.reports' | 'nav.costs' | 'nav.finance' | 'nav.settings' | 'nav.imports' | 'nav.systemLog' | 'nav.accessControl' | 'nav.inventoryOverview' | 'nav.orderExceptions')}
                    </LocaleLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
