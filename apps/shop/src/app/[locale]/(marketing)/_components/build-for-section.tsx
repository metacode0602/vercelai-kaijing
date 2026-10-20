import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
import { SectionLabel } from "./section-label"

const useCases = [
  {
    number: "01",
    title: "编码智能体",
    description: "在隔离的沙盒环境中运行能够编写、执行并迭代代码的智能体。",
    href: "/docs/guides/sandbox-your-first-agent-sandbox",
    bgImage: undefined,
  },
  {
    number: "02",
    title: "浏览器自动化",
    description: "支持智能体浏览网页、完成多步骤任务并提取结构化结果。",
    href: "/docs/guides/sandbox-integrations-browser-use",
    bgImage: "/sandbox1/page/build-for/card-bg01.png",
  },
  {
    number: "03",
    title: "计算机使用",
    description:
      "让智能体能够与完整桌面环境交互，以执行基于 GUI 的工作流和类人操作。",
    href: "/docs/guides/sandbox-integrations-e2b-desktop",
    bgImage: "/sandbox1/page/build-for/card-bg02.png",
  },
  {
    number: "04",
    title: "评估与 RL",
    description:
      "在受控环境中运行可重复的评估和强化学习工作负载，用于测试、训练和迭代优化。",
    href: "/docs/guides/sandbox-your-first-agent-sandbox",
    bgImage: undefined,
  },
  {
    number: "05",
    title: "AI 驱动的 CI/CD",
    description:
      "在您的 CI/CD 流水线中，在隔离沙盒内运行代码审查、测试生成和验证工作流。",
    href: "/docs/guides/sandbox-overview",
    bgImage: "/sandbox1/page/build-for/card-bg01.png",
  },
  {
    number: "06",
    title: "长时间运行的工作流",
    description:
      "让多步骤智能体任务在长时间会话中持续运行，而不中断执行流程。",
    href: "/docs/guides/sandbox-overview",
    bgImage: "/sandbox1/page/build-for/card-bg02.png",
  },
]

const useCaseCardClassName =
  "glass-card relative flex h-[240px] flex-col overflow-hidden border-0 py-0 ring-0 dark:border dark:border-border/30 dark:bg-card/70"

export function BuildForSection() {
  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <div className="flex flex-col gap-6">
          <SectionLabel>专为 AI 原生工作负载而构建</SectionLabel>

          <div className="flex max-w-[430px] flex-col gap-4 py-4">
            <h2 className="marketing-heading">从智能体执行到评估与 RL</h2>
            <p className="marketing-subheading">
              支持全范围的 AI 原生工作负载—从编码智能体和浏览器自动化，到评估、强化学习环境以及长时间运行的工作流。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 pt-4 md:grid-cols-2 lg:grid-cols-3">
            {useCases.map((item) => (
              <Card
                key={item.number}
                className={useCaseCardClassName}
              >
                {item.bgImage && (
                  <>
                    <div
                      className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-100 dark:opacity-[0.12]"
                      style={{ backgroundImage: `url(${item.bgImage})` }}
                      aria-hidden="true"
                    />
                    <div
                      className="glass-overlay pointer-events-none absolute inset-0 dark:bg-card/80 dark:backdrop-blur-[3px]"
                      aria-hidden="true"
                    />
                  </>
                )}
                <CardContent className="relative flex h-full flex-col p-6">
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.number}
                  </span>
                  <div className="mt-3 flex w-full max-w-[320px] flex-col gap-3">
                    <h3 className="text-lg font-semibold text-foreground md:text-xl">
                      {item.title}
                    </h3>
                    <p className="text-base text-muted-foreground md:text-lg">
                      {item.description}
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="link"
                    className="mt-auto h-auto w-fit justify-start p-0 text-sm text-foreground no-underline hover:opacity-70"
                  >
                    <LocaleLink
                      href={item.href}
                      className="inline-flex items-center gap-2"
                    >
                      了解更多
                      <ChevronRight className="size-3.5" />
                    </LocaleLink>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
