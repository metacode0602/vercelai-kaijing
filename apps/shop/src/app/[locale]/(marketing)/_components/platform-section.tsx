import { platformContent } from "../_content/landing"

export function PlatformSection() {
  return (
    <section className="relative border-y border-border/30 bg-muted/10">
      <div className="marketing-container flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {platformContent.title}
          </span>
          <span className="text-xs text-muted-foreground">
            {platformContent.footnote}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {platformContent.items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-border/40 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
