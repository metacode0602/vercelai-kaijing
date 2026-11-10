import { findBestMatchingNavItem } from './site-nav'

export type SiteBreadcrumbItem = {
  label: string
  href?: string
}

const CROSSBORDER_ROOT: SiteBreadcrumbItem = {
  label: '跨境运营中枢',
  href: '/crossborder',
}

export function getSiteBreadcrumbTrail(pathname: string): SiteBreadcrumbItem[] {
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    return [{ label: '设置' }]
  }

  if (!pathname.startsWith('/crossborder')) {
    return [{ label: '平台运营后台', href: '/' }]
  }

  if (pathname === '/crossborder') {
    return [
      { label: '跨境运营中枢', href: '/crossborder' },
      { label: '运营总览' },
    ]
  }

  const item = findBestMatchingNavItem(pathname)
  const trail: SiteBreadcrumbItem[] = [CROSSBORDER_ROOT, { label: item?.title ?? '页面' }]

  const rest = item
    ? pathname.slice(item.url.length).replace(/^\/+/, '')
    : pathname.slice('/crossborder/'.length)
  if (rest) {
    trail.push({ label: '详情' })
  }

  return trail
}
