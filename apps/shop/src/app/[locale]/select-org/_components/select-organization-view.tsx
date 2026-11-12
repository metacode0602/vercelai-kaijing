'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Building2, Check, Loader2, Mail, Phone, X } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Spinner } from '@workspace/ui/components/spinner'
import { cn } from '@workspace/ui/lib/utils'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { writeLastOrganizationCookie } from '@/lib/organization/client'
import { trpc } from '@/lib/trpc/client'

type Organization = {
  organizationId: string
  name: string
  role: string
  isOwner: boolean
  organizationStatus: string
  onboardingStatus: string
  createdAt: string
  isActive: boolean
}

export function SelectOrganizationView({
  suspendedError = false,
}: {
  suspendedError?: boolean
}) {
  const t = useTranslations('OrgSelect')
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const organizationsQuery = trpc.organization.listMine.useQuery()
  const invitationsQuery = trpc.members.listMyInvitations.useQuery()

  const setActive = trpc.organization.setActive.useMutation()

  const enterOrganization = async (organization: Organization) => {
    try {
      const result = await setActive.mutateAsync({
        organizationId: organization.organizationId,
      })
      writeLastOrganizationCookie(result.organizationId)
      await utils.invalidate()
      router.replace(result.redirectTo)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('switchFailed'))
    }
  }

  const acceptInvitation = trpc.members.acceptInvitation.useMutation({
    onSuccess: async (result) => {
      toast.success(t('accepted', { name: result.organizationName }))
      const activeOrganizationId = organizationsQuery.data?.activeOrganizationId ?? null
      await Promise.all([utils.organization.listMine.invalidate(), invitationsQuery.refetch()])
      if (!activeOrganizationId && result.organizationStatus === 'active') {
        await enterOrganization({
          organizationId: result.organizationId,
          name: result.organizationName,
          role: 'member',
          isOwner: false,
          organizationStatus: result.organizationStatus,
          onboardingStatus: result.onboardingStatus,
          createdAt: '',
          isActive: false,
        })
      }
    },
    onError: (error) => toast.error(error.message || t('acceptFailed')),
  })

  const declineInvitation = trpc.members.declineInvitation.useMutation({
    onSuccess: async () => {
      toast.success(t('declined'))
      await invitationsQuery.refetch()
    },
    onError: (error) => toast.error(error.message),
  })

  const invitations = invitationsQuery.data ?? []
  const lastOrganizationId = organizationsQuery.data?.lastOrganizationId ?? null

  const sortedOrganizations = useMemo(
    () =>
      [...(organizationsQuery.data?.memberships ?? [])].sort((a, b) => {
        if (a.isActive) return -1
        if (b.isActive) return 1
        if (a.organizationId === lastOrganizationId) return -1
        if (b.organizationId === lastOrganizationId) return 1
        return 0
      }),
    [organizationsQuery.data?.memberships, lastOrganizationId],
  )

  const statusMeta = (organization: Organization) => {
    if (organization.organizationStatus !== 'active') {
      return { label: t('status.suspended'), variant: 'destructive' as const }
    }
    switch (organization.onboardingStatus) {
      case 'approved':
        return { label: t('status.approved'), variant: 'secondary' as const }
      case 'submitted':
        return { label: t('status.submitted'), variant: 'outline' as const }
      case 'rejected':
        return { label: t('status.rejected'), variant: 'destructive' as const }
      case 'draft':
        return { label: t('status.draft'), variant: 'outline' as const }
      default:
        return { label: t('status.notStarted'), variant: 'outline' as const }
    }
  }

  if (organizationsQuery.isLoading || invitationsQuery.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {t('loading')}
      </div>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:py-14">
      <div>
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Open Shop
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      {suspendedError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t('suspendedHint')}
        </div>
      ) : null}

      {invitations.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{t('invitations.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('invitations.description')}</p>
          </div>
          <div className="grid gap-3">
            {invitations.map((invitation) => (
              <Card key={invitation.id}>
                <CardHeader className="gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Mail className="size-4 text-muted-foreground" />
                      {invitation.organizationName}
                    </CardTitle>
                    <Badge variant="outline">{invitation.roleLabel}</Badge>
                  </div>
                  <CardDescription>
                    {t('invitations.invitedBy', { name: invitation.inviterName })}
                    {' · '}
                    {t('invitations.expires', { date: invitation.expiresAt })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {invitation.email ? (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3.5" /> {invitation.email}
                      </span>
                    ) : null}
                    {invitation.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3.5" /> {invitation.phone}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={declineInvitation.isPending}
                      onClick={() => declineInvitation.mutate({ id: invitation.id })}
                    >
                      <X className="size-4" />
                      {t('invitations.decline')}
                    </Button>
                    <Button
                      type="button"
                      disabled={!invitation.canAccept || acceptInvitation.isPending || setActive.isPending}
                      onClick={() => acceptInvitation.mutate({ id: invitation.id })}
                    >
                      {acceptInvitation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      {t('invitations.accept')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t('organizations.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('organizations.description')}</p>
        </div>

        {sortedOrganizations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-8">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="size-4" />
                {t('organizations.empty')}
              </div>
              <Button type="button" onClick={() => router.push('/onboarding')}>
                {t('organizations.startOnboarding')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sortedOrganizations.map((organization) => {
              const meta = statusMeta(organization)
              const isLastUsed = organization.organizationId === lastOrganizationId
              const unavailable = organization.organizationStatus !== 'active'
              return (
                <Card
                  key={organization.organizationId}
                  className={cn(
                    'flex flex-col',
                    organization.isActive && 'border-primary/60',
                  )}
                >
                  <CardHeader className="gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                        <Building2 className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{organization.name}</span>
                      </CardTitle>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      <span>{organization.isOwner ? t('role.owner') : t('role.member')}</span>
                      {organization.isActive ? (
                        <Badge variant="default" className="text-[10px]">
                          {t('current')}
                        </Badge>
                      ) : null}
                      {!organization.isActive && isLastUsed ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {t('lastUsed')}
                        </Badge>
                      ) : null}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t('organizations.createdAt', { date: organization.createdAt })}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={organization.isActive ? 'secondary' : 'default'}
                      disabled={unavailable || setActive.isPending}
                      onClick={() => void enterOrganization(organization)}
                    >
                      {organization.isActive ? t('reenter') : t('enter')}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
