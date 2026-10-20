import { Button } from "@workspace/ui/components/button"
import { ArrowRight } from "lucide-react"
import {
  ProductHeroIllustration,
  ProductHeroSection,
} from "../../_components/heroes/product-hero"

const stats = [
  { label: "GPU 型号", value: "5" },
  { label: "部署模式", value: "独占" },
  { label: "工作负载", value: "4 类" },
]

const features = [
  { title: "H100", description: "Model training", status: "READY" },
  { title: "B200", description: "Next generation", status: "LIVE" },
  { title: "H200", description: "Large context", status: "READY" },
  { title: "RTX", description: "Visual compute", status: "READY" },
] as const

export function BareMetalHeroSection() {
  return (
    <ProductHeroSection
      eyebrow="Bare metal GPU"
      title={
        <>
          租用裸金属
          <br />
          GPU 服务器
        </>
      }
      description="高性能裸金属 GPU 服务器，完全掌控，低成本运行——专为 AI、机器学习和深度学习工作负载而设计。"
      actions={
        <Button asChild size="lg" className="rounded-full px-6">
          <a href="https://meetings-na2.hubspot.com/junyu">
            联系我们
            <ArrowRight className="size-4" />
          </a>
        </Button>
      }
      stats={stats}
      illustration={
        <ProductHeroIllustration
          title="裸金属 GPU 集群"
          description="H100、B200、H200 和 RTX 裸金属 GPU 基础设施"
          headline="Bare Metal"
          subheadline="Dedicated GPU infrastructure"
          topLabel="BARE METAL GPU"
          sideLabel="DEDICATED"
          features={features}
        />
      }
      visual={{ eyebrow: "GPU Infrastructure", label: "Bare metal cluster" }}
      statusLabel="Dedicated performance"
    />
  )
}
