'use client'

import { Logo } from '@/components/layout/logo'
import { NavMain } from '@/components/layout/nav-main'
import { NavUser, type SessionUser } from '@/components/layout/nav-user'
import { LocaleLink } from '@/lib/i18n/navigation'
import { SETTINGS_NAV_GROUPS } from '@/lib/navigation/site-nav'
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
import { ArrowLeft } from 'lucide-react'

export function SettingsSidebar({
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
              <LocaleLink href="/settings">
                <Logo className="size-8 shrink-0" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">平台设置</span>
                  <span className="text-muted-foreground truncate text-xs">
                    账号与即将上线能力
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
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="返回运营台">
                  <LocaleLink href="/console">
                    <ArrowLeft className="size-4" />
                    <span>返回运营台</span>
                  </LocaleLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {SETTINGS_NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavMain items={group.items} />
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
