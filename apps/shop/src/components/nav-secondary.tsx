'use client'

import * as React from 'react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@workspace/ui/components/sidebar'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'

function isNavItemActive(pathname: string, href: string, exact = false) {
  if (!pathname || !href) return false
  if (href === '/') return pathname === '/'
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string
    url: string
    icon: React.ReactNode
    exact?: boolean
  }[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = useLocalePathname()

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent className="flex flex-col gap-4">
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={isNavItemActive(pathname, item.url, item.exact)}
              >
                <LocaleLink href={item.url}>
                  {item.icon}
                  <span>{item.title}</span>
                </LocaleLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
