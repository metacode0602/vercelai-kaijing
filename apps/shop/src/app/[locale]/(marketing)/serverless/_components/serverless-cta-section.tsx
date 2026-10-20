import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"

export function ServerlessCtaSection() {
  return (
    <section className="relative min-h-[520px] w-full overflow-hidden bg-muted/20 py-16 lg:py-24">
      <div
        className="marketing-glow-side pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <div className="select-none text-[20vw] font-bold leading-none tracking-tighter text-foreground/5 lg:text-[18rem]">
          GPURun
        </div>
      </div>

      <div className="marketing-container relative z-10">
        <div className="flex min-w-0 flex-col items-center gap-8 text-center">
          <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            构建生产级 AI 所需的一切
          </h2>
          
          <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
            200+ 个模型、按需 GPUs 和安全的智能体运行时——统一在一个 API 下。免费开始，随业务增长灵活扩展
          </p>

          <Button asChild size="lg" className="rounded-full px-8">
            <LocaleLink href="/console">
              开始使用
              <ChevronRight className="size-4" />
            </LocaleLink>
          </Button>
        </div>
      </div>
    </section>
  )
}
