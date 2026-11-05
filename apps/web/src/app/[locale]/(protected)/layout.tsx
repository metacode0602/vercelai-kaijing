import { requireAuth } from '@/components/features/auth/lib/utils'
import { Routes } from '@/lib/routes'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAuth(`${Routes.Login}?callbackUrl=${encodeURIComponent(Routes.Settings)}`)
  return <>{children}</>
}
