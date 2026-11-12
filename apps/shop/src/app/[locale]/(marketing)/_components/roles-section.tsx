import { SectionLabel } from "./section-label"
import { rolesContent } from "../_content/landing"

export function RolesSection() {
  return (
    <section className="marketing-section-alt">
      <div className="marketing-container">
        <SectionLabel>{rolesContent.label}</SectionLabel>

        <div className="mt-6 flex max-w-[520px] flex-col gap-4 py-4">
          <h2 className="marketing-heading">{rolesContent.title}</h2>
        </div>

        <div className="glass-panel mt-4 overflow-hidden">
          <div className="hidden grid-cols-[180px_1fr_1.4fr] gap-6 border-b border-border/40 px-6 py-4 font-mono text-xs uppercase tracking-wider text-muted-foreground md:grid">
            <span>角色</span>
            <span>关心什么</span>
            <span>组合方案给什么</span>
          </div>
          <div className="flex flex-col">
            {rolesContent.rows.map((row) => (
              <div
                key={row.role}
                className="grid gap-2 border-b border-border/30 px-6 py-5 last:border-0 md:grid-cols-[180px_1fr_1.4fr] md:gap-6"
              >
                <span className="text-base font-medium text-foreground">
                  {row.role}
                </span>
                <span className="text-sm text-muted-foreground md:text-base">
                  {row.concern}
                </span>
                <span className="text-sm text-muted-foreground md:text-base">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
