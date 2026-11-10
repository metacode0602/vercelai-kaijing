'use client'

import * as React from 'react'
import {
  ArrowLeft,
  Banknote,
  Bell,
  Building2,
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
  AlertTriangle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import type { ProfileNavTitleKey, SettingsNavGroupLabelKey, SettingsNavTitleKey } from '@/lib/console-nav'
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

type SectionItem = {
  url: string
  titleKey: SettingsNavTitleKey | ProfileNavTitleKey
}

type SectionGroup = {
  labelKey?: SettingsNavGroupLabelKey
  items: readonly SectionItem[]
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  '/settings/organization': <Building2 className="size-4" />,
  '/settings/shops': <Store className="size-4" />,
  '/settings/marketplace-apps': <KeyRound className="size-4" />,
  '/settings/platform-basics': <SlidersHorizontal className="size-4" />,
  '/settings/fx-rates': <Banknote className="size-4" />,
  '/settings/stock-alerts': <AlertTriangle className="size-4" />,
  '/settings/dictionaries': <Tags className="size-4" />,
  '/settings/imports': <Upload className="size-4" />,
  '/settings/import-templates': <FileSpreadsheet className="size-4" />,
  '/settings/integration-log': <ScrollText className="size-4" />,
  '/settings/erp-access': <ShieldCheck className="size-4" />,
  '/settings/audit': <History className="size-4" />,
  '/settings/members': <Users className="size-4" />,
  '/settings/notifications': <Bell className="size-4" />,
  '/settings/preferences': <Settings className="size-4" />,
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
  groups,
  showBrand = false,
}: {
  title: string
  backHref?: string
  groups: readonly SectionGroup[]
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
        {groups.map((group, index) => (
          <SidebarGroup key={group.labelKey ?? `group-${index}`}>
            <SidebarGroupContent>
              {group.labelKey ? (
                <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                  {t(group.labelKey)}
                </p>
              ) : null}
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(pathname, item.url)}>
                      <LocaleLink href={item.url}>
                        {getSectionIcon(item.url)}
                        <span>{t(item.titleKey)}</span>
                      </LocaleLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
