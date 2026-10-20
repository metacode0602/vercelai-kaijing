'use client'

import { LocaleLink } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <LocaleLink href="/" className="text-lg font-semibold">
          Shop
        </LocaleLink>
        <div className="flex items-center gap-2">
        </div>
      </div>
    </header>
  )
}
