import type { ReactNode } from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import GPURunFullIcon from '@workspace/ui/components/icons/gpurun-full'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center border-b px-4 md:px-6">
        <LocaleLink href="/" className="inline-flex items-center gap-2">
          <GPURunFullIcon className="h-6 w-auto" />
          <span className="sr-only">GPURun</span>
        </LocaleLink>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">{children}</main>
    </div>
  )
}
