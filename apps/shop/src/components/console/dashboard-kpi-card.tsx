'use client'

import { LocaleLink } from '@/lib/i18n/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { cn } from '@workspace/ui/lib/utils'

type DashboardKpiCardProps = {
  label: string
  value: string
  delta: string
  tone?: 'positive' | 'negative' | 'neutral'
  hint?: string
  href: string
}

export function DashboardKpiCard({
  label,
  value,
  delta,
  tone = 'neutral',
  hint = 'vs 上期 · 示例',
  href,
}: DashboardKpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <LocaleLink
          href={href}
          className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span
              className={cn(
                tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
                tone === 'negative' && 'text-rose-600 dark:text-rose-400',
              )}
            >
              {delta}
            </span>
            <span>{hint}</span>
          </p>
          <span className="sr-only">查看对应明细</span>
        </LocaleLink>
      </CardContent>
    </Card>
  )
}
