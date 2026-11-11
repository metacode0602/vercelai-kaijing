export const LAST_ORGANIZATION_COOKIE = 'shop.lastOrganizationId'

export const LAST_ORGANIZATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 180

export function readCookieFromHeader(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return null
}
