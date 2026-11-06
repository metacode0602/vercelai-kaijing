import type { ReactNode } from 'react'
import { ConsoleBreadcrumbsProvider } from '@/components/console/console-breadcrumbs-context'
import { ConsoleCopilotProvider } from '@/components/console/console-copilot-provider'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getOnboardingState } from '@/lib/server/dataaccess/onboarding'
import { requireAuth } from '@/lib/server/auth-utils'
import { SidebarProvider } from '@workspace/ui/components/sidebar'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import '@copilotkit/react-ui/styles.css'

export default async function ConsoleRootLayout({ children }: { children: ReactNode }) {
  await requireAuth('/signin?callbackUrl=%2Fconsole')
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) {
    const activeOrganizationId =
      (session as { session?: { activeOrganizationId?: string | null } }).session
        ?.activeOrganizationId ?? null
    const onboarding = await getOnboardingState(
      db,
      session.user.id,
      activeOrganizationId,
    )
    if (onboarding.status !== 'submitted' && onboarding.status !== 'approved') {
      redirect('/onboarding')
    }
  }

  return (
    <SidebarProvider>
      <ConsoleBreadcrumbsProvider>
        <ConsoleCopilotProvider>{children}</ConsoleCopilotProvider>
      </ConsoleBreadcrumbsProvider>
    </SidebarProvider>
  )
}
