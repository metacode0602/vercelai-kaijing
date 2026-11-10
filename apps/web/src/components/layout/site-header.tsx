'use client'

import { AppBreadcrumbs } from '@/components/layout/app-breadcrumbs'
import type { SessionUser } from '@/components/layout/nav-user'
import { SiteHeaderSearch } from '@/components/layout/site-header-search'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'
import { SiteMessagesPanel } from '@/components/site-messages'
import { useLocalePathname } from '@/lib/i18n/navigation'
import { getSiteBreadcrumbTrail } from '@/lib/navigation/breadcrumbs'
import { Separator } from '@workspace/ui/components/separator'
import { SidebarTrigger } from '@workspace/ui/components/sidebar'

export function SiteHeader({ user }: { user: SessionUser }) {
  const pathname = useLocalePathname() ?? ''
  const breadcrumbs = getSiteBreadcrumbTrail(pathname)

  return (
    <header className="bg-background/80 sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" aria-label="切换侧边栏" />
      <Separator orientation="vertical" className="mr-1 h-4" />

      <AppBreadcrumbs items={breadcrumbs} className="min-w-0 flex-1" />

      <div className="flex items-center gap-1">
        <SiteHeaderSearch />
        <SiteMessagesPanel />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
