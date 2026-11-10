import { Skeleton } from '@workspace/ui/components/skeleton'
import { Suspense } from 'react'

import { SettingsPageClient } from './settings-page-client'

function SettingsPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:gap-8">
      <div className="space-y-3 lg:w-60">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-52" />
        <div className="flex gap-2 lg:flex-col">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28" />
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsPageClient />
    </Suspense>
  )
}
