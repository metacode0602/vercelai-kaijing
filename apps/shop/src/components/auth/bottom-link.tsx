'use client'

import { LocaleLink } from '@/lib/i18n/navigation'

interface BottomLinkProps {
  label: string
  href: string
}

export function BottomLink({ label, href }: BottomLinkProps) {
  return (
    <LocaleLink
      href={href}
      className="text-sm text-muted-foreground hover:text-primary hover:underline hover:underline-offset-4"
    >
      {label}
    </LocaleLink>
  )
}
