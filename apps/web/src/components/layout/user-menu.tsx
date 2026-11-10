'use client'

import { signOut } from '@/lib/auth-client'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@workspace/ui/components/avatar'
import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { LogOut, Settings, UserRound } from 'lucide-react'

import type { SessionUser } from './nav-user'

function getInitials(user: SessionUser) {
  const source = user.name?.trim() || user.email?.trim() || 'A'
  return source.slice(0, 2).toUpperCase()
}

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useLocaleRouter()

  const handleSignOut = async () => {
    await signOut()
    router.replace('/signin')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full"
          aria-label="用户菜单"
        >
          <Avatar className="size-7">
            {user.image ? (
              <AvatarImage src={user.image} alt={user.name ?? user.email ?? ''} />
            ) : null}
            <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="grid text-sm leading-tight">
            <span className="truncate font-medium">{user.name ?? '平台管理员'}</span>
            <span className="text-muted-foreground truncate text-xs">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <LocaleLink href="/settings?section=account">
            <UserRound className="mr-2 size-4" />
            账户设置
          </LocaleLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <LocaleLink href="/settings?section=platform">
            <Settings className="mr-2 size-4" />
            平台偏好
          </LocaleLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()}>
          <LogOut className="mr-2 size-4" />
          退出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
