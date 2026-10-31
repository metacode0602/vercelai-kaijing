import type { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { ConsolePagination, type ConsolePaginationProps } from './console-pagination'

/** Card chrome for console list tables — matches DetailSection / 多店刊登 UED. */
export function ConsoleListSection({
  title,
  description,
  children,
  action,
  footer,
  pagination,
}: {
  title: string
  description?: string
  children: ReactNode
  action?: ReactNode
  footer?: ReactNode
  pagination?: ConsolePaginationProps
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {pagination && pagination.total > pagination.pageSize ? (
        <CardFooter>
          <ConsolePagination {...pagination} />
        </CardFooter>
      ) : null}
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  )
}
