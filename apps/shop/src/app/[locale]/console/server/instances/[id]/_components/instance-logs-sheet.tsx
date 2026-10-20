"use client"

import { useEffect, useRef, useState } from "react"
import { RefreshCw, ScrollText, X } from "lucide-react"
import type { ServerInstance } from "@/components/console-store"
import { BASE_IMAGES, getOfferingById } from "@/lib/server-market-data"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"

interface LogLine {
  ts: string
  level: "info" | "warn" | "error"
  message: string
}

function formatTs(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19)
}

function seedContainerLogs(inst: ServerInstance): LogLine[] {
  const started = new Date(inst.createdAt)
  const offering = getOfferingById(inst.offeringId)
  const imageMeta = BASE_IMAGES.find((image) => image.id === inst.imageId)
  const imageLabel = imageMeta?.label ?? inst.imageId

  const base: LogLine[] = [
    {
      ts: formatTs(started),
      level: "info",
      message: `[container] 实例 ${inst.id} 已创建`,
    },
    {
      ts: formatTs(new Date(started.getTime() + 600)),
      level: "info",
      message: `[pull] 拉取镜像 ${imageLabel} (${inst.imageVersion})`,
    },
    {
      ts: formatTs(new Date(started.getTime() + 2800)),
      level: "info",
      message: "[pull] 镜像拉取完成",
    },
  ]

  if (inst.volumeId) {
    base.push({
      ts: formatTs(new Date(started.getTime() + 3600)),
      level: "info",
      message: `[mount] 挂载网络卷 ${inst.volumeId} → /workspace`,
    })
  }

  if (inst.sshEnabled) {
    base.push({
      ts: formatTs(new Date(started.getTime() + 4200)),
      level: "info",
      message: "[sshd] SSH 服务已启动，端口 22",
    })
  }

  base.push(
    {
      ts: formatTs(new Date(started.getTime() + 5000)),
      level: "info",
      message: `[runtime] 容器就绪，暴露端口 ${inst.ports || "—"}`,
    },
    {
      ts: formatTs(new Date(started.getTime() + 5400)),
      level: "info",
      message: `[gpu] 已分配 ${inst.gpuCount}× ${offering?.gpuModelKey ?? "GPU"}（${offering?.region ?? "—"}）`,
    },
  )

  return base
}

const runtimeLines: LogLine[] = [
  { ts: "", level: "info", message: "[health] 容器健康检查通过" },
  { ts: "", level: "info", message: "[jupyter] Kernel 活动正常" },
  { ts: "", level: "info", message: "[metrics] GPU 利用率 34%，显存 12.4 / 24 GB" },
  { ts: "", level: "info", message: "[stdout] INFO: Application startup complete" },
  { ts: "", level: "warn", message: "[metrics] GPU 温度 78°C，仍在安全范围内" },
  { ts: "", level: "info", message: "[health] 端口 8888 响应 200 OK" },
]

const levelColor: Record<LogLine["level"], string> = {
  info: "text-muted-foreground",
  warn: "text-chart-4",
  error: "text-destructive",
}

interface InstanceLogsSheetProps {
  inst: ServerInstance
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InstanceLogsSheet({ inst, open, onOpenChange }: InstanceLogsSheetProps) {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setLogs(seedContainerLogs(inst))
  }, [
    open,
    inst.id,
    inst.status,
    inst.imageId,
    inst.imageVersion,
    inst.volumeId,
    inst.ports,
    inst.sshEnabled,
    inst.gpuCount,
    inst.offeringId,
    inst.createdAt,
  ])

  useEffect(() => {
    if (!open || inst.status !== "running") return

    const interval = setInterval(() => {
      const line = runtimeLines[Math.floor(Math.random() * runtimeLines.length)]!
      setLogs((prev) =>
        [...prev, { ...line, ts: formatTs(new Date()) }].slice(-300),
      )
    }, 2800)

    return () => clearInterval(interval)
  }, [open, inst.status])

  useEffect(() => {
    if (!autoScroll || !open) return
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    )
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [logs, autoScroll, open])

  function refresh() {
    setLogs([
      ...seedContainerLogs(inst),
      {
        ts: formatTs(new Date()),
        level: "info",
        message: "[runtime] 日志流已刷新",
      },
    ])
  }

  function handleClose() {
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
      }}
    >
      <SheetContent
        side="left"
        showCloseButton={false}
        className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <ScrollText className="size-4 shrink-0 text-primary" />
                运行日志
              </SheetTitle>
              <SheetDescription className="truncate font-mono text-xs">
                {inst.name} · {inst.id}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={handleClose}
              aria-label="关闭日志"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            容器 stdout / stderr ·{" "}
            {inst.status === "running"
              ? "实时流"
              : inst.status === "stopped"
                ? "已停止"
                : statusLabel(inst.status)}
          </p>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(event) => setAutoScroll(event.target.checked)}
                className="size-3.5 rounded border-border"
              />
              自动滚动
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={refresh}
              aria-label="刷新日志"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>

        <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-0.5 p-4 font-mono text-[11px] leading-relaxed">
              {logs.length === 0 && (
                <p className="text-muted-foreground">暂无日志输出</p>
              )}
              {logs.map((line, index) => (
                <div key={`${line.ts}-${index}`} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/70">{line.ts}</span>
                  <span className={levelColor[line.level]}>{line.message}</span>
                </div>
              ))}
              {inst.status === "deploying" && (
                <div className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/70">
                    {formatTs(new Date())}
                  </span>
                  <span className="text-chart-4">[pull] 镜像拉取 / 容器启动中…</span>
                </div>
              )}
              {inst.status === "stopping" && (
                <div className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/70">
                    {formatTs(new Date())}
                  </span>
                  <span className="text-chart-4">
                    [shutdown] 收到 SIGTERM，容器正在优雅退出…
                  </span>
                </div>
              )}
              {inst.status === "stopped" && logs.length > 0 && (
                <div className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground/70">
                    {formatTs(new Date())}
                  </span>
                  <span className="text-muted-foreground">[container] 实例已停止</span>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button variant="outline" className="w-full" onClick={handleClose}>
            关闭
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function statusLabel(status: ServerInstance["status"]) {
  switch (status) {
    case "deploying":
      return "部署中"
    case "stopping":
      return "关机中"
    default:
      return status
  }
}
