"use client"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { navigationMenuTriggerStyle } from "@workspace/ui/components/navigation-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { LocaleLink, useLocalePathname } from "@/lib/i18n/navigation"
import { ChevronDown, Globe, Menu, Monitor, ShoppingBag } from "lucide-react"
import type { ReactNode } from "react"
import { landingNav } from "../_content/landing"

const navLinks: Array<{
  label: string
  href: string
  items?: { label: string; href: string }[]
}> = landingNav.map((item) => ({
  ...item,
  href: `/${item.href}`,
}))

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://")
}

function isActivePath(pathname: string, href: string) {
  if (isExternalHref(href)) return false
  if (href.includes("#")) return false
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function mobileNavLinkClassName(active: boolean) {
  return cn(
    "h-11 w-full justify-start rounded-lg px-3 text-[15px] active:bg-accent",
    active && "bg-accent font-medium text-accent-foreground",
  )
}

function BrandMark() {
  return (
    <>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShoppingBag className="size-4" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-foreground">Open Shop</span>
    </>
  )
}

function MarketingNavLink({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  }

  return (
    <LocaleLink href={href} className={className}>
      {children}
    </LocaleLink>
  )
}

function NavDropdown({
  label,
  items,
}: {
  label: string
  items: { label: string; href: string }[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            navigationMenuTriggerStyle(),
            "rounded-full px-2.5 py-1.5",
          )}
        >
          {label}
          <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="marketing-popover">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} asChild>
            {item.href.startsWith("http") ? (
              <a href={item.href} target="_blank" rel="noopener noreferrer">
                {item.label}
              </a>
            ) : (
              <LocaleLink href={item.href}>{item.label}</LocaleLink>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MarketingHeader() {
  const pathname = useLocalePathname()

  return (
    <header
      data-slot="marketing-header"
      className="pointer-events-none fixed inset-x-0 top-0 z-[999] flex justify-center px-3 pt-3 lg:px-5 lg:pt-5"
    >
      <nav className="marketing-nav pointer-events-auto relative w-full max-w-6xl overflow-visible rounded-full">
        <div className="relative flex h-[52px] min-h-0 flex-row items-center justify-between pl-4 pr-3 sm:pl-5 lg:gap-10 lg:pl-5 lg:pr-1.5">
          <LocaleLink
            href="/"
            className="hidden h-full shrink-0 items-center justify-center gap-2 lg:flex"
            aria-label="Open Shop"
          >
            <BrandMark />
          </LocaleLink>

          <LocaleLink
            href="/"
            className="flex h-full shrink-0 items-center gap-2 lg:hidden"
            aria-label="Open Shop"
          >
            <BrandMark />
          </LocaleLink>

          <div className="hidden flex-row items-center gap-2 lg:flex">
            {navLinks.map((link) =>
              link.items && !link.href ? (
                <NavDropdown
                  key={link.label}
                  label={link.label}
                  items={link.items}
                />
              ) : (
                <Button
                  key={link.label}
                  asChild
                  variant="ghost"
                  className="rounded-full px-2.5 py-1.5 whitespace-nowrap"
                >
                  <MarketingNavLink href={link.href ?? "/"}>
                    {link.label}
                  </MarketingNavLink>
                </Button>
              ),
            )}
          </div>

          <div className="hidden h-full min-h-0 shrink-0 items-center lg:flex">
            <div className="flex flex-row items-center gap-2">
              <LocaleSwitcher />
              <Button
                asChild
                variant="ghost"
                className="h-11 rounded-full px-4"
              >
                <LocaleLink href="/signin">登录</LocaleLink>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-11 rounded-full px-4 text-primary"
              >
                <LocaleLink href="/console/dashboard" className="gap-2">
                  <Monitor className="size-4" aria-hidden="true" />
                  控制台
                </LocaleLink>
              </Button>
              <Button asChild className="h-11 rounded-full px-5">
                <LocaleLink href="/signup">免费开始</LocaleLink>
              </Button>
            </div>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="icon"
                className="size-10 shrink-0 rounded-full bg-foreground/90 text-background backdrop-blur-sm hover:bg-foreground/80 sm:size-11 lg:hidden"
                aria-label="打开菜单"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="marketing-popover data-[side=right]:w-[86vw] max-w-[340px] data-[side=right]:sm:max-w-[340px] gap-0 overflow-hidden pt-[env(safe-area-inset-top)]"
            >
              <SheetHeader className="shrink-0 pb-2 pr-14">
                <SheetTitle>菜单</SheetTitle>
                <SheetDescription className="sr-only">
                  站点导航菜单
                </SheetDescription>
              </SheetHeader>
              <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-4 pb-4">
                {navLinks.map((link) =>
                  link.href ? (
                    <Button
                      key={link.label}
                      asChild
                      variant="ghost"
                      className={mobileNavLinkClassName(
                        isActivePath(pathname, link.href),
                      )}
                      aria-current={
                        isActivePath(pathname, link.href) ? "page" : undefined
                      }
                    >
                      <MarketingNavLink href={link.href}>
                        {link.label}
                      </MarketingNavLink>
                    </Button>
                  ) : (
                    link.items?.map((item) => (
                      <Button
                        key={item.label}
                        asChild
                        variant="ghost"
                        className={mobileNavLinkClassName(
                          isActivePath(pathname, item.href),
                        )}
                        aria-current={
                          isActivePath(pathname, item.href) ? "page" : undefined
                        }
                      >
                        {item.href.startsWith("http") ? (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {item.label}
                          </a>
                        ) : (
                          <LocaleLink href={item.href}>{item.label}</LocaleLink>
                        )}
                      </Button>
                    ))
                  ),
                )}
                <div className="mt-3 flex items-center gap-2 border-t border-border/40 px-1 pt-4">
                  <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <LocaleSwitcher className="size-10" />
                </div>
              </nav>
              <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <Button asChild variant="outline" className="h-11 w-full">
                  <LocaleLink href="/signin">登录</LocaleLink>
                </Button>
                <Button asChild variant="outline" className="h-11 w-full gap-2">
                  <LocaleLink href="/console/dashboard">
                    <Monitor className="size-4" />
                    控制台
                  </LocaleLink>
                </Button>
                <Button asChild className="h-11 w-full">
                  <LocaleLink href="/signup">免费开始</LocaleLink>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
