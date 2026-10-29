import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'

export type DetailRelatedItem = {
  label: string
  value?: ReactNode
  href?: string
}

export type DetailRelatedGroup = {
  title: string
  description?: string
  items: DetailRelatedItem[]
}

export function DetailRelatedList({ groups }: { groups: DetailRelatedGroup[] }) {
  const rows = groups.flatMap((group) =>
    group.items.map((item, index) => ({
      key: `${group.title}-${item.label}-${index}`,
      group,
      item,
    })),
  )

  if (rows.length === 0) return null

  return (
    <div className="divide-y rounded-md border">
      {rows.map(({ key, group, item }) => {
        const content = (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                {group.title}
              </span>
              <span className="min-w-0 break-words text-sm font-medium">{item.label}</span>
              {item.value ? (
                <span className="text-sm text-muted-foreground">{item.value}</span>
              ) : null}
              {group.description ? (
                <span className="min-w-0 break-words text-xs text-muted-foreground">
                  {group.description}
                </span>
              ) : null}
            </div>
            {item.href ? (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Badge variant="outline">只读</Badge>
            )}
          </>
        )

        return item.href ? (
          <LocaleLink
            key={key}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
          >
            {content}
          </LocaleLink>
        ) : (
          <div key={key} className="flex items-center gap-3 px-3 py-2.5">
            {content}
          </div>
        )
      })}
    </div>
  )
}
