'use client'

import { Fragment, useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useStore } from '@/components/console-store'
import { LocaleLink, useLocalePathname } from '@/lib/i18n/navigation'
import {
  CONSOLE_CHILD_ROUTES,
  findBestMatchingNavItem,
  findNavItemByUrl,
  type BreadcrumbSegment,
  type ConsoleBreadcrumbTitleKey,
  type ConsoleNavTitleKey,
} from '@/lib/console-nav'
import { findBestMatchingSandboxNavItem } from '@/lib/sandbox-nav'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@workspace/ui/components/breadcrumb'

function useBreadcrumbSegments(): BreadcrumbSegment[] {
  const pathname = useLocalePathname()
  const t = useTranslations('Console')
  const { serverInstances, instances, metalInstances } = useStore()

  const tSandbox = useTranslations('Sandbox')

  return useMemo(() => {
    if (!pathname) return []

    if (pathname === '/console/sandbox' || pathname.startsWith('/console/sandbox/')) {
      const navItem = findBestMatchingSandboxNavItem(pathname)
      if (navItem) {
        return [{ label: tSandbox(navItem.titleKey) }]
      }
    }

    const translateNav = (key: ConsoleNavTitleKey) => t(key)
    const translateBreadcrumb = (key: ConsoleBreadcrumbTitleKey) => t(key)

    for (const route of CONSOLE_CHILD_ROUTES) {
      const match = pathname.match(route.pattern)
      if (!match) continue

      const parent = findNavItemByUrl(route.parentUrl)
      if (!parent) continue

      const segments: BreadcrumbSegment[] = [
        { href: parent.url, label: translateNav(parent.titleKey) },
      ]

      if (route.titleKey) {
        segments.push({ label: translateBreadcrumb(route.titleKey) })
      } else if (route.dynamic) {
        const id = match[1]
        let label = id

        if (route.dynamic === 'serverInstance') {
          label = serverInstances.find((item) => item.id === id)?.name ?? id
        } else if (route.dynamic === 'serverlessEndpoint') {
          label = instances.find((item) => item.id === id && item.type === 'serverless')?.name ?? id
        } else if (route.dynamic === 'metalInstance') {
          label = metalInstances.find((item) => item.id === id)?.name ?? id
        }

        segments.push({ label })
      }

      return segments
    }

    const navItem = findBestMatchingNavItem(pathname)
    if (navItem) {
      return [{ label: translateNav(navItem.titleKey) }]
    }

    return []
  }, [pathname, t, tSandbox, serverInstances, instances, metalInstances])
}

export function ConsoleBreadcrumb() {
  const segments = useBreadcrumbSegments()

  if (segments.length === 0) return null

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1

          return (
            <Fragment key={`${segment.href ?? 'current'}-${segment.label}`}>
              <BreadcrumbItem className={isLast ? 'min-w-0' : undefined}>
                {isLast || !segment.href ? (
                  <BreadcrumbPage className="truncate">{segment.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <LocaleLink href={segment.href} className="truncate">
                      {segment.label}
                    </LocaleLink>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? (
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
              ) : null}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
