"use client"

import { useMemo, useState, type ElementType } from "react"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
} from "lucide-react"
import type { ServerInstance } from "@/components/console-store"
import { BASE_IMAGES, getOfferingById } from "@/lib/server-market-data"
import { cn } from "@/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

type EventType = "Normal" | "Warning" | "Error"
type EventCategory = "deploy" | "ops" | "system"

export interface NodeEvent {
  id: string
  ts: string
  type: EventType
  category: EventCategory
  reason: string
  message: string
  source: string
  inProgress?: boolean
}

type FilterId = "all" | EventCategory

const FILTER_OPTIONS: { id: FilterId; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "deploy", label: "部署" },
  { id: "ops", label: "运维" },
  { id: "system", label: "系统" },
]

function formatEventTime(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function offsetIso(base: string, ms: number) {
  return new Date(new Date(base).getTime() + ms).toISOString()
}

function buildNodeEvents(inst: ServerInstance): NodeEvent[] {
  const offering = getOfferingById(inst.offeringId)
  const imageMeta = BASE_IMAGES.find((image) => image.id === inst.imageId)
  const imageLabel = imageMeta?.label ?? inst.imageId
  const region = offering?.region ?? "未知区域"
  const gpuLabel = offering?.gpuModelKey ?? "GPU"
  const totalDisk =
    (offering?.dataDiskGb ?? 50) +
    (inst.diskExpandEnabled ? inst.extraDiskGb : 0)
  const nodeName = `node-${region.replace(/\s+/g, "-").toLowerCase()}-${inst.id.slice(-4)}`

  const events: NodeEvent[] = [
    {
      id: `${inst.id}-create`,
      ts: inst.createdAt,
      type: "Normal",
      category: "deploy",
      reason: "CreateInstance",
      message: `收到创建请求，实例 ${inst.name}（${inst.id}）`,
      source: "deploy-controller",
    },
    {
      id: `${inst.id}-schedule`,
      ts: offsetIso(inst.createdAt, 400),
      type: "Normal",
      category: "deploy",
      reason: "Scheduled",
      message: `已调度至节点 ${nodeName}（${region}）`,
      source: "scheduler",
    },
    {
      id: `${inst.id}-gpu`,
      ts: offsetIso(inst.createdAt, 900),
      type: "Normal",
      category: "deploy",
      reason: "GPUAllocated",
      message: `分配 ${inst.gpuCount}× ${gpuLabel}，vCPU ${offering?.vcpu ?? "—"} 核，内存 ${offering?.memoryGb ?? "—"} GB`,
      source: "resource-manager",
    },
    {
      id: `${inst.id}-disk`,
      ts: offsetIso(inst.createdAt, 1400),
      type: "Normal",
      category: "deploy",
      reason: "VolumeProvisioned",
      message: `系统盘 ${offering?.systemDiskGb ?? 30} GB，数据盘 ${totalDisk} GB 已就绪`,
      source: "storage-controller",
    },
    {
      id: `${inst.id}-pull`,
      ts: offsetIso(inst.createdAt, 2100),
      type: "Normal",
      category: "deploy",
      reason: "Pulling",
      message: `开始拉取镜像 ${imageLabel} · ${inst.imageVersion}`,
      source: "kubelet",
    },
    {
      id: `${inst.id}-pulled`,
      ts: offsetIso(inst.createdAt, 4800),
      type: "Normal",
      category: "deploy",
      reason: "Pulled",
      message: "镜像拉取完成",
      source: "kubelet",
    },
  ]

  if (inst.volumeId) {
    events.push({
      id: `${inst.id}-mount`,
      ts: offsetIso(inst.createdAt, 5600),
      type: "Normal",
      category: "deploy",
      reason: "VolumeMounted",
      message: `网络卷 ${inst.volumeId} 已挂载至 /workspace`,
      source: "kubelet",
    })
  }

  if (inst.sshEnabled) {
    events.push({
      id: `${inst.id}-ssh`,
      ts: offsetIso(inst.createdAt, 6200),
      type: "Normal",
      category: "deploy",
      reason: "SSHConfigured",
      message: inst.sshKey.trim()
        ? "SSH 公钥已注入，端口 22 已开放"
        : "SSH 已启用，等待公钥配置后生效",
      source: "deploy-controller",
    })
  }

  if (inst.ports?.trim()) {
    events.push({
      id: `${inst.id}-ports`,
      ts: offsetIso(inst.createdAt, 6800),
      type: "Normal",
      category: "deploy",
      reason: "PortMapped",
      message: `端口映射已配置：${inst.ports}`,
      source: "network-controller",
    })
  }

  events.push(
    {
      id: `${inst.id}-started`,
      ts: offsetIso(inst.createdAt, 7600),
      type: "Normal",
      category: "deploy",
      reason: "Started",
      message: "容器已启动，正在执行健康检查",
      source: "kubelet",
    },
    {
      id: `${inst.id}-healthy`,
      ts: offsetIso(inst.createdAt, 9200),
      type: "Normal",
      category: "deploy",
      reason: "Healthy",
      message: "健康检查通过，实例部署完成",
      source: "health-checker",
    },
    {
      id: `${inst.id}-ip`,
      ts: offsetIso(inst.createdAt, 9800),
      type: "Normal",
      category: "deploy",
      reason: "PublicIPBound",
      message: "公网 IP 已绑定，实例可对外访问",
      source: "network-controller",
    },
  )

  if (inst.status === "running") {
    events.push({
      id: `${inst.id}-running`,
      ts: offsetIso(inst.createdAt, 10200),
      type: "Normal",
      category: "ops",
      reason: "PowerOn",
      message: "实例已开机，按当前计费方式开始计费",
      source: "lifecycle-manager",
    })
  }

  if (inst.status === "stopped") {
    events.push(
      {
        id: `${inst.id}-running-hist`,
        ts: offsetIso(inst.createdAt, 10200),
        type: "Normal",
        category: "ops",
        reason: "PowerOn",
        message: "实例已开机",
        source: "lifecycle-manager",
      },
      {
        id: `${inst.id}-stopped`,
        ts: offsetIso(inst.createdAt, 86400000),
        type: "Normal",
        category: "ops",
        reason: "PowerOff",
        message: "实例已关机，计费已停止",
        source: "lifecycle-manager",
      },
    )
  }

  events.push({
    id: `${inst.id}-sync`,
    ts: offsetIso(inst.createdAt, 12000),
    type: "Normal",
    category: "system",
    reason: "StateSynced",
    message: `状态已同步，当前：${statusLabel(inst.status)}`,
    source: "control-plane",
  })

  if (inst.status === "deploying") {
    events.push({
      id: `${inst.id}-deploying`,
      ts: new Date().toISOString(),
      type: "Normal",
      category: "deploy",
      reason: "Deploying",
      message: "正在重新部署服务，拉取镜像并更新容器配置…",
      source: "deploy-controller",
      inProgress: true,
    })
  }

  if (inst.status === "stopping") {
    events.push({
      id: `${inst.id}-stopping`,
      ts: new Date().toISOString(),
      type: "Warning",
      category: "ops",
      reason: "Stopping",
      message: "收到关机信号，等待容器优雅退出…",
      source: "lifecycle-manager",
      inProgress: true,
    })
  }

  return events.sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  )
}

