import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { LocaleLink } from "@/lib/i18n/navigation"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronRight } from "lucide-react"
import { SectionLabel } from "./section-label"

const buildWithItems = [
  {
    number: "01",
    title: "快速入门",
    description: "几分钟内启动您的第一个沙盒。",
    href: "/docs/guides/sandbox-your-first-agent-sandbox",
    bgImage: undefined,
  },
  {
    number: "02",
    title: "模板",
    description: "一次定义可复用的沙盒环境，并在各类工作负载中使用。",
    href: "/docs/guides/sandbox-template",
    bgImage: "/sandbox1/page/build-with/template-bg.png",
  },
  {
    number: "03",
    title: "文件系统",
    description: "每个沙盒都包含一个隔离的文件系统，用于代码、数据和会话状态。",
    href: "/docs/guides/sandbox-filesystem",
    bgImage: "/sandbox1/page/build-with/file-system.png",
  },
]

const enterpriseStats = [
  { label: "正常运行时间 SLA", value: "99.95%" },
  { label: "每个沙盒的最大 vCPU 数", value: "Custom" },
  { label: "部署区域", value: "Your Choice" },
  { label: "并发实例", value: "Unlimited" },
]

const featureCardClassName =
  "glass-card relative flex min-h-[240px] flex-1 flex-col justify-between gap-6 overflow-hidden p-6 dark:border dark:border-border/30 dark:bg-card/70"

const enterprisePanelClassName =
  "glass-card relative overflow-hidden p-6 sm:p-8 md:p-12 lg:p-20 dark:border dark:border-border/30 dark:bg-gradient-to-br dark:from-primary/10 dark:via-card/50 dark:to-background"

const statCardClassName =
  "glass-card w-full border-0 ring-0 lg:w-[440px] dark:border dark:border-border/30 dark:bg-card/70"

export function BuildWithSection() {
  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <div className="flex flex-col gap-6">
          <SectionLabel>基于 GPURun Cloud 构建</SectionLabel>

          <div className="flex flex-col gap-4 py-4">
            <h2 className={cn("marketing-heading", "lg:whitespace-nowrap")}>
              开始使用 Agent Sandbox 构建
            </h2>
            <p className={cn("marketing-subheading", "lg:whitespace-nowrap")}>
              通过快速入门、可复用模板和隔离的沙盒存储开始使用。
            </p>
          </div>

          <div className="pt-4">
            <div className="flex flex-col gap-6 lg:flex-row">
              {buildWithItems.map((item) => (
                <div key={item.number} className={featureCardClassName}>
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
                  <span className="relative font-mono text-sm text-muted-foreground">
                    {item.number}
                  </span>
                  <div className="relative flex w-full max-w-[320px] flex-col gap-3">
                    <h3 className="text-xl font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-lg text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <LocaleLink
                    href={item.href}
                    className="relative flex items-center gap-2 text-base text-foreground transition-opacity hover:opacity-70"
                  >
                    了解更多
                    <ChevronRight className="size-4" />
                  </LocaleLink>
                </div>
              ))}
            </div>
          </div>

          <div className={enterprisePanelClassName}>
            <div
              className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-100 dark:opacity-[0.12]"
              style={{
                backgroundImage: "url(/sandbox1/page/build-with/enterprise.png)",
              }}
              aria-hidden="true"
            />
            <div
              className="glass-overlay-heavy pointer-events-none absolute inset-0 dark:bg-card/80 dark:backdrop-blur-[3px]"
              aria-hidden="true"
            />
            <div className="relative z-10 flex flex-col gap-10 lg:flex-row">
              <div className="flex flex-1 flex-col gap-10">
                <div className="flex flex-col gap-4">
                  <h2 className="text-3xl font-semibold text-foreground md:text-4xl">
                    企业版
                  </h2>
                  <p className="max-w-[432px] text-lg text-muted-foreground">
                    适用于需要更高资源限制、自定义部署区域或专用基础设施的高级工作负载。
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    asChild
                    size="lg"
                    className="h-11 w-full rounded-full sm:w-auto"
                  >
                    <a
                      href="mailto:support@gpurun.cn"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="联系支持"
                    >
                      联系销售
                    </a>
                  </Button>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-3 lg:px-10">
                {enterpriseStats.map((stat) => (
                  <Card key={stat.label} className={statCardClassName}>
                    <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
                      <span className="text-base text-foreground">
                        {stat.label}
                      </span>
                      <span className="whitespace-nowrap text-xl text-primary">
                        {stat.value}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
