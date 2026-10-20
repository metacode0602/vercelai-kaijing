import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ArrowRight, ChevronRight } from "lucide-react"
import {
  ProductHeroIllustration,
  ProductHeroSection,
} from "../../_components/heroes/product-hero"

const stats = [
  { label: "GPU 型号", value: "6" },
  { label: "全球区域", value: "14" },
  { label: "计费方式", value: "按秒" },
]

const features = [
  { title: "API", description: "REST endpoints", status: "READY" },
  { title: "CLI", description: "Developer tools", status: "LIVE" },
  { title: "Edge", description: "Global delivery", status: "READY" },
  { title: "Scale", description: "Auto scaling", status: "READY" },
] as const

export function ServerlessHeroSection() {
  return (
    <ProductHeroSection
      eyebrow="Serverless GPU"
      title={
        <>
          使用 GPURun 的
          <br />
          GPU 云加速您的 AI
        </>
      }
      description="为您的 AI 需求量身定制的经济实惠、可扩展的 GPU 云。专注于构建您的 AI，我们管理基础设施。"
      actions={
        <>
          <Button asChild size="lg" className="rounded-full px-6">
            <LocaleLink href="/console/server/list">
              开始使用
              <ArrowRight className="size-4" />
            </LocaleLink>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="rounded-full px-6"
          >
            <LocaleLink href="/pricing" className="gap-1">
              查看定价
              <ChevronRight className="size-4" />
            </LocaleLink>
          </Button>
        </>
      }
      stats={stats}
      illustration={
        <ProductHeroIllustration
          title="Serverless GPU 云"
          description="通过 API、CLI 和全球边缘节点运行的 Serverless GPU 基础设施"
          headline="Serverless GPU"
          subheadline="Instant infrastructure"
          topLabel="SERVERLESS GPU"
          sideLabel="AUTO SCALE"
          features={features}
        />
      }
      visual={{ eyebrow: "Serverless Runtime", label: "Auto scaling" }}
      statusLabel="Instant deployment"
    />
  )
}
