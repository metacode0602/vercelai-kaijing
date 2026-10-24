import { labelStatus } from '@/lib/console/labels'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { cn } from '@workspace/ui/lib/utils'

export type TimelineStep = {
  at: string
  status: string
  note?: string
  current?: boolean
}

export function StatusTimeline({
  title = '状态时间线',
  steps,
}: {
  title?: string
  steps: TimelineStep[]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l border-border pl-4">
          {steps.map((step) => (
            <li key={`${step.status}-${step.at}`} className="relative">
              <span
                className={cn(
                  'absolute -left-[21px] top-1 size-2.5 rounded-full border bg-background',
                  step.current ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                )}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={step.current ? 'default' : 'outline'}>{labelStatus(step.status)}</Badge>
                <span className="text-xs text-muted-foreground">{step.at}</span>
              </div>
              {step.note ? <p className="mt-1 text-sm text-muted-foreground">{step.note}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
