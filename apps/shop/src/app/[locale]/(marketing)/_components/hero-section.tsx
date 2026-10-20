import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
import Image from "next/image"
export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Image
          src="/sandbox1/page/bg.png"
          alt=""
          fill
          priority
          className="object-cover object-top opacity-60"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/40 to-background" />
      </div>

      <div className="relative mx-auto max-w-[1512px]">
        <div className="relative flex min-h-[700px] flex-col px-5 pb-5 pt-[100px] md:block md:px-0 md:pb-0 md:pt-0">
          <div
            className={cn(
              "glass-panel",
              "relative z-10 flex max-w-full flex-col gap-4 p-6 pb-6 md:absolute md:left-[60px] md:top-[215px] md:max-w-[560px] md:gap-6 md:p-8 lg:left-[124px]",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-sm bg-primary/80"
                aria-hidden="true"
              />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                智能体沙盒
              </span>
            </div>

            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
              供 AI 智能体执行真实世界任务的运行时
            </h1>

            <p className="max-w-[345px] text-base text-muted-foreground md:text-lg">
              为 AI 生成的代码、浏览器工作流、计算机使用和长时间运行任务提供安全、可编程的沙盒。
            </p>

            <div className="mt-8 flex items-center gap-3 md:mt-6">
              <Button asChild size="lg" className="w-fit rounded-full px-6">
                <LocaleLink href="/console/sandbox">
                  免费开始，获赠 100 元额度*
                </LocaleLink>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="h-11 rounded-full px-4"
              >
                <LocaleLink href="/pricing" className="gap-1">
                  定价
                  <ChevronRight className="size-4 shrink-0" />
                </LocaleLink>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              无需信用卡，有效期 90 天
            </p>
          </div>

          <div className="relative z-0 mt-2 flex select-none items-start justify-start pl-4 md:absolute md:left-0 md:top-[444px] md:mt-0 md:pl-0 lg:left-auto lg:right-0 lg:top-[116px] lg:items-start lg:justify-end">
            <Image
              src="/sandbox1/page/hero-main.png"
              alt="智能体沙盒 — GPU 云、智能体应用、模型 APIs 图示"
              width={960}
              height={780}
              priority
              className="h-auto w-[740px] object-contain opacity-90 md:w-[960px] lg:w-[660px] xl:w-[820px]"
            />
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-[124px] bg-gradient-to-t from-background to-transparent lg:h-[173px]"
      />
    </section>
  )
}
