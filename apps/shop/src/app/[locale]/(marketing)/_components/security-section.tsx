import { Card, CardContent } from "@workspace/ui/components/card"
import {
  KeyRound,
  Eye,
  ClipboardCheck,
  ShieldCheck,
  LockKeyhole,
  ScrollText,
  type LucideIcon,
} from "lucide-react"
import { SectionLabel } from "./section-label"
import { securityContent } from "../_content/landing"

const icons: LucideIcon[] = [
  KeyRound,
  Eye,
  ClipboardCheck,
  ShieldCheck,
  LockKeyhole,
  ScrollText,
]

export function SecuritySection() {
  return (
    <section id="security" className="marketing-section scroll-mt-24">
      <div className="marketing-container">
        <SectionLabel>{securityContent.label}</SectionLabel>

        <div className="mt-6 flex max-w-[560px] flex-col gap-4 py-4">
          <h2 className="marketing-heading">{securityContent.title}</h2>
          <p className="marketing-subheading">{securityContent.description}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {securityContent.items.map((item, index) => {
            const Icon = icons[index] ?? ShieldCheck
            return (
              <Card
                key={item.title}
                className="glass-card border-0 ring-0 dark:border dark:border-border/30 dark:bg-card/70"
              >
                <CardContent className="flex flex-col gap-4 p-6">
                  <span className="glass-surface flex size-11 items-center justify-center rounded-xl border border-border/20">
                    <Icon
                      className="size-5 text-primary/80"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </span>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-sm text-muted-foreground md:text-base">
                      {item.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
