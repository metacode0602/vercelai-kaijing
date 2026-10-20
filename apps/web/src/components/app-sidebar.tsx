"use client"

import * as React from "react"

import { NavGroupSelect } from "@/components/nav-group-select"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser, type NavUserPublic } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import GPURunFullIcon from "@workspace/ui/components/icons/gpurun-full"
import { websiteConfig } from "@/lib/config/website"
import type { AppRole } from "@/lib/auth/app-role"
import { useLocalePathname, useLocaleRouter, LocaleLink } from "@/lib/i18n/navigation"
import {
  groupForPathname,
  SIDEBAR_GROUP_COOKIE_MAX_AGE,
  SIDEBAR_GROUP_COOKIE_NAME,
} from "@/lib/navigation/menu-config"
import { getSidebarGroups, getSidebarSecondaryItems } from "@/lib/navigation/sidebar-menu"

export function AppSidebar({
  user,
  role,
  defaultGroupKey,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: NavUserPublic | null
  role?: AppRole | null
  defaultGroupKey?: string | null
}) {
  const groups = React.useMemo(() => getSidebarGroups(role ?? null), [role])
  const secondaryItems = React.useMemo(() => getSidebarSecondaryItems(role ?? null), [role])
  const pathname = useLocalePathname()
  const router = useLocaleRouter()
  const [preferredKey, setPreferredKey] = React.useState(defaultGroupKey ?? undefined)

  // 当前路由命中的分组优先，其次是用户上次选择，最后兜底到第一个有权限的分组
  const activeGroup =
    groupForPathname(pathname, groups) ?? groups.find((group) => group.key === preferredKey) ?? groups[0]

  const handleGroupChange = React.useCallback(
    (key: string) => {
      setPreferredKey(key)
      document.cookie = `${SIDEBAR_GROUP_COOKIE_NAME}=${key}; path=/; max-age=${SIDEBAR_GROUP_COOKIE_MAX_AGE}; samesite=lax`
      const next = groups.find((group) => group.key === key)
      // 目标分组不包含当前页面时才跳转，避免在同一分组内切菜单被重置回落地页
      if (next?.landingUrl && groupForPathname(pathname, groups)?.key !== key) {
        router.push(next.landingUrl)
      }
    },
    [groups, pathname, router],
  )

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <LocaleLink href="/" className="flex items-center gap-2">
                <GPURunFullIcon className="size-8 shrink-0" />
                <span className="font-bold gradient-text">{websiteConfig.metadata.title}</span>
              </LocaleLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavGroupSelect
          groups={groups}
          value={activeGroup?.key}
          onValueChange={handleGroupChange}
        />
      </SidebarHeader>
      <SidebarContent>
        {activeGroup?.sections.map((section) => (
          <React.Fragment key={section.key}>
            {section.label ? (
              <SidebarMenuItem>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mx-8">
                  {section.label}
                </p>
              </SidebarMenuItem>
            ) : null}
            <NavSecondary items={section.items} />
          </React.Fragment>
        ))}
        <NavSecondary items={secondaryItems} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
