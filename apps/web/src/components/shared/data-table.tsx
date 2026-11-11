'use client'

import * as React from 'react'
import { Button } from '@workspace/ui/components/button'
import { Spinner } from '@workspace/ui/components/spinner'
import { TableCell, TableRow } from '@workspace/ui/components/table'

export function TableLoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-48 p-0">
        <div
          role="status"
          aria-live="polite"
          className="flex h-48 items-center justify-center"
        >
          <Spinner className="size-5 text-muted-foreground/55" />
          <span className="sr-only">加载中</span>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function TableErrorRow({
  colSpan,
  message,
  onRetry,
}: {
  colSpan: number
  message: string
  onRetry?: () => void
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan}>
        <div className="flex flex-wrap items-center gap-2 text-destructive">
          <span>加载失败：{message}</span>
          {onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              重试
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function TableEmptyRow({
  colSpan,
  children,
}: {
  colSpan: number
  children: React.ReactNode
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  )
}

export function PageDataLoading({ label = '加载中' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-48 items-center justify-center"
    >
      <Spinner className="size-5 text-muted-foreground/55" />
      <span className="sr-only">{label}</span>
    </div>
  )
}
