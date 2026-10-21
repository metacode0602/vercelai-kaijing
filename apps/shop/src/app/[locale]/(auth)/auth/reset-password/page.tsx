import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { requireUnauth } from '@/lib/server/auth-utils'
import { Routes } from '@/lib/routes'

export default async function ResetPasswordPage() {
  await requireUnauth(Routes.Dashboard)

  return (
    <main className="flex w-full max-w-md flex-col gap-6 px-4 py-6 sm:px-6">
      <ResetPasswordForm className="w-full" />
    </main>
  )
}