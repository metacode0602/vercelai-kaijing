'use client'

import { Sparkles, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { signOut } from '@/lib/auth-client'
import { Routes } from '@/lib/routes'
import { ThemeToggle } from '@/components/theme-toggle'
import { useConsoleBreadcrumbTrail } from '@/components/console/console-breadcrumbs-context'
import { ConsoleInboxSheet } from '@/components/console/console-inbox-sheet'
import { useConsoleCopilot } from '@/components/console/console-copilot-provider'
import { ConsoleBreadcrumbs } from '@/components/console/detail/console-breadcrumbs'
import { findBestMatchingNavItem } from '@/lib/console-nav'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { SidebarTrigger } from '@workspace/ui/components/sidebar'
import { Separator } from '@workspace/ui/components/separator'

function resolveTitle(
  pathname: string,
  t: ReturnType<typeof useTranslations<'Console'>>,
): string {
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return t('pages.settings')
  if (pathname.startsWith('/console/profile')) return t('pages.profile')
  const item = findBestMatchingNavItem(pathname)
  if (!item) return t('pages.dashboard')
  return t(item.titleKey)
}

export function ConsoleTopbar() {
  const t = useTranslations('Console')
  const tc = useTranslations('Common')
  const pathname = useLocalePathname() ?? ''
  const title = resolveTitle(pathname, t)
  const breadcrumbs = useConsoleBreadcrumbTrail()
  const { open: copilotOpen, toggle: toggleCopilot } = useConsoleCopilot()

  const handleSignOut = async () => {
    await signOut()
    window.location.assign(Routes.Login)
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <div className="min-w-0 flex-1">
          <ConsoleBreadcrumbs
            items={breadcrumbs}
            className="min-w-0"
            listClassName="flex-nowrap overflow-hidden text-sm"
          />
        </div>
      ) : (
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h1>
      )}

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex" disabled>
          {t('orgSwitcher')}
        </Button>

        <ThemeToggle />

        <Button
          type="button"
          variant={copilotOpen ? 'secondary' : 'ghost'}
          size="icon"
          className="size-9"
          onClick={toggleCopilot}
          aria-label={copilotOpen ? t('copilot.close') : t('copilot.open')}
          aria-pressed={copilotOpen}
        >
          <Sparkles className="size-4" />
        </Button>

        <ConsoleInboxSheet />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9" aria-label={t('avatarMenu')}>
              <UserRound className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t('avatarMenu')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <LocaleLink href="/console/profile/account">{t('profile.account')}</LocaleLink>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <LocaleLink href="/console/profile/preferences">{t('profile.preferences')}</LocaleLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void handleSignOut()}>{tc('logout')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
