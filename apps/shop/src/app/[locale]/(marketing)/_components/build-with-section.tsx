import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { LocaleLink } from "@/lib/i18n/navigation"
import { cn } from "@workspace/ui/lib/utils"
import { ChevronRight, KeyRound, PlayCircle, Store } from "lucide-react"
import { SectionLabel } from "./section-label"
import { quickStartContent } from "../_content/landing"

const stepIcons = [Store, KeyRound, PlayCircle]

export function BuildWithSection() {
  return (
    <section className="marketing-section">
      <div className="marketing-container">
        <div className="flex flex-col gap-6">
          <SectionLabel>{quickStartContent.label}</SectionLabel>

          <div className="flex flex-col gap-4 py-4">
            <h2 className={cn("marketing-heading", "lg:whitespace-nowrap")}>
              {quickStartContent.title}
            </h2>
            <p className="marketing-subheading">
              {quickStartContent.description}
            </p>
          </div>

          <div className="pt-4">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {quickStartContent.steps.map((step, index) => {
                const Icon = stepIcons[index] ?? Store
                return (
                  <Card
                    key={step.number}
                    className="glass-card relative flex flex-col justify-between gap-6 overflow-hidden p-6 dark:border dark:border-border/30 dark:bg-card/70"
                  >
                    <div className="flex items-start justify-between">
                      <span className="glass-surface flex size-12 items-center justify-center rounded-xl border border-border/20">
                        <Icon
                          className="size-6 text-primary/80"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {step.number}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3">
                      <h3 className="text-xl font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <p className="text-base text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                    <LocaleLink
                      href={step.href}
                      className="flex items-center gap-2 text-sm text-foreground transition-opacity hover:opacity-70"
                    >
                      查看入口
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </LocaleLink>
                  </Card>
                )
              })}
            </div>
          </div>

          <div className="glass-card relative overflow-hidden p-6 sm:p-8 md:p-12 lg:p-16 dark:border dark:border-border/30 dark:bg-gradient-to-br dark:from-primary/10 dark:via-card/50 dark:to-background">
            <div className="relative z-10 flex flex-col gap-10 lg:flex-row">
              <div className="flex flex-1 flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <h2 className="text-3xl font-semibold text-foreground md:text-4xl">
                    {quickStartContent.enterprise.title}
                  </h2>
                  <p className="max-w-[480px] text-lg text-muted-foreground">
                    {quickStartContent.enterprise.description}
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button
                    asChild
                    size="lg"
                    className="h-11 w-full rounded-full sm:w-auto"
                  >
                    <a href={quickStartContent.enterprise.cta.href}>
                      {quickStartContent.enterprise.cta.label}
                    </a>
                  </Button>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-3 lg:px-10">
                {quickStartContent.enterprise.stats.map((stat) => (
                  <Card
                    key={stat.label}
                    className="glass-card w-full border-0 ring-0 lg:w-[460px] dark:border dark:border-border/30 dark:bg-card/70"
                  >
                    <CardContent className="flex flex-col gap-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
                      <span className="text-base text-foreground">
                        {stat.label}
                      </span>
                      <span className="whitespace-nowrap text-base text-primary md:text-lg">
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
