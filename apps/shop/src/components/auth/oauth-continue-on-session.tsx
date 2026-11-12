'use client'

import { useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { continueOAuthAuthorization } from '@/lib/auth/oauth-continue'
import { FormError } from '@/components/auth/form-error'

export function OAuthContinueOnSession() {
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    continueOAuthAuthorization()
      .then(({ url }) => {
        if (!cancelled) window.location.assign(url)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '无法继续授权，请重试')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
      <Loader2Icon className="size-5 animate-spin" />
      <p>正在继续授权…</p>
      <FormError message={error} />
    </div>
  )
}
