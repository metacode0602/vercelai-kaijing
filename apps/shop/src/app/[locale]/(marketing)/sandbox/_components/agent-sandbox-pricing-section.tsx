import { SectionLabel } from "../../_components/section-label"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { Check } from "lucide-react"

interface PricingRowProps {
  label: string
  unit: string
  price: string
}

function PricingRow({ label, unit, price }: PricingRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 py-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <span className="font-mono text-lg font-semibold text-foreground">{price}</span>
    </div>
  )
}

interface TierCardProps {
  name: string
  description: string
  features: string[]
  highlight?: boolean
}

function TierCard({ name, description, features, highlight }: TierCardProps) {
  return (
    <div className={`glass-panel flex flex-col gap-6 p-8 ${highlight ? "ring-2 ring-primary/20" : ""}`}>
      <div className="flex flex-col gap-3">
        <h3 className="text-2xl font-semibold text-foreground">{name}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <Check className="size-5 shrink-0 text-primary" />
            <span className="text-sm text-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AgentSandboxPricingSection() {
  const pricingRows: PricingRowProps[] = [
    {
      label: "vCPU",
      unit: "按分配的 vCPU-秒计算",
      price: "¥0.00007",
    },
    {
      label: "内存",
      unit: "按分配的 GiB-秒计算",
      price: "¥0.00002",
    },
    {
      label: "存储",
      unit: "按小时计量，每日计费。首 60 GB 包含",
      price: "¥0.0006",
    },
  ]

  const tiers: TierCardProps[] = [
    {
      name: "免费层",
      description: "从免费层开始，充值余额后自动解锁生产级资源",
      features: [
        "5 个并发沙盒",
        "1 小时最长会话时长",
        "每沙盒 2 vCPU",
        "每沙盒 4 GB RAM",
        "无优先调度",
      ],
    },
    {
      name: "付费层",
      description: "账户余额超过 ¥0 后自动解锁付费层",
      features: [
        "100 个并发沙盒",
        "24 小时最长会话时长",
        "每沙盒最高 8 vCPU",
        "每沙盒最高 8 GB RAM",
        "支持优先调度",
      ],
      highlight: true,
    },
  ]

  return (
    <section className="marketing-section-alt">
      <div className="marketing-container">
        <SectionLabel>定价</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">灵活的按用量计费定价</h2>
          <p className="marketing-subheading">
            基于 vCPU 和内存分配的按秒计费。无计划、无锁定、无隐藏费用
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-12">
          <div className="glass-panel mx-auto w-full max-w-3xl overflow-hidden">
            <div className="bg-primary/5 px-6 py-4">
              <h3 className="text-lg font-semibold text-foreground">计费基础</h3>
            </div>
            <div className="divide-y divide-border/30 px-6">
              {pricingRows.map((row, i) => (
                <PricingRow key={i} {...row} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-6 text-center text-xl font-semibold text-foreground">
              免费层 vs 付费层
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {tiers.map((tier, i) => (
                <TierCard key={i} {...tier} />
              ))}
            </div>
          </div>

          <div className="text-center">
            <Button asChild size="lg" className="rounded-full px-8">
              <LocaleLink href="/pricing">
                查看完整定价
              </LocaleLink>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
