"use client"

import * as React from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SidebarMenu, SidebarMenuItem } from "@workspace/ui/components/sidebar"
import type { SidebarNavGroup } from "@/lib/navigation/menu-config"

export function NavGroupSelect({
  groups,
  value,
  onValueChange,
}: {
  groups: SidebarNavGroup[]
  value: string | undefined
  onValueChange: (key: string) => void
}) {
  if (groups.length < 2) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger
            size="sm"
            aria-label="切换菜单分组"
            className="w-full bg-sidebar-accent/40 text-sidebar-foreground"
          >
            <SelectValue placeholder="选择分组" />
          </SelectTrigger>
          <SelectContent align="start" className="w-[var(--radix-select-trigger-width)]">
            {groups.map((group) => (
              <SelectItem key={group.key} value={group.key}>
                {group.icon}
                <span>{group.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
