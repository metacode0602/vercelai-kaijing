import { Fragment } from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/breadcrumb'

export type ConsoleBreadcrumbItem = {
  label: string
  href?: string
}

/** Chinese console breadcrumbs with LocaleLink. Last item without href = current page. */
export function ConsoleBreadcrumbs({
  items,
  className,
  listClassName,
}: {
  items: ConsoleBreadcrumbItem[]
  className?: string
  listClassName?: string
}) {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className={listClassName}>
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
