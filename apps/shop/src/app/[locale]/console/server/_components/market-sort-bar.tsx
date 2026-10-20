"use client"

import { Circle, Filter, LayoutGrid, List } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SortMode, ViewMode } from "@/lib/server-market-data"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"

interface MarketSortBarProps {
  sortMode: SortMode
  inStockOnly: boolean
  viewMode: ViewMode
  onSortModeChange: (mode: SortMode) => void
  onInStockOnlyChange: (value: boolean) => void
  onViewModeChange: (mode: ViewMode) => void
}

function SortTriangle({
  direction,
  active,
}: {
  direction: "up" | "down"
  active: boolean
}) {
  return (
    <span
      className={cn(
        "inline-block size-0 border-x-[3px] border-x-transparent transition-colors",
        direction === "up"
          ? "border-b-[4px] border-b-current"
          : "border-t-[4px] border-t-current",
        active ? "text-primary" : "text-muted-foreground",
      )}
    />
  )
}

export function MarketSortBar({
  sortMode,
  inStockOnly,
  viewMode,
  onSortModeChange,
  onInStockOnlyChange,
  onViewModeChange,
}: MarketSortBarProps) {
  function handlePriceClick() {
    if (sortMode === "price-asc") {
      onSortModeChange("price-desc")
      return
    }
    onSortModeChange("price-asc")
  }

  return (
    <div className="mb-4 flex w-full flex-wrap items-center justify-start gap-3 lg:justify-between">
      <div className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border/80 bg-background/85 p-1 backdrop-blur-xl">
        <div className="px-1.5 text-muted-foreground">
          <Filter className="size-3.5" />
        </div>
        <Button
          type="button"
          variant={sortMode === "default" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 rounded-md px-2.5 text-xs"
          onClick={() => onSortModeChange("default")}
        >
          综合
        </Button>
        <Button
          type="button"
          variant={sortMode.startsWith("price") ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1 rounded-md px-2.5 text-xs"
          onClick={handlePriceClick}
        >
          价格
          <span className="flex flex-col gap-px">
            <SortTriangle direction="up" active={sortMode === "price-asc"} />
            <SortTriangle direction="down" active={sortMode === "price-desc"} />
          </span>
        </Button>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Button
          type="button"
          variant={inStockOnly ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5 rounded-md px-2.5 text-xs"
          onClick={() => onInStockOnlyChange(!inStockOnly)}
        >
          <Circle className="size-3" />
          只看有货
        </Button>
      </div>

      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
        className="rounded-lg border border-border/80 bg-background/85 p-1 backdrop-blur-xl"
      >
        <ToggleGroupItem value="list" aria-label="列表视图" className="size-8 p-0">
          <List className="size-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="grid"
          aria-label="卡片视图"
          className="size-8 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <LayoutGrid className="size-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
