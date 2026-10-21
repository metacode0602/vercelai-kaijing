import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'

export function DetailPageHeader({
  backHref,
  backLabel = '返回列表',
  title,
  description,
  badges,
  actions,
}: {
  backHref: string
  backLabel?: string
  title: string
  description?: string
  badges?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1 text-muted-foreground" asChild>
        <LocaleLink href={backHref}>
          <ArrowLeft className="size-4" />
          {backLabel}
        </LocaleLink>
      </Button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {badges}
          </div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
