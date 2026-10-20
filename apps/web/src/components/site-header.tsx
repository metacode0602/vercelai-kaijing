"use client"

import { usePathname } from "next/navigation"

import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import { ThemeToggle } from "./theme-toggle"
import { SiteMessagesPanel } from "./site-messages"
import { SiteHeaderSearch } from "./site-header-search"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-1 data-[orientation=vertical]:h-4"
        />
        <div className="min-w-0 flex-1">
          <SiteHeaderSearch />
        </div>
        <SiteMessagesPanel />
        <ThemeToggle />
      </div>
    </header>
  )
}
