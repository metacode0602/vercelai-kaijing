import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
export function CtaBannerSection() {
  return (
    <section className="relative min-h-[480px] w-full overflow-hidden bg-muted/20 py-12 lg:py-20">
      <div
        className="marketing-glow-side pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div className="marketing-container relative z-10">
        <div className="glass-panel flex min-w-0 flex-col items-start gap-6 p-8 lg:flex-row lg:justify-between lg:gap-12 lg:p-12">
          <h2 className="w-full shrink-0 text-2xl font-semibold tracking-tight text-foreground lg:w-[537px] lg:text-4xl">
            构建生产级 AI 所需的一切。
          </h2>
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-6 lg:w-[480px]">
            <p className="text-base text-muted-foreground md:text-lg">
              200+ 个模型、按需 GPUs 和安全的智能体运行时——统一在一个 API
              下。免费开始，随业务增长灵活扩展。
            </p>
            <div>
              <Button asChild size="lg" className="w-fit rounded-full px-6">
                <LocaleLink href="/signin">
                  开始使用
                  <ChevronRight className="size-4" />
                </LocaleLink>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
