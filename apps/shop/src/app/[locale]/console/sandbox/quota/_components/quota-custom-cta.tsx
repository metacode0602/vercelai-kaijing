"use client"

import { Gauge } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import type { SandboxQuotaCustomSection } from "@/lib/sandbox-quota/types"

interface QuotaCustomCtaProps {
  customQuota: SandboxQuotaCustomSection
  onContactSales?: () => void
}

export function QuotaCustomCta({
  customQuota,
  onContactSales,
}: QuotaCustomCtaProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Gauge className="size-10" aria-hidden="true" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="text-lg text-foreground">{customQuota.title}</div>
        <div className="text-sm text-muted-foreground">
          {customQuota.description}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={onContactSales}
      >
        {customQuota.contactLabel}
      </Button>
    </div>
  )
}
