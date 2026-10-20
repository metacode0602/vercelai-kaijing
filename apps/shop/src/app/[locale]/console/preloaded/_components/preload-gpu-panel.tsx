"use client"

import { getPreloadGpusForRegion } from "@/lib/preloaded-data"
import { cn } from "@workspace/ui/lib/utils"

interface PreloadGpuPanelProps {
  regionId: string
}

export function PreloadGpuPanel({ regionId }: PreloadGpuPanelProps) {
  const { available, unavailable } = getPreloadGpusForRegion(regionId)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium text-foreground">可用</p>
        <div className="flex flex-wrap gap-2">
          {available.map((gpu) => (
            <span
              key={gpu}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground"
            >
              {gpu}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">不可用</p>
        <div className="flex flex-wrap gap-2">
          {unavailable.map((gpu) => (
            <span
              key={gpu}
              className={cn(
                "rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground",
              )}
            >
              {gpu}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
