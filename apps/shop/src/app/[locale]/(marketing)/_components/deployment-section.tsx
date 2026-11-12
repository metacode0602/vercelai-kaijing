import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { LocaleLink } from "@/lib/i18n/navigation"
import { Check, ChevronRight, Globe2, HardDrive, Sparkles, type LucideIcon } from "lucide-react"
import { SectionLabel } from "./section-label"
import { deploymentContent } from "../_content/landing"

const optionIcons: LucideIcon[] = [Globe2, Sparkles, HardDrive]

export function DeploymentSection() {
  return (
    <section id="deployment" className="marketing-section-alt scroll-mt-24">
      <div className="marketing-container">
        <SectionLabel>{deploymentContent.label}</SectionLabel>

        <div className="mt-6 flex max-w-[560px] flex-col gap-4 py-4">
          <h2 className="marketing-heading">{deploymentContent.title}</h2>
          <p className="marketing-subheading">{deploymentContent.description}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {deploymentContent.options.map((option, index) => {
            const Icon = optionIcons[index] ?? Globe2
            return (
              <Card
                key={option.key}
                className={
                  option.highlighted
                    ? "glass-card relative flex flex-col border border-primary/20 bg-primary/5 ring-0 dark:border-primary/35 dark:bg-primary/10"
                    : "glass-card relative flex flex-col border-0 ring-0 dark:border dark:border-border/30 dark:bg-card/70"
                }
              >
                <CardContent className="flex h-full flex-col gap-6 p-6 md:p-8">
                  <div className="flex items-center justify-between">
                    <span className="glass-surface flex size-12 items-center justify-center rounded-xl border border-border/20">
                      <Icon
                        className="size-6 text-primary/80"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </span>
                    {option.highlighted ? (
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                        推荐
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h3 className="text-xl font-semibold text-foreground md:text-2xl">
                      {option.title}
                    </h3>
                    <p className="text-sm text-muted-foreground md:text-base">
                      {option.audience}
                    </p>
                  </div>

                  <ul className="flex flex-col gap-3">
                    {option.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-sm text-muted-foreground md:text-base"
                      >
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    variant={option.highlighted ? "default" : "outline"}
                    className="mt-auto w-full rounded-full"
                  >
                    {option.cta.href.startsWith("mailto:") ? (
                      <a href={option.cta.href}>
                        {option.cta.label}
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </a>
                    ) : (
                      <LocaleLink href={option.cta.href}>
                        {option.cta.label}
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </LocaleLink>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
