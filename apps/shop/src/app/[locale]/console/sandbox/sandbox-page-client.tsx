"use client"

import type { SandboxOverviewPageData } from "@/lib/sandbox-overview/types"
import { SandboxGuideSteps } from "./_components/sandbox-guide-steps"
import { SandboxHeroCard } from "./_components/sandbox-hero-card"

interface SandboxPageClientProps {
  initialData: SandboxOverviewPageData
}

export function SandboxPageClient({ initialData }: SandboxPageClientProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="flex w-full flex-col gap-4">
        <SandboxHeroCard hero={initialData.hero} />
        <SandboxGuideSteps steps={initialData.steps} />
      </div>
    </div>
  )
}
