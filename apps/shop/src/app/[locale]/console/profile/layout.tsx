import type { ReactNode } from 'react'
import { ConsoleTopbar } from '@/components/console/console-topbar'
import { SectionSidebar } from '@/components/console/section-sidebar'
import { PROFILE_NAV } from '@/lib/console-nav'
import { SidebarInset } from '@workspace/ui/components/sidebar'
import { getTranslations } from 'next-intl/server'

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('Console')
  return (
    <>
      <SectionSidebar title={t('pages.profile')} items={PROFILE_NAV} />
      <SidebarInset className="flex min-h-svh flex-1 flex-col">
        <ConsoleTopbar />
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </>
  )
}
