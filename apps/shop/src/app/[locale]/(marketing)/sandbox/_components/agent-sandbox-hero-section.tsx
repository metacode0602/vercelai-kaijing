import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ArrowRight, ChevronRight } from "lucide-react"
import {
  ProductHeroIllustration,
  ProductHeroSection,
} from "../../_components/heroes/product-hero"

const stats = [
  { label: "核心能力", value: "6" },
  { label: "运行时", value: "多语言" },
  { label: "会话模式", value: "持久" },
]

const features = [
  { title: "Code", description: "Multi-runtime", status: "READY" },
  { title: "Browser", description: "Web automation", status: "LIVE" },
  { title: "Desktop", description: "GUI control", status: "READY" },
  { title: "State", description: "Persistent", status: "READY" },
] as const

export function AgentSandboxHeroSection() {
  return (
    <ProductHeroSection
      eyebrow="Agent sandbox"
      title={
        <>
          为 AI 智能体执行
          <br />
          真实任务的运行时
        </>
      }
      description="安全、可编程的沙盒环境，支持 AI 生成代码、浏览器工作流、计算机使用和长时运行任务。"
      actions={
        <>
          <Button asChild size="lg" className="rounded-full px-6">
            <LocaleLink href="/console/sandbox">
              开始构建
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
          title="AI 智能体沙盒运行时"
          description="支持代码执行、浏览器自动化、桌面控制和持久会话的 Agent Sandbox"
          headline="Agent Sandbox"
          subheadline="Runtime for real tasks"
          topLabel="AGENT RUNTIME"
          sideLabel="ISOLATED"
          features={features}
        />
      }
      visual={{ eyebrow: "Agent Runtime", label: "Isolated sessions" }}
      statusLabel="Secure execution"
    />
  )
}
