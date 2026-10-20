"use client"

import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@workspace/ui/components/button"
import { InstanceList } from "../_components/instance-list"
import { LocaleLink } from "@/lib/i18n/navigation"

export default function ServerlessPage() {
  const t = useTranslations("Console.pages.myEndpoints")

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 py-6">

        <div className="mb-5 flex items-center justify-between">
          <div className="mb-4">
            <h1 className="mb-2 text-2xl font-black text-foreground">我的端点</h1>
            <p className="text-sm text-muted-foreground">{t("desc")}</p>

          </div>
          <Button asChild>
            <LocaleLink href="/console/serverless/deploy">
              <Plus className="size-4" />
              {t("deploy")}
            </LocaleLink>
          </Button>
        </div>
        <InstanceList type="serverless" />
      </div>
    </>
  )
}
