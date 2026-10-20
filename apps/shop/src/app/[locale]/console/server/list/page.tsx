"use client"

import { useMemo, useState } from "react"
import { Topbar } from "@/components/topbar"
import { useLocaleRouter } from "@/lib/i18n/navigation"
import {
  getSortPrice,
  MARKET_OFFERINGS,
  type BillingMethod,
  type MarketOffering,
  type SortMode,
  type ViewMode,
} from "@/lib/server-market-data"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { MarketCard } from "../_components/market-card"
import { MarketFilters } from "../_components/market-filters"
import { MarketSortBar } from "../_components/market-sort-bar"

export default function ServerMarketPage() {
  const router = useLocaleRouter()

  const [billing, setBilling] = useState<BillingMethod>("on-demand")
  const [region, setRegion] = useState("全部")
  const [gpuModel, setGpuModel] = useState("全部")
  const [gpuCount, setGpuCount] = useState(1)
  const [sortMode, setSortMode] = useState<SortMode>("default")
  const [inStockOnly, setInStockOnly] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  const filteredOfferings = useMemo(() => {
    let items = MARKET_OFFERINGS.filter((offering) => {
      if (region !== "全部" && offering.region !== region) return false
      if (gpuModel !== "全部" && offering.gpuModelKey !== gpuModel) return false
      if (offering.gpuCount !== gpuCount) return false
      if (inStockOnly && !offering.inStock) return false
      return true
    })

    if (sortMode === "price-asc" || sortMode === "price-desc") {
      items = [...items].sort((a, b) => {
        const diff = getSortPrice(a, billing) - getSortPrice(b, billing)
        return sortMode === "price-asc" ? diff : -diff
      })
    }

    return items
  }, [billing, gpuCount, gpuModel, inStockOnly, region, sortMode])

  function handleCreate(offering: MarketOffering) {
    const params = new URLSearchParams({
      offering: offering.id,
      billing,
      gpuCount: String(gpuCount),
    })
    router.push(`/console/server/deploy?${params.toString()}`)
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:max-w-7xl lg:px-8">
        <div className="mb-4">
          <h1 className="mb-2 text-2xl font-black text-foreground">
            容器云实例
          </h1>
          <p className="text-sm text-muted-foreground">
            探索丰富的算力资源，秒级启动，预装主流框架。根据您的需求灵活选择，支持按量、包日、包周及包月计费，选择最适合您需求的解决方案。
          </p>
        </div>

        <MarketFilters
          billing={billing}
          region={region}
          gpuModel={gpuModel}
          gpuCount={gpuCount}
          onBillingChange={setBilling}
          onRegionChange={setRegion}
          onGpuModelChange={setGpuModel}
          onGpuCountChange={setGpuCount}
        />

        <MarketSortBar
          sortMode={sortMode}
          inStockOnly={inStockOnly}
          viewMode={viewMode}
          onSortModeChange={setSortMode}
          onInStockOnlyChange={setInStockOnly}
          onViewModeChange={setViewMode}
        />

        <div className="min-h-[50vh]">
          {filteredOfferings.length === 0 ? (
            <Empty className="border py-16">
              <EmptyHeader>
                <EmptyTitle>暂无匹配规格</EmptyTitle>
                <EmptyDescription>
                  请调整筛选条件，或取消「只看有货」后再试。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3"
                  : "flex flex-col gap-4"
              }
            >
              {filteredOfferings.map((offering) => (
                <MarketCard
                  key={offering.id}
                  offering={offering}
                  billing={billing}
                  viewMode={viewMode}
                  onCreate={handleCreate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
