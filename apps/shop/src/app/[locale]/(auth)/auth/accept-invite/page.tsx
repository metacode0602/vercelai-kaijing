import { AcceptInviteForm } from '@/components/auth/accept-invite-form'
import { Suspense } from 'react'

export default function AcceptInvitePage() {
  return (
    <main className="flex w-full max-w-md flex-col gap-6 px-4 py-6 sm:px-6">
      <Suspense fallback={<p className="text-sm text-muted-foreground">加载中…</p>}>
        <AcceptInviteForm className="w-full" />
      </Suspense>
    </main>
  )
}
