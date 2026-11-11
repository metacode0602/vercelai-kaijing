'use client'

import { Logo } from '@/components/layout/logo'
import { NavMain } from '@/components/layout/nav-main'
import { NavUser, type SessionUser } from '@/components/layout/nav-user'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  OVERVIEW_NAV,
  SECONDARY_NAV,
  SITE_NAV_GROUPS,
} from '@/lib/navigation/site-nav'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar'

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: SessionUser }) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <LocaleLink href="/crossborder">
                <Logo className="size-8 shrink-0" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">跨境运营中枢</span>
                  <span className="text-muted-foreground truncate text-xs">
                    平台运营后台
                  </span>
                </div>
              </LocaleLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavMain items={OVERVIEW_NAV} />
          </SidebarGroupContent>
        </SidebarGroup>

        {SITE_NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavMain items={group.items} />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <NavMain items={SECONDARY_NAV} />
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
