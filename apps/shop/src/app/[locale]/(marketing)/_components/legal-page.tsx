import type { LegalDoc } from "../_lib/legal-content"
import { MarketingFooter } from "./marketing-footer"
import { MarketingHeader } from "./marketing-header"
import { SectionLabel } from "./section-label"

export function LegalPage({ doc, label }: { doc: LegalDoc; label: string }) {
  return (
    <main className="relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />
      <section className="marketing-glow relative w-full pb-12 pt-32 md:pb-16 md:pt-40">
        <div className="marketing-container">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            <SectionLabel>{label}</SectionLabel>
            <div className="flex flex-col gap-4">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                {doc.title}
              </h1>
              <p className="text-sm text-muted-foreground">{doc.updatedAt}</p>
              <div className="flex flex-col gap-4">
                {doc.intro.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-base leading-7 text-muted-foreground"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="w-full pb-16 md:pb-24">
        <div className="marketing-container">
          <article className="mx-auto flex max-w-3xl flex-col gap-10">
            {doc.sections.map((section, index) => (
              <section key={section.title} className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground md:text-xl">
                  {index + 1}. {section.title}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-sm leading-7 text-muted-foreground"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.items?.length ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </article>
        </div>
      </section>
      <MarketingFooter />
    </main>
  )
}
