'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Building2, Loader2 } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Spinner } from '@workspace/ui/components/spinner'
import { continueOAuthAuthorization } from '@/lib/auth/oauth-continue'
import { writeLastOrganizationCookie } from '@/lib/organization/client'
import { trpc } from '@/lib/trpc/client'

export function OAuthSelectOrgView() {
  const t = useTranslations('OAuthSelectOrg')
  const organizationsQuery = trpc.organization.listMine.useQuery()
  const setActive = trpc.organization.setActive.useMutation()
  const [pendingId, setPendingId] = useState<string>()
  const [error, setError] = useState<string>()

  const memberships = useMemo(
    () =>
      (organizationsQuery.data?.memberships ?? []).filter(
        (item) => item.organizationStatus === 'active',
      ),
    [organizationsQuery.data?.memberships],
  )

  const choose = async (organizationId: string) => {
    setError(undefined)
    setPendingId(organizationId)
    try {
      const result = await setActive.mutateAsync({ organizationId })
      writeLastOrganizationCookie(result.organizationId)
      const continued = await continueOAuthAuthorization({ postLogin: true })
      window.location.assign(continued.url)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('failed')
      setError(message)
      toast.error(message)
    } finally {
      setPendingId(undefined)
    }
  }

  if (organizationsQuery.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {t('loading')}
      </div>
    )
  }

  return (
    <Card className="w-full max-w-lg shadow-sm">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          memberships.map((organization) => (
            <button
              key={organization.organizationId}
              type="button"
              disabled={Boolean(pendingId)}
              onClick={() => void choose(organization.organizationId)}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left hover:bg-muted/40 disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                <Building2 className="size-4 text-muted-foreground" />
                <span>
                  <span className="block font-medium">{organization.name}</span>
                  <span className="text-xs text-muted-foreground">{organization.role}</span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                {organization.isActive ? <Badge variant="secondary">{t('current')}</Badge> : null}
                {pendingId === organization.organizationId ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
              </span>
            </button>
          ))
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
