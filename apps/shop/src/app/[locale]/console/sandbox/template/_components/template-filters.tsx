"use client"

import { Search } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SANDBOX_TEMPLATE_VISIBILITY_OPTIONS } from "@/lib/sandbox-template/data"
import type { SandboxTemplateFilters } from "@/lib/sandbox-template/types"
import { NumberStepperField } from "./number-stepper-field"

interface TemplateFiltersProps {
  filters: SandboxTemplateFilters
  totalCount: number
  labels: {
    searchPlaceholder: string
    templateCountSuffix: string
    cpuLabel: string
    cpuUnit: string
    memoryLabel: string
    memoryUnit: string
    visibilityLabel: string
  }
  onKeywordChange: (keyword: string) => void
  onCpuCoresChange: (cpuCores: number) => void
  onMemoryMiBChange: (memoryMiB: number) => void
  onVisibilityChange: (visibility: SandboxTemplateFilters["visibility"]) => void
}

export function TemplateFilters({
  filters,
  totalCount,
  labels,
  onKeywordChange,
  onCpuCoresChange,
  onMemoryMiBChange,
  onVisibilityChange,
}: TemplateFiltersProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="h-8 w-[300px] max-w-[300px] rounded-md pl-8 pr-8 hover:border-input-hover focus:border-input-hover"
            placeholder={labels.searchPlaceholder}
            value={filters.keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
          />
        </div>

        <Badge
          variant="outline"
          className="h-auto rounded px-1.5 py-1 text-xs font-normal"
        >
          <span className="size-1 rounded-full bg-primary" />
          <span className="text-primary">{totalCount}</span>
          <span className="text-foreground">{labels.templateCountSuffix}</span>
        </Badge>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <NumberStepperField
          label={labels.cpuLabel}
          valueLabel={`${filters.cpuCores} ${labels.cpuUnit}`}
          value={filters.cpuCores}
          min={1}
          onChange={onCpuCoresChange}
        />

        <NumberStepperField
          label={labels.memoryLabel}
          valueLabel={`${filters.memoryMiB} ${labels.memoryUnit}`}
          value={filters.memoryMiB}
          min={512}
          step={512}
          suffix={labels.memoryUnit}
          onChange={onMemoryMiBChange}
        />

        <div className="w-[180px]">
          <Label className="mb-1 block text-sm font-normal text-muted-foreground">
            {labels.visibilityLabel}
          </Label>
          <Select value={filters.visibility} onValueChange={onVisibilityChange}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              {SANDBOX_TEMPLATE_VISIBILITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
