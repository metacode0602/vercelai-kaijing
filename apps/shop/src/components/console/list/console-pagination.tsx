'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export type ConsolePaginationProps = {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  className?: string
}

export function useConsolePagination<T>(rows: T[], pageSize = 10) {
  const [page, setPage] = React.useState(1)
  const safePageSize = Math.max(1, pageSize)
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / safePageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const pagedRows = rows.slice((current - 1) * safePageSize, current * safePageSize)

  return {
    pagedRows,
    pagination: {
      page: current,
      pageSize: safePageSize,
      total,
      onPageChange: (next: number) => setPage(next),
    },
  }
}

function pageItems(page: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }
  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(pageCount - 1, page + 1)
  if (start > 2) items.push('ellipsis')
  for (let current = start; current <= end; current += 1) items.push(current)
  if (end < pageCount - 1) items.push('ellipsis')
  items.push(pageCount)
  return items
}

/** Controlled pagination footer for server-side list queries (`page` / `pageSize` / `total`). */
export function ConsolePagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: ConsolePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  if (pageCount <= 1) return null

  const current = Math.min(Math.max(1, page), pageCount)
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1
  const end = Math.min(current * pageSize, total)
  const items = pageItems(current, pageCount)

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        第 {start}–{end} 条 · 共 {total} 条
      </p>
      <nav aria-label="分页" className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(current - 1)}
          disabled={current === 1}
        >
          <ChevronLeft data-icon="inline-start" />
          上一页
        </Button>
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === current ? 'outline' : 'ghost'}
              size="sm"
              className="min-w-8"
              aria-current={item === current ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(current + 1)}
          disabled={current === pageCount}
        >
          下一页
          <ChevronRight data-icon="inline-end" />
        </Button>
      </nav>
    </div>
  )
}
