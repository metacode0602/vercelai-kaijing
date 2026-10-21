import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'

export type DetailField = {
  label: string
  value: ReactNode
  mono?: boolean
}

export function DetailFieldGrid({
  title,
  fields,
  columns = 3,
}: {
  title?: string
  fields: DetailField[]
  columns?: 2 | 3 | 4
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
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={title ? undefined : 'pt-6'}>
        <dl className={`grid gap-4 ${colClass}`}>
          {fields.map((field) => (
            <div key={field.label} className="min-w-0 space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{field.label}</dt>
              <dd
                className={
                  field.mono
                    ? 'truncate font-mono text-sm'
                    : 'truncate text-sm font-medium tabular-nums'
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
