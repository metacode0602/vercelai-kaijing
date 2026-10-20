import { SectionLabel } from "../../_components/section-label"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"

interface GpuPricingCardProps {
  name: string
  vram: string
  onDemand: string
  spot: string
  badge?: string
}

function GpuPricingCard({ name, vram, onDemand, spot, badge }: GpuPricingCardProps) {
  return (
    <div className="glass-panel relative flex flex-col gap-4 p-6">
      {badge && (
        <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary">
          {badge}
        </span>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="pr-20 text-xl font-semibold text-foreground">{name}</h3>
        <p className="text-sm text-muted-foreground">{vram}</p>
      </div>
      <div className="flex flex-col gap-3 border-t border-border/30 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">按需</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold text-foreground">{onDemand}</span>
            <span className="text-xs text-muted-foreground">/GPU/小时</span>
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Spot 竞价</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-semibold text-primary">{spot}</span>
            <span className="text-xs text-muted-foreground">/GPU/小时</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ServerlessPricingSection() {
  const gpuPricing: GpuPricingCardProps[] = [
    {
      name: "NVIDIA RTX 4090",
      vram: "24 GB GDDR6X",
      onDemand: "¥3.60",
      spot: "¥1.80",
      badge: "性价比之选",
    },
    {
      name: "NVIDIA A100 80GB",
      vram: "80 GB HBM2e",
      onDemand: "¥12.00",
      spot: "¥6.00",
    },
    {
      name: "NVIDIA H100 SXM",
      vram: "80 GB HBM3",
      onDemand: "¥24.00",
      spot: "¥12.00",
      badge: "顶级性能",
    },
    {
      name: "NVIDIA H200 SXM",
      vram: "141 GB HBM3e",
      onDemand: "联系我们",
      spot: "联系我们",
      badge: "最大显存",
    },
    {
      name: "NVIDIA RTX 5090",
      vram: "32 GB GDDR7",
      onDemand: "联系我们",
      spot: "联系我们",
      badge: "下一代",
    },
    {
      name: "NVIDIA L40S",
      vram: "48 GB GDDR6",
      onDemand: "¥6.00",
      spot: "¥3.00",
    },
  ]

  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <SectionLabel>GPU 定价</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">GPU 定价</h2>
          <p className="marketing-subheading">
            通过我们的全球网络在离用户更近的地方部署 GPU 实例。确保最小延迟和快速访问，无论您的用户或团队在哪里
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {gpuPricing.map((gpu, i) => (
            <GpuPricingCard key={i} {...gpu} />
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button asChild size="lg" className="rounded-full px-8">
            <LocaleLink href="/pricing">
              查看完整定价
            </LocaleLink>
          </Button>
        </div>
      </div>
    </section>
  )
}
