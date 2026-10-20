"use client"

import { useMemo, useState } from "react"
import { useLocaleRouter } from "@/lib/i18n/navigation"
import { trpc } from "@/trpc/client"
import {
  aggregateMetalDevices,
  filterMetalDevices,
  getMetalSortPrice,
  type AggregatedMetalOffering,
  type MetalBillingMethod,
  type MetalSortMode,
  type MetalViewMode,
  type NetworkMode,
} from "@/lib/metal-market-data"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { MetalCard } from "../_components/metal-card"
import { MetalFilters } from "../_components/metal-filters"
import { MarketSortBar } from "../../server/_components/market-sort-bar"

export default function MetalListPage() {
  const router = useLocaleRouter()

  const { data: devices, isLoading } = trpc.metal.deviceList.useQuery()

  const [billing, setBilling] = useState<MetalBillingMethod>("hourly")
  const [region, setRegion] = useState("全部")
  const [gpuModel, setGpuModel] = useState("全部")
  const [networkMode, setNetworkMode] = useState<NetworkMode | "全部">("全部")
  const [sortMode, setSortMode] = useState<MetalSortMode>("default")
  const [inStockOnly, setInStockOnly] = useState(false)
  const [viewMode, setViewMode] = useState<MetalViewMode>("grid")

  const filteredOfferings = useMemo(() => {
    if (!devices) return []

    const filteredDevices = filterMetalDevices(
      devices,
      region,
      gpuModel,
      networkMode,
      inStockOnly,
    )

    let items = aggregateMetalDevices(filteredDevices)

    if (sortMode === "price-asc" || sortMode === "price-desc") {
      items = [...items].sort((a, b) => {
        const diff = getMetalSortPrice(a, billing) - getMetalSortPrice(b, billing)
        return sortMode === "price-asc" ? diff : -diff
      })
    }

    return items
  }, [billing, gpuModel, inStockOnly, networkMode, region, sortMode, devices])

  function handleRent(offering: AggregatedMetalOffering, deviceId: string) {
    const params = new URLSearchParams({
      device: deviceId,
      billing,
    })
    router.push(`/console/metal/deploy?${params.toString()}`)
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="mb-4">
        <h1 className="mb-2 text-2xl font-black text-foreground">裸金属短租</h1>
        <p className="text-sm text-muted-foreground">
          整机 GPU 裸金属短租服务（预付费），支持按小时、包天、包周及包月租用。可按地区、卡型与组网方式筛选，同规格设备聚合展示，快速选型。
        </p>
      </div>

      <MetalFilters
        billing={billing}
        region={region}
        gpuModel={gpuModel}
        networkMode={networkMode}
        onBillingChange={setBilling}
        onRegionChange={setRegion}
        onGpuModelChange={setGpuModel}
        onNetworkModeChange={setNetworkMode}
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
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-muted-foreground">加载中...</span>
          </div>
        ) : filteredOfferings.length === 0 ? (
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
              <MetalCard
                key={offering.key}
                offering={offering}
                billing={billing}
                viewMode={viewMode}
                onCreate={handleRent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
