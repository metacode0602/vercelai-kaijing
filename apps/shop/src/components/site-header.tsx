'use client'
import { Separator } from '@workspace/ui/components/separator'
import { UserNav } from '@/components/user-nav'
import { SidebarTrigger } from '@workspace/ui/components/sidebar'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@workspace/ui/components/button'
import { AccountBalanceDropdown } from '@/components/account-balance-dropdown'
import { ConsoleBreadcrumb } from '@/components/console-breadcrumb'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { SiteMessagesPanel } from '@/components/site-messages-panel'
import { ThemeToggle } from '@/components/theme-toggle'

export function SiteHeader() {
  const t = useTranslations('Common')

  return (
    <header className="flex h-(--header-height) shrink-0 items-center border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex min-w-0 flex-1 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <ConsoleBreadcrumb />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-4 lg:px-6">
        <AccountBalanceDropdown />
        <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={t('help')}>
          <HelpCircle className="size-[18px]" />
        </Button>
        <SiteMessagesPanel />
        <LocaleSwitcher />
        <UserNav />
      </div>
    </header>
  )
}
