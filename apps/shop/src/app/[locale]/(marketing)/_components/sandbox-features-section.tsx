import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import {
  ChevronRight,
  ClipboardCheck,
  FileText,
  Lightbulb,
  RefreshCw,
  ScrollText,
  Search,
  type LucideIcon,
} from "lucide-react"
import { SectionLabel } from "./section-label"
import { aiLoopContent } from "../_content/landing"

const stepIcons: LucideIcon[] = [
  RefreshCw,
  Search,
  FileText,
  Lightbulb,
  ClipboardCheck,
  ScrollText,
]

export function SandboxFeaturesSection() {
  return (
    <section id="ai-loop" className="marketing-section-alt scroll-mt-24">
      <div className="marketing-container">
        <SectionLabel>{aiLoopContent.label}</SectionLabel>

        <div className="mt-6 flex max-w-[560px] flex-col items-start gap-4 py-4">
          <h2 className="marketing-heading">{aiLoopContent.title}</h2>
          <p className="marketing-subheading">{aiLoopContent.description}</p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {aiLoopContent.steps.map((step, index) => {
            const Icon = stepIcons[index] ?? RefreshCw
            return (
              <div
                key={step.key}
                className="flex flex-col gap-3 rounded-xl border border-border/30 bg-background/40 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Icon
                    className="size-5 text-primary/80"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>

        <div className="glass-panel mt-8 flex flex-col gap-6 p-6 md:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                示例
              </span>
              <h3 className="text-lg font-semibold text-foreground md:text-xl">
                {aiLoopContent.example.title}
              </h3>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <span className="text-sm font-medium text-foreground">
                {aiLoopContent.example.sku}
              </span>
              {aiLoopContent.example.metrics.map((metric) => (
                <span key={metric.label} className="text-sm text-muted-foreground">
                  {metric.label}
                  <span className="ml-1.5 font-medium text-foreground">
                    {metric.value}
                  </span>
                </span>
              ))}
            </div>

            <p className="text-sm text-muted-foreground">
              {aiLoopContent.example.evidence}
            </p>
            <p className="text-xs text-muted-foreground">
              {aiLoopContent.example.status}
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Button asChild size="lg" className="rounded-full px-6">
              <LocaleLink href={aiLoopContent.example.primaryCta.href}>
                {aiLoopContent.example.primaryCta.label}
                <ChevronRight className="size-4" aria-hidden="true" />
              </LocaleLink>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full px-6"
            >
              <LocaleLink href={aiLoopContent.example.secondaryCta.href}>
                {aiLoopContent.example.secondaryCta.label}
              </LocaleLink>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
