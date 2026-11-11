'use client'

import { PAGE_SIZE_OPTIONS } from '@/lib/pagination/defaults'
import { generatePageNumbers } from '@/lib/pagination/generate-page-numbers'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@workspace/ui/components/pagination'
import { NativeSelect } from '@workspace/ui/components/native-select'
import { cn } from '@workspace/ui/lib/utils'

export type ListPaginationProps = {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: readonly number[]
  className?: string
}

export function ListPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  className,
}: ListPaginationProps) {
  if (totalItems === 0) {
    return null
  }

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)
  const pageNumbers = generatePageNumbers(page, totalPages)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">
          显示 {start}–{end} 条，共 {totalItems} 条
        </p>
        {onPageSizeChange ? (
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            每页
            <NativeSelect
              size="sm"
              value={String(pageSize)}
              onChange={(event) => {
                const next = Number(event.target.value)
                if (Number.isFinite(next) && next > 0) onPageSizeChange(next)
              }}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} 条
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text="上一页"
                onClick={(event) => {
                  event.preventDefault()
                  if (page > 1) onPageChange(page - 1)
                }}
                aria-disabled={page <= 1}
                className={
                  page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                }
              />
            </PaginationItem>

            {pageNumbers.map((pageNumber, index) => (
              <PaginationItem key={`${pageNumber}-${index}`}>
                {pageNumber === '...' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    onClick={(event) => {
                      event.preventDefault()
                      onPageChange(pageNumber)
                    }}
                    isActive={page === pageNumber}
                    className={page === pageNumber ? '' : 'cursor-pointer'}
                  >
                    {pageNumber}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}

            <PaginationItem>
              <PaginationNext
                text="下一页"
                onClick={(event) => {
                  event.preventDefault()
                  if (page < totalPages) onPageChange(page + 1)
                }}
                aria-disabled={page >= totalPages}
                className={
                  page >= totalPages
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  )
}
