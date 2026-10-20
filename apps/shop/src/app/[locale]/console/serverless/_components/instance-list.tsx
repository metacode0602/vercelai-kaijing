"use client"

import { useState } from "react"
import {
  Server,
  Zap,
  Cpu,
  Globe,
  Trash2,
  Play,
  Square,
  Box,
  HardDrive,
  Wallet,
} from "lucide-react"
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
import { formatCNYDetail, FREE_DISK_GB, getDiskOveragePrice } from "@/lib/gpu-data"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { LocaleLink } from "@/lib/i18n/navigation"
import { trpc } from "@/trpc/client"

const statusStyle: Record<string, { dot: string; label: string }> = {
  running: { dot: "bg-primary", label: "运行中" },
  creating: { dot: "bg-chart-4 animate-pulse", label: "部署中" },
  deploying: { dot: "bg-chart-4 animate-pulse", label: "部署中" },
  stopping: { dot: "bg-chart-4 animate-pulse", label: "关机中" },
  stopped: { dot: "bg-muted-foreground", label: "已停止" },
  error: { dot: "bg-destructive", label: "异常" },
  releasing: { dot: "bg-chart-4 animate-pulse", label: "释放中" },
  released: { dot: "bg-muted-foreground", label: "已释放" },
}

type PowerAction = "start" | "stop"

const powerActionConfig = {
  start: {
    title: "确认启动端点？",
    description:
      "启动后将恢复 GPU 计费，Worker 将按负载自动扩缩容。存储费用在端点存在期间持续产生。",
    confirmLabel: "启动",
  },
  stop: {
    title: "确认停止端点？",
    description:
      "停止后将释放所有 Worker 并停止 GPU 计费。已挂载的存储仍会继续计费，直至删除端点。",
    confirmLabel: "停止",
  },
} as const

function hashSeed(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function getConsumedBilling(instance: {
  id: string
  status: string
  createdAt: Date
  minReplicas?: number
  maxReplicas?: number
}) {
  const storagePricePerHour = 0 // No disk overage data from DB yet
  const gpuPricePerHour = 4.82 // Default RTX 4090 price; TODO: fetch from pricing

  const hours = Math.max(
    0,
    (Date.now() - new Date(instance.createdAt).getTime()) / 3_600_000,
  )

  const gpuUptimeRatio =
    instance.status === "stopped"
      ? 0.3 + (hashSeed(instance.id) % 15) / 100
      : instance.status === "running"
        ? 0.65 + (hashSeed(instance.id) % 25) / 100
        : 0.45

  const maxWorkers = instance.maxReplicas ?? 1
  const workerFactor =
    instance.status !== "stopped"
      ? (instance.minReplicas ?? 1) / Math.max(maxWorkers, 1)
      : 0

  const gpuCost = gpuPricePerHour * hours * gpuUptimeRatio * Math.max(workerFactor, 0.15)
  const storageCost = storagePricePerHour * hours

  return {
    gpuCost,
    storageCost,
    totalCost: gpuCost + storageCost,
    gpuPricePerHour,
    storagePricePerHour,
  }
}

export function InstanceList({ type }: { type: "instance" | "serverless" }) {
  const utils = trpc.useUtils()
  const { data, isLoading } = trpc.compute.serverlessList.useQuery({
    page: 1,
    pageSize: 50,
  })

  const stopMutation = trpc.compute.stopServerless.useMutation({
    onSuccess: () => {
      utils.compute.serverlessList.invalidate()
      toast.success("已停止")
    },
    onError: (error) => toast.error(`停止失败: ${error.message}`),
  })

  const startMutation = trpc.compute.startServerless.useMutation({
    onSuccess: () => {
      utils.compute.serverlessList.invalidate()
      toast.success("已启动")
    },
    onError: (error) => toast.error(`启动失败: ${error.message}`),
  })

  const deleteMutation = trpc.compute.deleteServerless.useMutation({
    onSuccess: () => {
      utils.compute.serverlessList.invalidate()
      toast.success("已删除")
    },
    onError: (error) => toast.error(`删除失败: ${error.message}`),
  })

  const [confirmAction, setConfirmAction] = useState<{
    id: string
    action: PowerAction
  } | null>(null)

  function handleConfirmPowerAction() {
    if (!confirmAction) return
    const { id, action } = confirmAction
    setConfirmAction(null)
    if (action === "start") {
      startMutation.mutate({ id })
    } else {
      stopMutation.mutate({ id })
    }
  }

  const list = data?.items ?? []

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <div className="size-10 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <p className="mt-3 text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (list.length === 0) {
    const Icon = type === "serverless" ? Zap : Server
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <Icon className="size-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          还没有{type === "serverless" ? "端点" : "实例"}
        </p>
        <Button asChild className="mt-4">
          <LocaleLink href={type === "serverless" ? "/serverless/deploy" : "/instances/deploy"}>
            {type === "serverless" ? "部署端点" : "部署实例"}
          </LocaleLink>
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {list.map((i) => {
          const st = statusStyle[i.status] ?? statusStyle.creating
          const Icon = Zap
          const maxWorkers = i.maxReplicas ?? 1
          const runningWorkers = i.status === "running" ? (i.minReplicas ?? 1) : 0
          const billing = getConsumedBilling(i)

          return (
            <div
              key={i.id}
              className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                    <Icon className="size-5 text-accent-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <LocaleLink
                        href={`/console/serverless/instances/${i.id}`}
                        className="truncate text-sm font-semibold text-foreground hover:underline"
                      >
                        {i.name ?? i.serviceName ?? i.id}
                      </LocaleLink>
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <span className={cn("size-1.5 rounded-full", st.dot)} />
                        {st.label}
                      </Badge>
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">{i.id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:shrink-0">
                  {i.status === "running" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmAction({ id: i.id, action: "stop" })}
                    >
                      <Square className="size-3.5" />
                      停止
                    </Button>
                  ) : i.status === "stopped" || i.status === "error" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmAction({ id: i.id, action: "start" })}
                    >
                      <Play className="size-3.5" />
                      启动
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      deleteMutation.mutate({ id: i.id })
                    }}
                    aria-label="删除"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Cpu className="size-3.5" />
                  {String((i.resourceSpec as Record<string, unknown>)?.gpuCount ?? 1)} × {String((i.resourceSpec as Record<string, unknown>)?.gpuCardTypeId ?? "GPU")}
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="size-3.5" />
                  {i.region ?? "—"}
                </span>
                <span className="flex items-center gap-1">
                  <Box className="size-3.5" />
                  Worker{" "}
                  <span className="font-medium text-foreground">
                    {runningWorkers}/{maxWorkers}
                  </span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Wallet className="size-3.5" />
                  已消费{" "}
                  <span className="font-medium text-foreground">
                    {formatCNYDetail(billing.totalCost)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Cpu className="size-3.5" />
                  GPU{" "}
                  <span className="font-medium text-foreground">
                    {formatCNYDetail(billing.gpuCost)}
                  </span>
                  <span className="text-muted-foreground/70">
                    ({formatCNYDetail(billing.gpuPricePerHour)}/hr)
                  </span>
                </span>
              </div>
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
              {confirmAction !== null ? powerActionConfig[confirmAction.action].title : "确认操作"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction !== null ? powerActionConfig[confirmAction.action].description : ""}
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
