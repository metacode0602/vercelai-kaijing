import { Button } from "@workspace/ui/components/button"
import { GPUS, formatUSD } from "@/lib/gpu-data"
import {
  formatCNY,
  MARKET_OFFERINGS,
} from "@/lib/server-market-data"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
import { PricingTable } from "./pricing-section"
import { SectionLabel } from "./section-label"

const cloudGpuRows = GPUS.filter((gpu) => gpu.available).map((gpu) => ({
  col1: gpu.name,
  col2: "按量计费",
  col3: `${formatUSD(gpu.onDemand)}/hr`,
}))

function getMinHourlyByModel() {
  const map = new Map<string, number>()

  for (const offering of MARKET_OFFERINGS) {
    if (!offering.inStock) continue
    const current = map.get(offering.gpuModelKey)
    if (current === undefined || offering.pricing.hourly < current) {
      map.set(offering.gpuModelKey, offering.pricing.hourly)
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, 8)
    .map(([model, hourly]) => ({
      col1: model,
      col2: "按量计费（单卡）",
      col3: `${formatCNY(hourly)}/时`,
    }))
}

export function PricingGpuSection() {
  const instanceGpuRows = getMinHourlyByModel()

  return (
    <section id="gpus" className="marketing-section-alt">
      <div className="marketing-container">
        <SectionLabel>GPUs</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">灵活的 GPU 算力定价</h2>
          <p className="marketing-subheading">
            从按需 GPU 云实例到国内 GPU 实例市场，支持按量、包日、包周、包月等多种计费方式。裸金属服务器适用于长期高负载训练场景。
          </p>
        </div>

        <h3 className="mt-4 text-xl font-semibold text-foreground md:text-2xl">
          GPU 云实例
        </h3>
        <p className="mt-2 text-base text-muted-foreground">
          海外区域 GPU 云，按小时计费，支持 Spot 与包周期折扣。
        </p>

        <PricingTable
          headers={["GPU 型号", "计费方式", "价格"]}
          rows={cloudGpuRows}
        />

        <h3 className="mt-10 text-xl font-semibold text-foreground md:text-2xl">
          GPU 实例市场
        </h3>
        <p className="mt-2 text-base text-muted-foreground">
          国内多区域 GPU 实例，以下为各型号最低按量单价（因区域与库存而异）。
        </p>

        <PricingTable
          headers={["GPU 型号", "计费方式", "起价"]}
          priceLabel="起价"
          rows={instanceGpuRows}
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="rounded-full">
            <LocaleLink href="/console/server/list">
              浏览 GPU 实例
              <ChevronRight className="size-4" />
            </LocaleLink>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <LocaleLink href="/console/metal/list">
              浏览 GPU 裸金属
              <ChevronRight className="size-4" />
            </LocaleLink>
          </Button>
        </div>
      </div>
    </section>
  )
}
