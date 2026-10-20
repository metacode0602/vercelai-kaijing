import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ArrowRight, ChevronRight } from "lucide-react"
import { AppsHeroIllustration } from "../../_components/heroes/apps-hero-illustration"
import { ProductHeroSection } from "../../_components/heroes/product-hero"
import { categoryLabels, templates } from "../_lib/templates"

const stats = [
  { label: "可部署模板", value: `${templates.length}` },
  { label: "工作负载类型", value: `${Object.keys(categoryLabels).length}` },
  { label: "部署方式", value: "GPU Cloud" },
]

export function AppsHeroSection() {
  return (
    <ProductHeroSection
      eyebrow="Open source apps"
      title="一键部署主流开源 AI 应用"
      description="预配置的 LLM、图像生成、视频生成和音频处理镜像模板，让您在 GPU Cloud 上快速启动生产级 AI 工作负载。"
      actions={
        <>
          <Button asChild size="lg" className="rounded-full px-6">
            <LocaleLink href="/console">
              开始部署
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
      illustration={<AppsHeroIllustration />}
      visual={{ eyebrow: "GPU Cloud", label: "Template library" }}
      statusLabel="Ready to run"
    />
  )
}
