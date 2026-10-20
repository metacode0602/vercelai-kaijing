"use client"

import type { ApplicationTemplate, RegionOption } from "@/lib/apps-data"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"

interface GpuRegionBarProps {
  selectedApp: ApplicationTemplate
  regions: RegionOption[]
  regionId: string
  currentSelectionTitle: string
  currentSelectionHint: string
  gpuTypeLabel: string
  vramLabel: string
  onRegionChange: (regionId: string) => void
}

export function GpuRegionBar({
  selectedApp,
  regions,
  regionId,
  currentSelectionTitle,
  currentSelectionHint,
  gpuTypeLabel,
  vramLabel,
  onRegionChange,
}: GpuRegionBarProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{currentSelectionTitle}</CardTitle>
          <CardDescription>{currentSelectionHint}</CardDescription>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">{gpuTypeLabel}</span>
            <span className="font-medium">{selectedApp.gpuType}</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-muted-foreground">{vramLabel}</span>
            <span className="font-medium">{selectedApp.vramGb}GB</span>
          </div>
          <Select value={regionId} onValueChange={(value) => value && onRegionChange(value)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {regions.map((region) => (
                <SelectItem key={region.id} value={region.id}>
                  {region.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
    </Card>
  )
}
