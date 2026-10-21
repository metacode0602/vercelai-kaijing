'use client'

import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { cn } from '@workspace/ui/lib/utils'

export type ConsoleFilterSelect = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  /** Shown as first option; value written as `all` */
  allLabel?: string
  className?: string
}

/** Consistent Chinese filter bar: keyword + Select filters + optional extra controls. */
export function ConsoleFilterBar({
  keyword,
  onKeywordChange,
  keywordPlaceholder = '搜索…',
  keywordLabel = '关键词',
  filters = [],
  extra,
  className,
}: {
  keyword?: string
  onKeywordChange?: (value: string) => void
  keywordPlaceholder?: string
  keywordLabel?: string
  filters?: ConsoleFilterSelect[]
  extra?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {onKeywordChange ? (
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="console-filter-keyword" className="text-xs text-muted-foreground">
            {keywordLabel}
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="console-filter-keyword"
              value={keyword ?? ''}
              onChange={(e) => onKeywordChange(e.target.value)}
              placeholder={keywordPlaceholder}
              className="h-9 pl-8"
            />
          </div>
        </div>
      ) : null}
      {filters.map((f) => (
        <div key={f.id} className={cn('w-full space-y-1.5 sm:w-[160px]', f.className)}>
          <Label htmlFor={`console-filter-${f.id}`} className="text-xs text-muted-foreground">
            {f.label}
          </Label>
          <Select
            value={f.value}
            onValueChange={(v) => {
              if (v != null) f.onChange(v)
            }}
          >
            <SelectTrigger id={`console-filter-${f.id}`} className="h-9 w-full">
              <SelectValue placeholder={f.allLabel ?? '全部'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.allLabel ?? '全部'}</SelectItem>
              {f.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {extra ? <div className="flex flex-wrap items-end gap-3 pb-0.5">{extra}</div> : null}
    </div>
  )
}

/** Alias for toolbar naming in list UED notes. */
export const ConsoleListToolbar = ConsoleFilterBar

export function matchesKeyword(query: string, ...parts: Array<string | number | null | undefined>) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return parts.some((p) => String(p ?? '').toLowerCase().includes(q))
}
