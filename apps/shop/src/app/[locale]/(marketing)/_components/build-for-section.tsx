import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { LocaleLink } from "@/lib/i18n/navigation"
import { Check, ChevronRight, Monitor, ShieldCheck, Sparkles } from "lucide-react"
import { SectionLabel } from "./section-label"
import { dualEntryContent } from "../_content/landing"

const cardIcons = [Monitor, Sparkles]

export function BuildForSection() {
  return (
    <section id="workbench" className="marketing-section scroll-mt-24">
      <div className="marketing-container">
        <div className="flex flex-col gap-6">
          <SectionLabel>{dualEntryContent.label}</SectionLabel>

          <div className="flex max-w-[560px] flex-col gap-4 py-4">
            <h2 className="marketing-heading">{dualEntryContent.title}</h2>
            <p className="marketing-subheading">
              {dualEntryContent.description}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 pt-4 lg:grid-cols-2">
            {dualEntryContent.cards.map((card, index) => {
              const Icon = cardIcons[index] ?? Monitor
              return (
                <Card
                  key={card.key}
                  className="glass-card relative flex flex-col overflow-hidden border-0 py-0 ring-0 dark:border dark:border-border/30 dark:bg-card/70"
                >
                  <CardContent className="relative flex h-full flex-col gap-6 p-6 md:p-8">
                    <div className="flex items-center justify-between">
                      <span className="glass-surface flex size-12 items-center justify-center rounded-xl border border-border/20">
                        <Icon
                          className="size-6 text-primary/80"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {card.eyebrow}
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      <h3 className="text-2xl font-semibold text-foreground">
                        {card.title}
                      </h3>
                      <p className="text-base text-muted-foreground md:text-lg">
                        {card.description}
                      </p>
                    </div>

                    <ul className="flex flex-col gap-3">
                      {card.features.map((feature) => (
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
                      variant="link"
                      className="mt-auto h-auto w-fit justify-start p-0 text-sm text-foreground no-underline hover:opacity-70"
                    >
                      {card.key === "web" ? (
                        <LocaleLink
                          href={card.cta.href}
                          className="inline-flex items-center gap-2"
                        >
                          {card.cta.label}
                          <ChevronRight className="size-3.5" aria-hidden="true" />
                        </LocaleLink>
                      ) : (
                        <a
                          href={card.cta.href}
                          className="inline-flex items-center gap-2"
                        >
                          {card.cta.label}
                          <ChevronRight className="size-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          <div className="glass-panel mt-4 flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="flex items-start gap-3">
              <span className="glass-surface flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/20">
                <ShieldCheck
                  className="size-5 text-primary/80"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {dualEntryContent.shared.title}
                </h3>
                <p className="max-w-[760px] text-sm text-muted-foreground md:text-base">
                  {dualEntryContent.shared.description}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {dualEntryContent.shared.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border/40 px-3 py-1 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
