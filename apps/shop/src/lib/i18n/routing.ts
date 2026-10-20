import { websiteConfig } from '@/lib/config/website'
import { defineRouting } from 'next-intl/routing'

export const DEFAULT_LOCALE = websiteConfig.i18n.defaultLocale
export const LOCALES = Object.keys(websiteConfig.i18n.locales)

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localeDetection: false,
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
  },
  localePrefix: 'as-needed',
})
