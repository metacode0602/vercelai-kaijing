'use client'

import * as React from 'react'
import {
  ArrowLeft,
  Banknote,
  Bell,
  Circle,
  FileSpreadsheet,
  KeyRound,
  PackageSearch,
  ScrollText,
  History,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Tags,
  Upload,
  User,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar'
import { Button } from '@workspace/ui/components/button'

type SectionItem = { url: string; titleKey: string }

const SECTION_ICONS: Record<string, React.ReactNode> = {
  '/console/settings/shops': <Store className="size-4" />,
  '/console/settings/credentials': <KeyRound className="size-4" />,
  '/console/settings/platform-basics': <SlidersHorizontal className="size-4" />,
  '/console/settings/fx-rates': <Banknote className="size-4" />,
  '/console/dictionaries': <Tags className="size-4" />,
  '/console/settings/dictionaries': <Tags className="size-4" />,
  '/console/settings/imports': <Upload className="size-4" />,
  '/console/settings/import-templates': <FileSpreadsheet className="size-4" />,
  '/console/settings/integration-log': <ScrollText className="size-4" />,
  '/console/settings/erp-access': <ShieldCheck className="size-4" />,
  '/console/settings/audit': <History className="size-4" />,
  '/console/settings/members': <Users className="size-4" />,
  '/console/settings/notifications': <Bell className="size-4" />,
  '/console/settings/preferences': <Settings className="size-4" />,
  '/console/profile/account': <User className="size-4" />,
  '/console/profile/preferences': <Settings className="size-4" />,
}

function getSectionIcon(url: string) {
  return SECTION_ICONS[url] ?? <Circle className="size-4" />
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SectionSidebar({
  title,
  backHref = '/console/dashboard',
  items,
  showBrand = false,
}: {
  title: string
  backHref?: string
  items: readonly SectionItem[]
  showBrand?: boolean
}) {
  const t = useTranslations('Console')
  const pathname = useLocalePathname() ?? ''

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2 border-b border-sidebar-border p-3">
        {showBrand ? (
          <div className="flex flex-col gap-0.5">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
                  <LocaleLink href="/console/dashboard" className="flex items-center gap-2">
                    <PackageSearch className="size-6 shrink-0 text-primary" />
                    <span className="font-semibold tracking-tight">{t('brand')}</span>
                  </LocaleLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <p className="px-2 text-xs text-muted-foreground">{t('subtitle')}</p>
          </div>
        ) : null}
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
                      {getSectionIcon(item.url)}
                      <span>{t(item.titleKey as 'settings.shops' | 'settings.platformBasics' | 'settings.fxRates' | 'settings.dictionaries' | 'settings.imports' | 'settings.importTemplates' | 'settings.integrationLog' | 'settings.erpAccess' | 'settings.audit' | 'settings.credentials' | 'settings.notifications' | 'settings.members' | 'settings.preferences' | 'profile.account' | 'profile.preferences')}</span>
                    </LocaleLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <Button variant="ghost" size="sm" className="justify-start gap-2 px-2" asChild>
          <LocaleLink href={backHref}>
            <ArrowLeft className="size-4" />
            {t('backToWorkbench')}
          </LocaleLink>
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
