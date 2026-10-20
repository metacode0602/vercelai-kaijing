'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { IndividualVerifyForm } from '@/components/verify/individual-verify-form'
import { EnterpriseVerifyForm } from '@/components/verify/enterprise-verify-form'
import { trpc } from '@/trpc/client'
import {
  ShieldCheckIcon,
  UserIcon,
  Building2Icon,
  ArrowLeftIcon,
  ClockIcon,
  XCircleIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type VerifyType = 'individual' | 'enterprise' | 'rename' | null

const STATUS_CONFIG: Record<
  string,
  { labelKey: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof ShieldCheckIcon }
> = {
  unverified: { labelKey: 'statusUnverified', variant: 'secondary', icon: XCircleIcon },
  pending: { labelKey: 'statusPending', variant: 'outline', icon: ClockIcon },
  individual_verified: { labelKey: 'statusIndividualVerified', variant: 'default', icon: CheckCircle2Icon },
  enterprise_verified: { labelKey: 'statusEnterpriseVerified', variant: 'default', icon: CheckCircle2Icon },
  rejected: { labelKey: 'statusRejected', variant: 'destructive', icon: XCircleIcon },
}

export function VerifyPageClient() {
  const t = useTranslations('Verify')
  const [selectedType, setSelectedType] = useState<VerifyType>(null)
  const statusQuery = trpc.identity.getStatus.useQuery()
  const info = statusQuery.data

  const identityStatus = info?.identityStatus ?? 'unverified'
  const latest = info?.latestApplication

  if (statusQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          加载中…
        </div>
      </div>
    )
  }

  if (selectedType === 'individual') {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="mx-auto max-w-2xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedType(null)}
            className="mb-4 gap-1.5 text-muted-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            {t('back')}
          </Button>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-foreground">{t('individual')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('individualDesc')}</p>
            </div>
            <IndividualVerifyForm
              onSubmitted={() => {
                setSelectedType(null)
                void statusQuery.refetch()
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (selectedType === 'enterprise') {
    return (
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="mx-auto max-w-2xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedType(null)}
            className="mb-4 gap-1.5 text-muted-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            {t('back')}
          </Button>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-foreground">
                {identityStatus === 'individual_verified' ? t('upgradeToEnterprise') : t('enterprise')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {identityStatus === 'individual_verified' ? t('upgradeDesc') : t('enterpriseDesc')}
              </p>
            </div>
            <EnterpriseVerifyForm
              upgrade={identityStatus === 'individual_verified'}
              onSubmitted={() => {
                setSelectedType(null)
                void statusQuery.refetch()
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[identityStatus]
  const StatusIcon = statusCfg?.icon ?? ShieldCheckIcon

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheckIcon className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
        </div>

        {/* Status card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{t('currentStatus')}</span>
            <Badge variant={statusCfg?.variant ?? 'secondary'} className="gap-1">
              <StatusIcon className="size-3" />
              {statusCfg ? t(statusCfg.labelKey) : identityStatus}
            </Badge>
          </div>

          {/* Rejection reason */}
          {latest?.status === 'rejected' && latest.reviewComment && (
            <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">{t('reviewRejected')}</p>
              <p className="mt-1 text-sm text-destructive/80">{latest.reviewComment}</p>
            </div>
          )}

          {/* Pending notice */}
          {latest?.status === 'pending' && (
            <div className="mb-5 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">{t('reviewPending')}</p>
            </div>
          )}

          {/* Type selection */}
          {info?.canSubmitIndividual && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSelectedType('individual')}
                className={cn(
                  'flex items-center gap-4 rounded-lg border border-border p-4 text-left transition-colors',
                  'hover:border-primary/50 hover:bg-muted/50',
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <UserIcon className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t('individual')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('individualDesc')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('enterprise')}
                className={cn(
                  'flex items-center gap-4 rounded-lg border border-border p-4 text-left transition-colors',
                  'hover:border-primary/50 hover:bg-muted/50',
                )}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Building2Icon className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t('enterprise')}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('enterpriseDesc')}</p>
                </div>
              </button>
            </div>
          )}

          {/* Upgrade to enterprise */}
          {info?.canSubmitEnterprise && identityStatus === 'individual_verified' && (
            <button
              type="button"
              onClick={() => setSelectedType('enterprise')}
              className={cn(
                'flex w-full items-center gap-4 rounded-lg border border-border p-4 text-left transition-colors',
                'hover:border-primary/50 hover:bg-muted/50',
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Building2Icon className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t('upgradeToEnterprise')}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t('upgradeDesc')}</p>
              </div>
            </button>
          )}

          {/* Rename notice */}
          {info?.canSubmitRename && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">{t('renameNotice')}</p>
            </div>
          )}

          {/* Pending cannot resubmit */}
          {identityStatus === 'pending' && (
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">{t('pendingNotice')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
