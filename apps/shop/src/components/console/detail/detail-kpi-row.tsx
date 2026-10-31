import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { cn } from '@workspace/ui/lib/utils'

export function DetailKpiRow({
  items,
}: {
  items: { label: string; value: string; hint?: string }[]
}) {
  if (items.length <= 3) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <Badge
            key={item.label}
            variant="secondary"
            title={item.hint}
            className="h-auto max-w-full gap-1.5 whitespace-normal px-3 py-1 text-sm font-normal"
          >
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </Badge>
        ))}
      </div>
    )
  }

  const singleRowColumns =
    items.length === 4
      ? 'grid-cols-4'
      : items.length === 5
        ? 'grid-cols-5'
        : items.length === 6
          ? 'grid-cols-6'
          : undefined

  return (
    <div className={cn('grid gap-3', singleRowColumns ?? 'sm:grid-cols-2 xl:grid-cols-4')}>
      {items.map((item) => (
        <Card key={item.label} size="sm" className="min-w-0">
          <CardHeader className="pb-0">
            <CardTitle className="text-xs text-muted-foreground">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold tabular-nums leading-tight">{item.value}</p>
            {item.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
