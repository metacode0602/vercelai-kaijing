'use client'

import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import { isNavItemActive, type SiteNavItem } from '@/lib/navigation/site-nav'
import {
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar'

export function NavMain({ items }: { items: SiteNavItem[] }) {
  const pathname = useLocalePathname() ?? ''

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton
            asChild
            tooltip={item.title}
            isActive={isNavItemActive(pathname, item)}
          >
            <LocaleLink href={item.url}>
              {item.icon}
              <span>{item.title}</span>
            </LocaleLink>
          </SidebarMenuButton>
          {item.soon ? (
            <SidebarMenuBadge className="text-[10px] text-muted-foreground">
              Soon
            </SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
