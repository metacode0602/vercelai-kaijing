"use client"

import { Search } from "lucide-react"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  getRegionOptions,
  PRELOAD_STATUS_OPTIONS,
  type PreloadFilters,
} from "@/lib/preloaded-data"

interface PreloadedFiltersProps {
  filters: PreloadFilters
  onQueryChange: (query: string) => void
  onRegionChange: (region: string) => void
  onStatusChange: (status: string) => void
}

export function PreloadedFilters({
  filters,
  onQueryChange,
  onRegionChange,
  onStatusChange,
}: PreloadedFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="h-8 w-[200px] pl-8 pr-3 hover:border-input-hover focus:border-input-hover"
          placeholder="镜像名称/备注"
          value={filters.query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <Select value={filters.region} onValueChange={onRegionChange}>
        <SelectTrigger className="h-8 w-[220px]">
          <SelectValue placeholder="地域" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部地域</SelectItem>
          {getRegionOptions().map((region) => (
            <SelectItem key={region.id} value={region.id}>
              {region.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-8 w-[120px]">
          <SelectValue placeholder="全部状态" />
        </SelectTrigger>
        <SelectContent>
          {PRELOAD_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
