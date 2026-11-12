import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { ChevronRight } from "lucide-react"
import { ctaContent } from "../_content/landing"

export function CtaBannerSection() {
  return (
    <section className="relative min-h-[420px] w-full overflow-hidden bg-muted/20 py-12 lg:py-20">
      <div
        className="marketing-glow-side pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div className="marketing-container relative z-10">
        <div className="glass-panel flex min-w-0 flex-col items-start gap-6 p-6 sm:p-8 lg:flex-row lg:justify-between lg:gap-12 lg:p-12">
          <h2 className="w-full shrink-0 text-2xl font-semibold tracking-tight text-foreground lg:w-auto lg:flex-1 lg:text-4xl xl:w-[520px] xl:flex-none">
            {ctaContent.title}
          </h2>
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-6 lg:flex-1 xl:w-[480px] xl:flex-none">
            <p className="text-base text-muted-foreground md:text-lg">
              {ctaContent.description}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="w-fit rounded-full px-6">
                <LocaleLink href={ctaContent.primaryCta.href}>
                  {ctaContent.primaryCta.label}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </LocaleLink>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-fit rounded-full px-6"
              >
                <a href={ctaContent.secondaryCta.href}>
                  {ctaContent.secondaryCta.label}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
