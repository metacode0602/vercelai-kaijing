'use client'

import { signOut } from '@/lib/auth-client'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@workspace/ui/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@workspace/ui/components/sidebar'
import { ChevronsUpDown, LogOut, Settings, UserRound } from 'lucide-react'

export type SessionUser = {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

function getInitials(user: SessionUser) {
  const source = user.name?.trim() || user.email?.trim() || 'A'
  return source.slice(0, 2).toUpperCase()
}

export function NavUser({ user }: { user: SessionUser }) {
  const { isMobile } = useSidebar()
  const router = useLocaleRouter()

  const handleSignOut = async () => {
    await signOut()
    router.replace('/signin')
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-lg">
                {user.image ? (
                  <AvatarImage src={user.image} alt={user.name ?? user.email ?? ''} />
                ) : null}
                <AvatarFallback className="rounded-lg">{getInitials(user)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name ?? '平台管理员'}</span>
                <span className="text-muted-foreground truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  {user.image ? (
                    <AvatarImage src={user.image} alt={user.name ?? user.email ?? ''} />
                  ) : null}
                  <AvatarFallback className="rounded-lg">{getInitials(user)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name ?? '平台管理员'}</span>
                  <span className="text-muted-foreground truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
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
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void handleSignOut()}>
              <LogOut className="mr-2 size-4" />
              退出
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
