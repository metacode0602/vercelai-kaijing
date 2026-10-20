import { CircleCheck } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import type {
  SandboxOverviewAction,
  SandboxOverviewHero,
} from "@/lib/sandbox-overview/types"

interface SandboxHeroCardProps {
  hero: SandboxOverviewHero
}

function HeroActionButton({ action }: { action: SandboxOverviewAction }) {
  if (action.href) {
    return (
      <Button
        asChild
        variant={action.variant === "primary" ? "default" : "outline"}
        size="sm"
      >
        <LocaleLink
          href={action.href}
          target={action.external ? "_blank" : undefined}
          rel={action.external ? "noopener noreferrer" : undefined}
        >
          {action.label}
        </LocaleLink>
      </Button>
    )
  }

  return (
    <Button
      variant={action.variant === "primary" ? "default" : "outline"}
      size="sm"
    >
      {action.label}
    </Button>
  )
}

export function SandboxHeroCard({ hero }: SandboxHeroCardProps) {
  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/10 to-card p-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {hero.title}
        </h1>

        <ul className="flex flex-col gap-2">
          {hero.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <CircleCheck
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="flex gap-3 pt-2">
          {hero.actions.map((action) => (
            <HeroActionButton key={action.id} action={action} />
          ))}
        </div>
      </div>
    </div>
  )
}
