"use client"

import { useMemo } from "react"
import { Box, Cpu, RefreshCw } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import type { Instance } from "@/components/console-store"
import { cn } from "@workspace/ui/lib/utils"

export type PodStatus = "running" | "pending" | "terminating" | "failed"

export interface Pod {
  id: string
  name: string
  status: PodStatus
  gpuUtil: number
  memoryGb: number
  startedAt: string
  restarts: number
}

const podStatusMeta: Record<
  PodStatus,
  { label: string; dot: string; badge: "default" | "secondary" | "outline" | "destructive" }
> = {
  running: { label: "运行中", dot: "bg-primary", badge: "default" },
  pending: { label: "启动中", dot: "bg-chart-4 animate-pulse", badge: "secondary" },
  terminating: { label: "终止中", dot: "bg-chart-4 animate-pulse", badge: "secondary" },
  failed: { label: "失败", dot: "bg-destructive", badge: "destructive" },
}

function hashSeed(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function generatePods(endpoint: Instance): Pod[] {
  if (endpoint.status === "stopped") return []

  const seed = hashSeed(endpoint.id)
  const activeCount =
    endpoint.status === "running"
      ? Math.max(
          endpoint.minWorkers ?? 0,
          Math.min(endpoint.maxWorkers ?? 1, (seed % 3) + 1),
        )
      : endpoint.status === "deploying"
        ? 1
        : 0

  const pods: Pod[] = []
  const baseTime = new Date(endpoint.createdAt).getTime()

  for (let i = 0; i < activeCount; i++) {
    const podSeed = seed + i * 17
    pods.push({
      id: `${endpoint.id}-pod-${i + 1}`,
      name: `${endpoint.name.slice(0, 20).toLowerCase().replace(/[^a-z0-9-]/g, "-")}-worker-${i + 1}`,
      status: endpoint.status === "deploying" && i === activeCount - 1 ? "pending" : "running",
      gpuUtil: 15 + (podSeed % 75),
      memoryGb: 8 + (podSeed % 24),
      startedAt: new Date(baseTime + i * 45000 + (podSeed % 120000)).toISOString(),
      restarts: podSeed % 3,
    })
  }

  if (endpoint.status === "stopping" && pods.length > 0) {
    pods[pods.length - 1] = {
      ...pods[pods.length - 1]!,
      status: "terminating",
    }
  }

  return pods
}

export interface PodListProps {
  endpoint: Instance
  selectedPodId: string | null
  onSelectPod: (podId: string) => void
  onRefresh?: () => void
  compact?: boolean
}

export function PodList({
  endpoint,
  selectedPodId,
  onSelectPod,
  onRefresh,
  compact = false,
}: PodListProps) {
  const pods = useMemo(() => generatePods(endpoint), [endpoint])

  return (
    <div
      className={cn(
        "flex flex-col",
        compact ? "border-b border-border lg:border-b-0 lg:border-r" : "rounded-xl border border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Box className="size-4 text-primary" />
          Pods
          <Badge variant="secondary" className="font-mono text-xs">
            {pods.length}
          </Badge>
        </h2>
        {onRefresh && (
          <Button variant="ghost" size="icon" className="size-8" onClick={onRefresh} aria-label="刷新">
            <RefreshCw className="size-3.5" />
          </Button>
        )}
      </div>

      <div className={cn("flex-1 overflow-y-auto", compact && "max-h-[480px] lg:max-h-none")}>
        {pods.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Box className="size-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">暂无 Pod</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {endpoint.status === "stopped"
                ? "端点已停止"
                : "收到请求后将自动扩容"}
            </p>
          </div>
        ) : (
          <div className={cn(compact ? "flex flex-col p-2 gap-1" : "divide-y divide-border")}>
            {pods.map((pod) => {
              const meta = podStatusMeta[pod.status]
              const selected = selectedPodId === pod.id

              if (compact) {
                return (
                  <button
                    key={pod.id}
                    type="button"
                    onClick={() => onSelectPod(pod.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs font-medium text-foreground">
                        {pod.name}
                      </span>
                      <Badge variant={meta.badge} className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
                        <span className={cn("size-1 rounded-full", meta.dot)} />
                        {meta.label}
                      </Badge>
                    </div>
                    <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Cpu className="size-3" />
                      GPU {pod.gpuUtil}%
                      <span>·</span>
                      {pod.memoryGb} GB
                    </span>
                  </button>
                )
              }

              const startedLabel = new Date(pod.startedAt).toLocaleString("zh-CN", {
                dateStyle: "short",
                timeStyle: "medium",
              })

              return (
                <button
                  key={pod.id}
                  type="button"
                  onClick={() => onSelectPod(pod.id)}
                  className={cn(
                    "flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between",
                    selected && "bg-accent/50",
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium text-foreground">
                        {pod.name}
                      </span>
                      <Badge variant={meta.badge} className="gap-1 text-xs">
                        <span className={cn("size-1.5 rounded-full", meta.dot)} />
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {pod.id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Cpu className="size-3.5" />
                      GPU {pod.gpuUtil}%
                    </span>
                    <span>{pod.memoryGb} GB 内存</span>
                    <span>重启 {pod.restarts} 次</span>
                    <span>启动于 {startedLabel}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
