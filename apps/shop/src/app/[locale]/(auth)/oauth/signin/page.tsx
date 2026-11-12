import { UnifiedLoginForm } from '@/components/auth/unified-login-form'
import { OAuthContinueOnSession } from '@/components/auth/oauth-continue-on-session'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export default async function OAuthSigninPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return (
    <main className="flex w-full max-w-md flex-col gap-6 px-4 py-6 sm:px-6">
      {session ? (
        <OAuthContinueOnSession />
      ) : (
        <UnifiedLoginForm className="w-full shadow-sm" />
      )}
    </main>
  )
}
