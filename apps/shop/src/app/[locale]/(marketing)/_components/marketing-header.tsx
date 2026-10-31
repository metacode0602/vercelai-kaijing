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
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronDown, Globe, Menu, Monitor } from "lucide-react"
import type { ReactNode } from "react"
import GPURunFullIcon from "@workspace/ui/components/icons/gpurun-full"

const navLinks = [
  { label: "Agent 沙盒", href: "/sandbox" },
  { label: "Serverless", href: "/serverless" },
  { label: "裸金属", href: "/bare-metal" },
  { label: "应用", href: "/apps" },
  { label: "定价", href: "/pricing" },
  {
    label: "资源",
    href: "https://docs.gpurun.cn",
    hasDropdown: true,
    items: [
      { label: "文档", href: "https://docs.gpurun.cn" },
      { label: "博客", href: "/docs/guides/introduction" },
    ],
  },
]

function isExternalHref(href: string) {
  return href.startsWith("http://") || href.startsWith("https://")
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
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[999] flex justify-center px-3 pt-3 lg:px-5 lg:pt-5">
      <nav className="marketing-nav pointer-events-auto relative w-full max-w-6xl overflow-visible rounded-full">
        <div className="relative flex h-[52px] min-h-0 flex-row items-center justify-between pl-4 pr-3 sm:pl-5 lg:gap-10 lg:pl-5 lg:pr-1.5">
          <LocaleLink
            href="/"
            className="hidden h-full shrink-0 items-center justify-center lg:flex gap-2"
            aria-label="GPURun"
          >
            <GPURunFullIcon className="block h-6 w-auto select-none" />
            <span className="text-sm font-semibold">GPURun</span>
          </LocaleLink>

          <LocaleLink
            href="/"
            className="flex h-full shrink-0 items-center lg:hidden"
            aria-label="GPURun"
          >
            <GPURunFullIcon className="size-7 select-none" />
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
                className="h-11 rounded-full px-5"
              >
                <LocaleLink href="/signin">登录</LocaleLink>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="h-11 rounded-full px-5 text-primary"
              >
                <LocaleLink href="/console" className="gap-2">
                  <Monitor className="size-4" aria-hidden="true" />
                  控制台
                </LocaleLink>
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
            <SheetContent side="right" className="marketing-popover w-[85vw] max-w-[300px]">
              <SheetHeader>
                <SheetTitle>菜单</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1">
                {navLinks.map((link) =>
                  link.href ? (
                    <Button
                      key={link.label}
                      asChild
                      variant="ghost"
                      className="justify-start"
                    >
                      <MarketingNavLink href={link.href}>{link.label}</MarketingNavLink>
                    </Button>
                  ) : (
                    link.items?.map((item) => (
                      <Button
                        key={item.label}
                        asChild
                        variant="ghost"
                        className="justify-start"
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
                <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-4">
                  <Globe className="size-4 text-muted-foreground" />
                  <LocaleSwitcher />
                </div>
                <Button asChild variant="outline" className="mt-2">
                  <LocaleLink href="/signin">登录</LocaleLink>
                </Button>
                <Button asChild className="mt-2">
                  <LocaleLink href="/console">
                    <Monitor className="size-4" />
                    控制台
                  </LocaleLink>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  )
}
