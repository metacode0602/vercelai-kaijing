import { LocaleLink } from '@/lib/i18n/navigation'
import type { SiteBreadcrumbItem } from '@/lib/navigation/breadcrumbs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/breadcrumb'
import { Fragment } from 'react'

export function AppBreadcrumbs({
  items,
  className,
}: {
  items: SiteBreadcrumbItem[]
  className?: string
}) {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="flex-nowrap overflow-hidden text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem>
                {isLast || !item.href ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <LocaleLink href={item.href}>{item.label}</LocaleLink>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
