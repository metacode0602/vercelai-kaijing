import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleLink } from "@/lib/i18n/navigation"
import {
  ArrowUpRight,
  ChevronRight,
  ClipboardCheck,
  PackageSearch,
  RefreshCw,
  TrendingUp,
  TriangleAlert,
  Wifi,
} from "lucide-react"
import { heroContent } from "../_content/landing"

const stats = [
  { label: "今日 GMV", value: "LKR 12,480", tone: "text-foreground" },
  { label: "订单", value: "42", tone: "text-foreground" },
  { label: "待审", value: "3", tone: "text-primary" },
  { label: "低库存", value: "7", tone: "text-foreground" },
]

function WorkbenchPreview() {
  return (
    <div
      role="img"
      aria-label="OpenMCP Station 桌面工作台示意图：今日 GMV、订单、待审、低库存与一条补货待审建议"
      className="glass-panel relative w-full max-w-[640px] overflow-hidden p-3 sm:p-4"
    >
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            OpenMCP Station
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 px-2.5 py-1 text-xs text-muted-foreground">
          <Wifi className="size-3.5" aria-hidden="true" />
          同步 2 分钟前
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border/30 bg-background/40 p-3"
          >
            <p className="text-[11px] text-muted-foreground">{stat.label}</p>
            <p className={cn("mt-1 text-base font-semibold sm:text-lg", stat.tone)}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <PackageSearch
                className="size-4 text-primary"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">补货建议</p>
              <p className="text-xs text-muted-foreground">
                KCH-014 · 可售 5 件 · 建议补货 120 件
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            待确认
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="size-3.5" aria-hidden="true" />
            近 7 日日均 8 件
          </span>
          <span className="inline-flex items-center gap-1">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            在途 0 件
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-primary/10 pt-3">
          <span className="text-xs text-muted-foreground">
            确认后按店铺策略写回
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            去控制台确认
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/40 p-3 text-xs text-muted-foreground">
          <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
          本周已确认 18 条
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-background/40 p-3 text-xs text-muted-foreground">
          <RefreshCw className="size-4 text-primary" aria-hidden="true" />
          同步成功率 99.6%
        </div>
      </div>

      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" />
    </div>
  )
}

export function HeroSection() {
  return (
    <section className="relative w-full overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-[10%] size-[420px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-[5%] top-0 size-[320px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background" />
      </div>

      <div className="relative mx-auto max-w-[1512px]">
        <div className="relative flex flex-col gap-10 px-5 pb-12 pt-24 md:px-12 lg:min-h-[700px] lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-12 lg:py-10 lg:pt-[120px] xl:px-24">
          <div
            className={cn(
              "glass-panel",
              "relative z-10 flex w-full max-w-[600px] flex-col gap-4 p-6 md:gap-6 md:p-8 lg:shrink-0",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-2 rounded-sm bg-primary/80"
                aria-hidden="true"
              />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {heroContent.eyebrow}
              </span>
            </div>

            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
              {heroContent.title}
            </h1>

            <p className="max-w-[520px] text-base text-muted-foreground md:text-lg">
              {heroContent.description}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3 md:mt-2">
              <Button asChild size="lg" className="w-fit rounded-full px-6">
                <LocaleLink href={heroContent.primaryCta.href}>
                  {heroContent.primaryCta.label}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </LocaleLink>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="h-11 rounded-full px-4"
              >
                <a href={heroContent.secondaryCta.href} className="gap-1">
                  {heroContent.secondaryCta.label}
                  <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
                </a>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">{heroContent.footnote}</p>
          </div>

          <div className="relative z-0 flex w-full select-none items-center justify-center lg:flex-1 lg:justify-end">
            <WorkbenchPreview />
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
