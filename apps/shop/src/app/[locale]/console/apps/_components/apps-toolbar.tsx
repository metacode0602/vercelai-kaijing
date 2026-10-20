"use client"

import {
  Image,
  LayoutGrid,
  Mic,
  Search,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react"
import type { AppCategory, AppCategoryFilter } from "@/lib/apps-data"
import { Input } from "@workspace/ui/components/input"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

const CATEGORY_ICONS: Record<AppCategory, LucideIcon> = {
  all: LayoutGrid,
  llm: Type,
  image: Image,
  audio: Mic,
  video: Video,
}

interface AppsToolbarProps {
  categories: AppCategoryFilter[]
  category: AppCategory
  search: string
  searchPlaceholder: string
  onCategoryChange: (category: AppCategory) => void
  onSearchChange: (search: string) => void
}

export function AppsToolbar({
  categories,
  category,
  search,
  searchPlaceholder,
  onCategoryChange,
  onSearchChange,
}: AppsToolbarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={category}
        onValueChange={(value) => value && onCategoryChange(value as AppCategory)}
      >
        {categories.map((item) => {
          const Icon = CATEGORY_ICONS[item.id]
          return (
            <ToggleGroupItem key={item.id} value={item.id} className="gap-1.5">
              <Icon aria-hidden="true" />
              {item.label}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>

      <div className="relative w-full sm:w-72">
        <Search
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="pl-8"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
    </div>
  )
}
