"use client"

import type { ReactNode } from "react"
import { LocaleLink, useLocalePathname } from "@/lib/i18n/navigation"
import { CROSSBORDER_SHOP_NAV } from "@/lib/crossborder/nav"
import { cn } from "@workspace/ui/lib/utils"
import {
  ClipboardList,
  Package,
  PackageSearch,
  ShoppingCart,
  Warehouse,
  CircleDollarSign,
} from "lucide-react"

const ICONS: Record<string, ReactNode> = {
  "/crossborder/candidates": <PackageSearch className="size-4" />,
  "/crossborder/pending": <ClipboardList className="size-4" />,
  "/crossborder/products": <Package className="size-4" />,
  "/crossborder/orders": <ShoppingCart className="size-4" />,
  "/crossborder/inventory": <Warehouse className="size-4" />,
  "/crossborder/costs": <CircleDollarSign className="size-4" />,
}

export function CrossborderSidebar() {
  const pathname = useLocalePathname()
  return (
    <aside className="w-56 shrink-0 border-r p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold">跨境运营 Demo</p>
        <p className="text-muted-foreground text-xs">租户工作流</p>
      </div>
      <nav className="flex flex-col gap-1">
        {CROSSBORDER_SHOP_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <LocaleLink
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {ICONS[item.href]}
              {item.label}
            </LocaleLink>
          )
        })}
      </nav>
    </aside>
  )
}
