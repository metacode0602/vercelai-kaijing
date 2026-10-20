import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ArrowRight, Check, Cpu, Rocket, Sparkles } from "lucide-react"
import { templates } from "../_lib/templates"

const steps = [
  { title: "选择模板", description: "按工作负载找到合适的开源镜像" },
  { title: "选择 GPU", description: "使用推荐的实例规格快速启动" },
  { title: "访问服务", description: "端口、依赖和运行环境自动准备" },
]

export function AppsCtaSection() {
  return (
    <section className="relative w-full overflow-hidden py-20 md:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-5">
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/55 shadow-sm backdrop-blur-xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-card/50 to-background"
          />
          <div className="relative grid lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-6 md:p-10 lg:p-12">
              <div className="mb-4 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                <Sparkles className="size-4 text-primary" />
                One-click deploy
              </div>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                准备好开始了吗？
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                选择适合您的模板，在 GPU Cloud 上启动您的下一个 AI 工作负载。
                无需手动安装依赖，服务端口和运行环境会自动准备。
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="rounded-full px-7">
                  <LocaleLink href="/console">
                    开始部署
                    <ArrowRight className="size-4" />
                  </LocaleLink>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-full px-7"
                >
                  <LocaleLink href="/pricing">查看定价</LocaleLink>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-primary" />
                  {templates.length} 个开源模板
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-primary" />
                  GPU 加速开箱即用
                </span>
              </div>
            </div>

            <div className="border-t border-border/50 bg-background/25 p-6 md:p-8 lg:border-t-0 lg:border-l lg:p-10">
              <div className="mb-8 flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Rocket className="size-5" />
                </div>
                <div>
                  <div className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
                    Deployment flow
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-foreground">
                    三步启动服务
                  </h3>
                </div>
              </div>
              <ol className="space-y-5">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {step.title}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {step.description}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
                部署完成后，可在控制台查看实例状态、日志和网络配置。
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
