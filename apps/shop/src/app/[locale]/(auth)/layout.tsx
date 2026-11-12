import type { ReactNode } from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { ShoppingBag } from 'lucide-react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center border-b px-4 md:px-6">
        <LocaleLink href="/" className="inline-flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingBag className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-foreground">Open Shop</span>
        </LocaleLink>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
    </div>
  )
}
