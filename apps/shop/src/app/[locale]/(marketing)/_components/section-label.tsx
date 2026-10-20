import { cn } from "@workspace/ui/lib/utils"

interface SectionLabelProps {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      <div className="flex w-full min-w-0 items-center gap-2 border-b border-border/40 pb-2">
        <span
          className="size-2 shrink-0 rounded-full bg-primary/80"
          aria-hidden="true"
        />
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {children}
        </span>
      </div>
    </div>
  )
}
