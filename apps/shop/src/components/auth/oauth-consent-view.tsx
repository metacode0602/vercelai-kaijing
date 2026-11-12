'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { OPENSHOP_SCOPE_LABELS_ZH, parseScopeList } from '@workspace/auth'
import { submitOAuthConsent } from '@/lib/auth/oauth-continue'
import { trpc } from '@/lib/trpc/client'

export function OAuthConsentView() {
  const t = useTranslations('OAuthConsent')
  const searchParams = useSearchParams()
  const [pending, setPending] = useState<'accept' | 'deny'>()
  const [error, setError] = useState<string>()

  const clientId = searchParams.get('client_id') ?? ''
  const scopes = useMemo(
    () => parseScopeList(searchParams.get('scope') ?? ''),
    [searchParams],
  )
  const organizationsQuery = trpc.organization.listMine.useQuery()
  const activeOrg = organizationsQuery.data?.memberships.find((item) => item.isActive)

  const act = async (accept: boolean) => {
    setError(undefined)
    setPending(accept ? 'accept' : 'deny')
    try {
      const result = await submitOAuthConsent({
        accept,
        scope: scopes.join(' '),
      })
      window.location.assign(result.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'))
      setPending(undefined)
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-sm">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {t('description', {
            client: clientId || t('unknownClient'),
            org: activeOrg?.name ?? t('currentOrg'),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">{t('scopesTitle')}</p>
          <ul className="space-y-2">
            {scopes.map((scope) => {
              const label = OPENSHOP_SCOPE_LABELS_ZH[scope]
              return (
                <li key={scope} className="rounded-md border px-3 py-2">
                  <p className="text-sm font-medium">{label?.title ?? scope}</p>
                  {label?.description ? (
                    <p className="text-xs text-muted-foreground">{label.description}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(pending)}
          onClick={() => void act(false)}
        >
          {pending === 'deny' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {t('deny')}
        </Button>
        <Button type="button" disabled={Boolean(pending)} onClick={() => void act(true)}>
          {pending === 'accept' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {t('allow')}
        </Button>
      </CardFooter>
    </Card>
  )
}
