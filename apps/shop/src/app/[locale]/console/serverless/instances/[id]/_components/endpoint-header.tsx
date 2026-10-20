"use client"

import { Clock, Zap } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import type { Instance } from "@/components/console-store"
import { cn } from "@workspace/ui/lib/utils"

const statusMeta: Record<
  Instance["status"],
  { dot: string; label: string; badge: "default" | "secondary" | "outline" }
> = {
  running: { dot: "bg-primary", label: "运行中", badge: "default" },
  deploying: { dot: "bg-chart-4 animate-pulse", label: "部署中", badge: "secondary" },
  stopping: { dot: "bg-chart-4 animate-pulse", label: "停止中", badge: "secondary" },
  stopped: { dot: "bg-muted-foreground", label: "已停止", badge: "outline" },
}

export function EndpointHeader({ endpoint }: { endpoint: Instance }) {
  const status = statusMeta[endpoint.status]
  const createdLabel = new Date(endpoint.createdAt).toLocaleString("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <div className="flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent">
        <Zap className="size-5 text-accent-foreground" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-foreground">{endpoint.name}</h1>
          <Badge variant={status.badge} className="gap-1.5">
            <span className={cn("size-1.5 rounded-full", status.dot)} />
            {status.label}
          </Badge>
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{endpoint.id}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          创建于 {createdLabel}
        </p>
      </div>
    </div>
  )
}