function statusLabel(status: ServerInstance["status"]) {
  switch (status) {
    case "running":
      return "运行中"
    case "deploying":
      return "部署中"
    case "stopping":
      return "关机中"
    case "stopped":
      return "已停止"
  }
}

const typeMeta: Record<
  EventType,
  { badge: "default" | "secondary" | "destructive"; dotClass: string; icon: ElementType }
> = {
  Normal: { badge: "secondary", dotClass: "bg-primary", icon: CheckCircle2 },
  Warning: { badge: "secondary", dotClass: "bg-chart-4", icon: AlertCircle },
  Error: { badge: "destructive", dotClass: "bg-destructive", icon: AlertCircle },
}

interface NodeEventsPanelProps {
  inst: ServerInstance
}

export function NodeEventsPanel({ inst }: NodeEventsPanelProps) {
  const [filter, setFilter] = useState<FilterId>("all")
  const events = useMemo(() => buildNodeEvents(inst), [inst])

  const filtered =
    filter === "all" ? events : events.filter((event) => event.category === filter)

  const inProgressCount = events.filter((event) => event.inProgress).length

  return (
    <Card className="gap-4 rounded-2xl p-4 ring-border/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Activity className="size-4 text-primary" />
            节点事件
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            部署与运维过程中由控制面、调度器、节点代理产生的过程日志与消息
          </p>
        </div>
        {inProgressCount > 0 && (
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Loader2 className="size-3 animate-spin" />
            {inProgressCount} 项进行中
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const count =
            option.id === "all"
              ? events.length
              : events.filter((event) => event.category === option.id).length
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === option.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {option.label}
              <span className="ml-1 opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      <ScrollArea className="h-80 rounded-xl border border-border bg-muted/20">
        {filtered.length === 0 ? (
          <div className="flex h-80 flex-col items-center justify-center gap-2 text-center">
            <Info className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">该分类下暂无事件</p>
          </div>
        ) : (
          <div className="relative px-4 py-3">
            <div className="absolute bottom-3 left-[1.375rem] top-3 w-px bg-border" />
            <ul className="space-y-4">
              {filtered.map((event, index) => {
                const meta = typeMeta[event.type]
                const Icon = event.inProgress ? Loader2 : meta.icon
                const isLast = index === filtered.length - 1

                return (
                  <li key={event.id} className="relative flex gap-3 pl-0">
                    <div
                      className={cn(
                        "relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background",
                        event.inProgress && "border-primary/40",
                      )}
                    >
                      {event.inProgress ? (
                        <Loader2 className="size-3 animate-spin text-primary" />
                      ) : (
                        <span className={cn("size-2 rounded-full", meta.dotClass)} />
                      )}
                    </div>
                    <div className={cn("min-w-0 flex-1 pb-1", isLast && "pb-0")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {event.reason}
                        </span>
                        <Badge variant={meta.badge} className="text-[10px]">
                          {event.type}
                        </Badge>
                        {event.inProgress && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Icon className="size-2.5" />
                            进行中
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{event.message}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground/80">
                        {event.source} · {formatEventTime(event.ts)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </ScrollArea>
    </Card>
  )
}
