"use client"

import { LocaleLink, useLocalePathname } from "@/lib/i18n/navigation"
import { CROSSBORDER_NAV } from "@/lib/crossborder/mock-data"
import { cn } from "@workspace/ui/lib/utils"

export function CrossborderNav() {
  const pathname = useLocalePathname()
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b pb-3">
      {CROSSBORDER_NAV.map((item) => {
        const active =
          item.href === "/crossborder"
            ? pathname === "/crossborder"
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <LocaleLink
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </LocaleLink>
        )
      })}
    </nav>
  )
}
