import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'

export type DetailField = {
  label: string
  value: ReactNode
  mono?: boolean
}

export function DetailFieldGrid({
  title,
  description,
  fields,
  columns = 3,
  action,
}: {
  title?: string
  description?: string
  fields: DetailField[]
  columns?: 2 | 3 | 4
  action?: ReactNode
}) {
  const colClass =
    columns === 2
      ? 'sm:grid-cols-2'
      : columns === 4
        ? 'sm:grid-cols-2 xl:grid-cols-4'
        : 'sm:grid-cols-2 xl:grid-cols-3'

  return (
    <Card>
      {title ? (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action}
        </CardHeader>
      ) : null}
      <CardContent className={title ? undefined : 'pt-6'}>
        <dl className={`grid gap-4 ${colClass}`}>
          {fields.map((field, index) => (
            <div key={`${field.label}-${index}`} className="min-w-0 space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{field.label}</dt>
              <dd
                className={
                  field.mono
                    ? 'break-all font-mono text-sm'
                    : 'break-words text-sm font-medium tabular-nums'
                }
              >
                {field.value ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
