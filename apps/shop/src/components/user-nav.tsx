'use client'

import { Avatar, AvatarFallback } from '@workspace/ui/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { authClient } from '@/lib/auth-client'
import { Routes } from '@/lib/routes'
import {
  CreditCardIcon,
  LogInIcon,
  LogOutIcon,
  SettingsIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'

function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'U'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  return trimmed.slice(0, 2).toUpperCase()
}

export function UserNav() {
  const t = useTranslations('Common')
  const router = useLocaleRouter()
  const { data: session } = authClient.useSession()

  if (!session?.user) {
    return (
      <LocaleLink href={Routes.Login}>
        <Avatar className="size-8 cursor-pointer rounded-full">
          <AvatarFallback className="bg-accent text-accent-foreground">
            <LogInIcon className="size-4" />
          </AvatarFallback>
        </Avatar>
      </LocaleLink>
    )
  }

  const name = session.user.name || session.user.email || 'User'
  const email = session.user.email || ''

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.replace(Routes.Login)
        },
      },
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ml-1 flex size-8 cursor-pointer items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground outline-hidden hover:opacity-80">
          {initials(name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-lg bg-popover before:hidden" sideOffset={8}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-8 rounded-full">
              <AvatarFallback className="bg-muted text-xs">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              {email && <span className="truncate text-xs text-muted-foreground">{email}</span>}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <LocaleLink href={Routes.Settings} className="flex items-center gap-2">
            <SettingsIcon className="size-4" />
            {t('settings')}
          </LocaleLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <LocaleLink href="/console/billing" className="flex items-center gap-2">
            <CreditCardIcon className="size-4" />
            {t('billing')}
          </LocaleLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void handleSignOut()
          }}
        >
          <LogOutIcon className="size-4" />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
