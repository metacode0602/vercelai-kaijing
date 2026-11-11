'use client'

import {
  LAST_ORGANIZATION_COOKIE,
  LAST_ORGANIZATION_COOKIE_MAX_AGE,
} from '@/lib/organization/constants'

export function writeLastOrganizationCookie(organizationId: string) {
  document.cookie = `${LAST_ORGANIZATION_COOKIE}=${encodeURIComponent(
    organizationId,
  )}; path=/; max-age=${LAST_ORGANIZATION_COOKIE_MAX_AGE}; samesite=lax`
}
