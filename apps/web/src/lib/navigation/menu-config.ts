import type { AppRole } from '@/lib/auth/app-role'
import type { ReactNode } from 'react'

/** 侧边栏分组偏好的持久化 cookie，与 shadcn Sidebar 的 sidebar_state 独立 */
export const SIDEBAR_GROUP_COOKIE_NAME = 'sidebar_group'
export const SIDEBAR_GROUP_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export type MenuItem = {
  title: string
  url: string
  icon: ReactNode
  roles: AppRole[]
}

export type MenuSection = {
  key: string
  label?: string
  items: MenuItem[]
}

export type SidebarNavGroup = {
  key: string
  label: string
  icon: ReactNode
  /** URL 前缀，用于当前路由没有命中任何条目时兜底反查所属分组 */
  prefixes: string[]
  /** 切换到该分组时的落地页，缺省取第一个可见条目的 url */
  landingUrl?: string
  /** 组内按「小标题 + 链接列表」分段渲染，第一个分段通常不带小标题 */
  sections: MenuSection[]
}

export function isMenuItemActive(pathname: string, href: string) {
  if (!pathname || !href) return false
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export function filterMenuItems(items: MenuItem[], role: AppRole | null): MenuItem[] {
  if (!role) return []
  return items.filter((item) => item.roles.includes(role))
}

export function filterMenuSections(sections: MenuSection[], role: AppRole | null): MenuSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: filterMenuItems(section.items, role),
    }))
    .filter((section) => section.items.length > 0)
}

/** 按角色过滤分组，剔除空分组，并补齐 landingUrl */
export function filterSidebarGroups(groups: SidebarNavGroup[], role: AppRole | null): SidebarNavGroup[] {
  if (!role) return []
  return groups
    .map((group) => {
      const sections = filterMenuSections(group.sections, role)
      return {
        ...group,
        sections,
        landingUrl: group.landingUrl ?? sections[0]?.items[0]?.url,
      }
    })
    .filter((group) => group.sections.length > 0)
}

/**
 * 从当前路由反查所属分组：先按条目 url 精确/前缀匹配（最准），
 * 再按分组的前缀兜底，因此 `/supplier/gpu-card-types` 归属平台总览而不是算力供应链。
 */
export function groupForPathname(pathname: string | null, groups: SidebarNavGroup[]) {
  const path = pathname || '/'

  for (const group of groups) {
    const hit = group.sections.some((section) => section.items.some((item) => isMenuItemActive(path, item.url)))
    if (hit) return group
  }

  for (const group of groups) {
    if (group.prefixes.some((prefix) => matchesPrefix(path, prefix))) return group
  }

  return undefined
}
