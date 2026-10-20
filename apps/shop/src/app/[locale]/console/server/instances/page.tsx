"use client"

import { Plus } from "lucide-react"
import { LocaleLink } from "@/lib/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { ServerInstanceList } from "./_components/server-instance-list"

export default function ServerInstancesPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-black text-foreground">我的容器云实例</h1>
            <p className="text-sm text-muted-foreground">管理你的容器云实例。</p>
          </div>
          <Button asChild>
            <LocaleLink href="/console/server/deploy">
              <Plus className="size-4" />
              创建实例
            </LocaleLink>
          </Button>
        </div>
        <ServerInstanceList />
      </div>
    </>
  )
}