'use client'

import { Button } from '@workspace/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { websiteConfig } from '@/lib/config/website'
import { useLocalePathname, useLocaleRouter } from '@/lib/i18n/navigation'
import { Languages } from 'lucide-react'
import { type Locale, useLocale, useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { useTransition } from 'react'

export function LocaleSwitcher() {
  const showLocaleSwitch = Object.keys(websiteConfig.i18n.locales).length > 1
  const router = useLocaleRouter()
  const pathname = useLocalePathname()
  const params = useParams()
  const locale = useLocale()
  const [, startTransition] = useTransition()
  const t = useTranslations('Common')

  if (!showLocaleSwitch) {
    return null
  }

  const setLocale = (nextLocale: Locale) => {
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- pathname and params match for the current route
        { pathname, params },
        { locale: nextLocale },
      )
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9">
          <Languages className="size-4" />
          <span className="sr-only">{t('language')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {Object.entries(websiteConfig.i18n.locales).map(([localeOption, data]) => (
          <DropdownMenuItem
            key={localeOption}
            onClick={() => setLocale(localeOption as Locale)}
            className={localeOption === locale ? 'bg-accent' : undefined}
          >
            {data.flag ? <span className="mr-2">{data.flag}</span> : null}
            <span>{data.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
