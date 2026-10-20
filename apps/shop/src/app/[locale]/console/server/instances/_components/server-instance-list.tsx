"use client"

import { useState } from "react"
import { Cpu, Globe, HardDrive, Play, Server, Square, Trash2, Wallet } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { useStore, type ServerInstance } from "@/components/console-store"
import {
  formatCNY,
  getDeployBillingLabel,
  getDeployPrice,
  getOfferingById,
  getServerInstanceConsumedBilling,
} from "@/lib/server-market-data"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleLink } from "@/lib/i18n/navigation"

const statusStyle: Record<
  ServerInstance["status"],
  { dot: string; label: string }
> = {
  running: { dot: "bg-primary", label: "运行中" },
  deploying: { dot: "bg-chart-4 animate-pulse", label: "部署中" },
  stopping: { dot: "bg-chart-4 animate-pulse", label: "关机中" },
  stopped: { dot: "bg-muted-foreground", label: "已停止" },
}

type PowerAction = "start" | "stop"

const powerActionConfig = {
  start: {
    title: "确认启动实例？",
    description:
      "启动后将恢复 GPU 计费，实例重新启动并绑定公网 IP。存储扩容费用在实例存在期间持续产生。",
    confirmLabel: "启动",
  },
  stop: {
    title: "确认停止实例？",
    description:
      "停止后将停止 GPU 计费，实例进程将被终止。已扩容的存储仍会继续计费，直至删除实例。",
    confirmLabel: "停止",
  },
} as const

export function ServerInstanceList() {
  const { serverInstances, removeServerInstance, setServerInstanceStatus } = useStore()
  const [confirmAction, setConfirmAction] = useState<{
    id: string
    action: PowerAction
  } | null>(null)

  function handleConfirmPowerAction() {
    if (!confirmAction) return
    const { id, action } = confirmAction
    setConfirmAction(null)
    setServerInstanceStatus(id, action === "start" ? "running" : "stopped")
    toast.success(action === "start" ? "已启动" : "已停止")
  }

  if (serverInstances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <Server className="size-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">还没有云主机</p>
        <p className="mt-1 text-xs text-muted-foreground">
          前往算力市场选择规格并创建实例
        </p>
        <Button asChild className="mt-4">
          <LocaleLink href="/console/server/list">算力市场</LocaleLink>
        </Button>
      </div>
    )
  }

  return (
    <>
    <div className="flex flex-col gap-3">
      {serverInstances.map((inst) => {
        const st = statusStyle[inst.status]
        const offering = getOfferingById(inst.offeringId)
        const price = offering ? getDeployPrice(offering, inst.billing) : null
        const billing =
          offering ? getServerInstanceConsumedBilling(inst, offering) : null

        return (
          <div
            key={inst.id}
            className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                  <Server className="size-5 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <LocaleLink
                      href={`/console/server/instances/${inst.id}`}
                      className="truncate text-sm font-semibold text-foreground hover:underline"
                    >
                      {inst.name}
                    </LocaleLink>
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <span className={cn("size-1.5 rounded-full", st.dot)} />
                      {st.label}
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {inst.id}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:shrink-0">
                {inst.status === "running" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ id: inst.id, action: "stop" })}
                  >
                    <Square className="size-3.5" />
                    停止
                  </Button>
                ) : inst.status === "stopped" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmAction({ id: inst.id, action: "start" })}
                  >
                    <Play className="size-3.5" />
                    启动
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <LocaleLink href={`/console/server/instances/${inst.id}`}>管理</LocaleLink>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    removeServerInstance(inst.id)
                    toast.success("已删除")
                  }}
                  aria-label="删除"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Cpu className="size-3.5" />
                {offering
                  ? `${inst.gpuCount} × ${offering.gpuModelKey}`
                  : `${inst.gpuCount} GPU`}
              </span>
              <span className="flex items-center gap-1">
                <Globe className="size-3.5" />
                {offering?.region ?? "—"}
              </span>
              <span className="font-medium text-foreground">
                {getDeployBillingLabel(inst.billing)}
                {price && ` · ${formatCNY(price.amount)}/${price.unit}`}
              </span>
            </div>

            {billing && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Wallet className="size-3.5" />
                  已消费{" "}
                  <span className="font-medium text-foreground">
                    {formatCNY(billing.totalCost)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Cpu className="size-3.5" />
                  GPU{" "}
                  <span className="font-medium text-foreground">
                    {formatCNY(billing.gpuCost)}
                  </span>
                  {billing.gpuPricePerHour > 0 && (
                    <span className="text-muted-foreground/70">
                      ({formatCNY(billing.gpuPricePerHour)}/时)
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <HardDrive className="size-3.5" />
                  存储{" "}
                  <span className="font-medium text-foreground">
                    {formatCNY(billing.storageCost)}
                  </span>
                  {billing.storagePricePerDay > 0 ? (
                    <span className="text-muted-foreground/70">
                      ({formatCNY(billing.storagePricePerDay)}/日)
                    </span>
                  ) : (
                    <span className="text-muted-foreground/70">(未扩容)</span>
                  )}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>

    <AlertDialog
      open={confirmAction !== null}
      onOpenChange={(open) => !open && setConfirmAction(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {confirmAction ? powerActionConfig[confirmAction.action].title : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmAction ? powerActionConfig[confirmAction.action].description : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirmPowerAction}>
            {confirmAction ? powerActionConfig[confirmAction.action].confirmLabel : "确认"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
