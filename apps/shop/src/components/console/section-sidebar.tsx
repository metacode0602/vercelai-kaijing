'use client'

import { ArrowLeft, PackageSearch } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import type { ProfileNavTitleKey, SettingsNavGroupLabelKey, SettingsNavTitleKey } from '@/lib/console-nav'
import { NavIcon, type NavIconName } from '@/components/console/nav-icon'
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
import { trpc } from '@/lib/trpc/client'
import { canSeeNavItem } from '@/lib/rbac-nav'

type SectionItem = {
  url: string
  titleKey: SettingsNavTitleKey | ProfileNavTitleKey
  icon: NavIconName
}

type SectionGroup = {
  labelKey?: SettingsNavGroupLabelKey
  items: readonly SectionItem[]
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
  const accessQuery = trpc.roles.myAccess.useQuery(undefined, { staleTime: 30_000 })
  const access = accessQuery.data ?? { isOwner: true, permissions: [] as string[] }

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
        {groups.map((group, index) => {
          const visibleItems = group.items.filter((item) => canSeeNavItem(item.url, access))
          if (visibleItems.length === 0) return null
          return (
            <SidebarGroup key={group.labelKey ?? `group-${index}`}>
              <SidebarGroupContent>
                {group.labelKey ? (
                  <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                    {t(group.labelKey)}
                  </p>
                ) : null}
                <SidebarMenu>
                  {visibleItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(pathname, item.url)}>
                        <LocaleLink href={item.url}>
                          <NavIcon name={item.icon} className="size-4" />
                          <span>{t(item.titleKey)}</span>
                        </LocaleLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
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
