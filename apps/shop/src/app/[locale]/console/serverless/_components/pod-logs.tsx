"use client"

import { useEffect, useRef, useState } from "react"
import { RefreshCw, ScrollText } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import type { Instance } from "@/components/console-store"
import { cn } from "@workspace/ui/lib/utils"
import { generatePods, type Pod } from "./pod-list"

interface LogLine {
  ts: string
  level: "info" | "warn" | "error"
  message: string
}

function formatTs(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19)
}

function seedPodLogs(endpoint: Instance, pod: Pod): LogLine[] {
  const started = new Date(pod.startedAt)
  const base: LogLine[] = [
    {
      ts: formatTs(started),
      level: "info",
      message: `[scheduler] Pod ${pod.name} 已调度至 ${endpoint.region}`,
    },
    {
      ts: formatTs(new Date(started.getTime() + 800)),
      level: "info",
      message: `[pull] 拉取镜像 ${endpoint.image}`,
    },
    {
      ts: formatTs(new Date(started.getTime() + 3200)),
      level: "info",
      message: `[pull] 镜像拉取完成`,
    },
  ]

  if (endpoint.volumeId) {
    base.push({
      ts: formatTs(new Date(started.getTime() + 4100)),
      level: "info",
      message: `[mount] 挂载网络卷 ${endpoint.volumeId} → /workspace`,
    })
  }

  if (endpoint.envVars?.trim()) {
    base.push({
      ts: formatTs(new Date(started.getTime() + 4800)),
      level: "info",
      message: `[env] 已注入 ${endpoint.envVars.split("\n").filter(Boolean).length} 个环境变量`,
    })
  }

  if (endpoint.startCommand?.trim()) {
    base.push({
      ts: formatTs(new Date(started.getTime() + 5200)),
      level: "info",
      message: `[entrypoint] ${endpoint.startCommand.trim()}`,
    })
  }

  base.push(
    {
      ts: formatTs(new Date(started.getTime() + 6800)),
      level: "info",
      message: `[runtime] Worker 就绪，监听端口 ${endpoint.ports ?? "8000"}`,
    },
    {
      ts: formatTs(new Date(started.getTime() + 7200)),
      level: "info",
      message: `[gpu] 已分配 ${endpoint.gpuCount}× ${endpoint.gpu}，CUDA ${endpoint.cudaVersion ?? "12.x"}`,
    },
  )

  if (pod.restarts > 0) {
    base.unshift({
      ts: formatTs(new Date(started.getTime() - 60000)),
      level: "warn",
      message: `[kubelet] Pod 已重启 ${pod.restarts} 次（历史记录）`,
    })
  }

  return base
}

const runtimeLines: LogLine[] = [
  { ts: "", level: "info", message: "[health] 健康检查通过" },
  { ts: "", level: "info", message: "[inference] 收到推理请求，batch=1" },
  { ts: "", level: "info", message: "[inference] 请求完成，latency=142ms" },
  { ts: "", level: "warn", message: "[autoscaler] GPU 利用率升高，保持当前副本" },
  { ts: "", level: "info", message: "[metrics] GPU 显存占用稳定" },
]

const levelColor: Record<LogLine["level"], string> = {
  info: "text-muted-foreground",
  warn: "text-chart-4",
  error: "text-destructive",
}

export interface PodLogsProps {
  endpoint: Instance
  podId: string | null
  embedded?: boolean
}

export function PodLogs({ endpoint, podId, embedded = false }: PodLogsProps) {
  const pods = generatePods(endpoint)
  const pod = pods.find((p) => p.id === podId) ?? null

  const [logs, setLogs] = useState<LogLine[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!podId) {
      setLogs([])
      return
    }
    const currentPod = generatePods(endpoint).find((p) => p.id === podId)
    if (!currentPod) {
      setLogs([])
      return
    }
    setLogs(seedPodLogs(endpoint, currentPod))
  }, [
    podId,
    endpoint.id,
    endpoint.status,
    endpoint.image,
    endpoint.region,
    endpoint.volumeId,
    endpoint.envVars,
    endpoint.startCommand,
    endpoint.ports,
    endpoint.gpuCount,
    endpoint.gpu,
    endpoint.cudaVersion,
  ])

  useEffect(() => {
    if (!podId || pod?.status !== "running") return

    const interval = setInterval(() => {
      const line = runtimeLines[Math.floor(Math.random() * runtimeLines.length)]!
      setLogs((prev) =>
        [...prev, { ...line, ts: formatTs(new Date()) }].slice(-200),
      )
    }, 3500)

    return () => clearInterval(interval)
  }, [podId, pod?.status])

  useEffect(() => {
    if (!autoScroll) return
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    )
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [logs, autoScroll])

  function refresh() {
    if (!pod) return
    setLogs([
      ...seedPodLogs(endpoint, pod),
      {
        ts: formatTs(new Date()),
        level: "info",
        message: "[runtime] 日志流已刷新",
      },
    ])
  }

  const emptyState = (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-6 py-12 text-center",
        !embedded && "rounded-xl border border-dashed border-border bg-card",
      )}
    >
      <ScrollText className="size-8 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium text-foreground">选择 Pod 查看日志</p>
      <p className="mt-1 text-xs text-muted-foreground">
        在左侧列表中点击一个 Pod
      </p>
    </div>
  )

  if (!podId) return emptyState
  if (!pod) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-6", !embedded && "rounded-xl border border-border bg-card")}>
        <p className="text-sm text-muted-foreground">所选 Pod 不存在或已终止。</p>
      </div>
    )
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", embedded ? "bg-card" : "rounded-xl border border-border bg-card")}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ScrollText className="size-4 shrink-0 text-primary" />
            日志
          </h2>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{pod.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="hidden cursor-pointer items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="size-3.5 rounded border-border"
            />
            自动滚动
          </label>
          <Button variant="ghost" size="icon" className="size-8" onClick={refresh} aria-label="刷新日志">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>
      <div ref={scrollAreaRef} className="min-h-0 flex-1">
        <ScrollArea className={cn(embedded ? "h-full min-h-[400px]" : "h-80")}>
          <div className="space-y-0.5 p-4 font-mono text-[11px] leading-relaxed">
            {logs.map((line, i) => (
              <div key={`${line.ts}-${i}`} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/70">{line.ts}</span>
                <span className={levelColor[line.level]}>{line.message}</span>
              </div>
            ))}
            {pod.status === "pending" && (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/70">{formatTs(new Date())}</span>
                <span className="text-chart-4">[pull] 镜像拉取中…</span>
              </div>
            )}
            {pod.status === "terminating" && (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/70">{formatTs(new Date())}</span>
                <span className="text-chart-4">[shutdown] 收到 SIGTERM，Worker 正在优雅退出…</span>
              </div>
            )}
            {pod.status === "failed" && (
              <div className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/70">{formatTs(new Date())}</span>
                <span className="text-destructive">[error] 容器异常退出，Exit Code 137</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
