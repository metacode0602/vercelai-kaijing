import { getSession } from '@/lib/server/auth-utils'
import { getTranslations } from 'next-intl/server'
import { DashboardClient } from './_components/dashboard-client'

export default async function ConsoleHomePage() {
  const session = await getSession()
  const t = await getTranslations('Console.dashboard')

  return <DashboardClient userName={session?.user.name ?? null} />
}
