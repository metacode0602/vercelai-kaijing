const CONSOLE_TO_SETTINGS: Record<string, string> = {
  '/console/platform-config': '/settings/platform-config',
  '/console/audit-logs': '/settings/audit-logs',
  '/console/announcements': '/settings/announcements',
  '/console/roles': '/settings/roles',
}

/**
 * 将旧平台路径映射到当前规范路径。
 * /crossborder/* → /console/*，其中四个即将上线页再转到 /settings/*。
 */
export function mapLegacyPlatformPath(pathname: string): string | null {
  let next = pathname
  if (next === '/crossborder' || next.startsWith('/crossborder/')) {
    next = `/console${next.slice('/crossborder'.length)}`
  }
  next = CONSOLE_TO_SETTINGS[next] ?? next
  return next !== pathname ? next : null
}
