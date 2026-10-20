import { Construction } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Topbar } from "@/components/topbar"

type ComingSoonSection = "billing" | "tasks" | "settings" | "docs"

export async function ComingSoon({ section }: { section: ComingSoonSection }) {
  const t = await getTranslations(`Console.comingSoon.${section}`)

  return (
    <>
      <Topbar title={t("title")} />
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-20 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent">
          <Construction className="size-6 text-accent-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">{t("title")}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground text-pretty">{t("desc")}</p>
      </div>
    </>
  )
}
