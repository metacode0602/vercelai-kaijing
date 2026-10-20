"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleLink } from "@/lib/i18n/navigation"
import type { SandboxTier } from "@/lib/sandbox-quota/types"

interface QuotaTierCardProps {
  tier: SandboxTier
  pricingHref: string
  onUpgrade?: () => void
}

export function QuotaTierCard({
  tier,
  pricingHref,
  onUpgrade,
}: QuotaTierCardProps) {
  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="text-base text-foreground">您当前的层级：</div>
        <div className="inline-flex">
          <Badge
            variant="outline"
            className="h-auto gap-2 rounded-md border-primary/30 bg-primary/10 px-3 py-1 text-base font-normal uppercase text-primary"
          >
            <span
              className="size-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden="true"
            />
            {tier.label} TIER
          </Badge>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button size="sm" onClick={onUpgrade}>
          升级到付费层级
        </Button>
        <LocaleLink
          href={pricingHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          关于定价
        </LocaleLink>
      </div>
    </div>
  )
}
