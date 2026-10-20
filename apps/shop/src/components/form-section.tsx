import type { ReactNode } from "react"

export function FormSection({
  step,
  title,
  description,
  children,
}: {
  step?: number
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        {step !== undefined && (
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {step}
          </span>
        )}
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
