"use client"

import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { Topbar } from "@/components/topbar"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { TEMPLATES } from "@/lib/gpu-data"

export default function TemplatesPage() {
  const t = useTranslations("Console.pages.templates")

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <p className="mb-5 text-sm text-muted-foreground">{t("desc")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((template) => (
            <div key={template.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                {template.featured ? (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                    {t("featured")}
                  </span>
                ) : null}
              </div>
              <span className="mt-1 text-xs text-muted-foreground">{template.category}</span>
              <p className="mt-2 flex-1 text-xs text-muted-foreground text-pretty">{template.desc}</p>
              <code className="mt-3 truncate rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
                {template.image}
              </code>
              <div className="mt-3 flex items-center gap-2">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <LocaleLink href="/instances/deploy">{t("deployInstance")}</LocaleLink>
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <LocaleLink href="/console/serverless/deploy">
                    Serverless
                    <ArrowRight className="size-3.5" />
                  </LocaleLink>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
