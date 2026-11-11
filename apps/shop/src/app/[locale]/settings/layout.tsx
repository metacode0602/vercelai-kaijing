import type { ReactNode } from 'react'
import { ConsoleBreadcrumbsProvider } from '@/components/console/console-breadcrumbs-context'
import { ConsoleCopilotProvider } from '@/components/console/console-copilot-provider'
import { ConsoleTopbar } from '@/components/console/console-topbar'
import { SectionSidebar } from '@/components/console/section-sidebar'
import { SETTINGS_NAV_GROUPS } from '@/lib/console-nav'
import { requireOnboardedAuth } from '@/lib/server/auth-utils'
import { SidebarInset, SidebarProvider } from '@workspace/ui/components/sidebar'
import { getTranslations } from 'next-intl/server'
import '@copilotkit/react-ui/styles.css'

/**
 * 设置区独立路由 /settings/*：与 /console 平级的运营台分区。
 * 入口门槛与 console 根布局一致（登录 + 入驻已提交/通过）。
 */
export default async function SettingsRootLayout({ children }: { children: ReactNode }) {
  await requireOnboardedAuth('/signin?callbackUrl=%2Fsettings')
  const t = await getTranslations('Console')

  return (
    <SidebarProvider>
      <ConsoleBreadcrumbsProvider>
        <ConsoleCopilotProvider>
          <SectionSidebar title={t('pages.settings')} groups={SETTINGS_NAV_GROUPS} showBrand />
          <SidebarInset className="flex min-h-svh flex-1 flex-col">
            <ConsoleTopbar />
            <div className="flex-1 p-4 md:p-6">{children}</div>
          </SidebarInset>
        </ConsoleCopilotProvider>
      </ConsoleBreadcrumbsProvider>
    </SidebarProvider>
  )
}
