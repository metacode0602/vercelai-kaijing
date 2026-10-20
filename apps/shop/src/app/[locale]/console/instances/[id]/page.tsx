"use client"

import { use, useEffect, useRef, useState } from "react"
import { notFound } from "next/navigation"
import { toast } from "sonner"
import {
  Activity,
  ArrowLeft,
  Box,
  CheckCircle2,
  Clock,
  Container,
  Copy,
  Cpu,
  Globe,
  HardDrive,
  KeyRound,
  Play,
  Power,
  PowerOff,
  Server,
  Terminal,
  Trash2,
} from "lucide-react"
import { useStore, type Instance } from "@/components/console-store"
import { formatUSD, formatUSDDetail, FREE_DISK_GB, getDiskOveragePrice } from "@/lib/gpu-data"
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/navigation"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { ChevronRight } from "lucide-react"

const powerActionConfig = {
  start: {
    title: "确认开机？",
    description: "开机后将恢复 GPU 计费，实例重新启动并绑定公网 IP。",
    confirmLabel: "开机",
    destructive: false,
  },
  shutdown: {
    title: "确认关机？",
    description: "关机将向实例发送优雅停止信号，进程正常退出后停止计费。",
    confirmLabel: "关机",
    destructive: false,
  },
  force: {
    title: "确认强制关机？",
    description:
      "强制关机将立即终止实例进程，未保存的数据可能丢失。建议优先使用「关机」进行优雅停止。",
    confirmLabel: "强制关机",
    destructive: true,
  },
} as const

type PowerAction = keyof typeof powerActionConfig

const statusMeta: Record<
  Instance["status"],
  { dot: string; label: string; badge: "default" | "secondary" | "outline" }
> = {
  running: { dot: "bg-primary", label: "运行中", badge: "default" },
  deploying: { dot: "bg-chart-4 animate-pulse", label: "部署中", badge: "secondary" },
  stopping: { dot: "bg-chart-4 animate-pulse", label: "关机中", badge: "secondary" },
  stopped: { dot: "bg-muted-foreground", label: "已停止", badge: "outline" },
}

function seedLogs(inst: Instance): Array<{ time: string; level: string; message: string }> {
  const base = [
    "Scheduling instance on node cn-gpu-03...",
    "Pulling image…",
  ]
  if (inst.status === "running") {
    return [
      { time: new Date(Date.now() - 1000 * 60 * 3).toLocaleTimeString(), level: "INFO", message: "Instance started" },
      { time: new Date(Date.now() - 1000 * 60 * 4).toLocaleTimeString(), level: "INFO", message: "SSH authorized (public key matched)" },
      { time: new Date(Date.now() - 1000 * 60 * 5).toLocaleTimeString(), level: "INFO", message: "Port exposed: 8888,22" },
    ]
  }
  return [
    { time: new Date(Date.now() - 1000 * 60 * 2).toLocaleTimeString(), level: "INFO", message: base[1] },
    { time: new Date(Date.now() - 1000 * 60).toLocaleTimeString(), level: "INFO", message: base[0] },
  ]
}

export default function AppInstanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = use(params)
  const { new: isNew } = use(searchParams)
  const router = useLocaleRouter()
  const { instances, volumes, setInstanceStatus, removeInstance } = useStore()
  const inst = instances.find((i) => i.id === id)

  const [confirmAction, setConfirmAction] = useState<PowerAction | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const newBannerVisible = isNew === "1"
  const [newBannerShown, setNewBannerShown] = useState(false)

  useEffect(() => {
    if (inst?.type === "serverless") {
      router.replace(`/console/serverless/instances/${id}${isNew ? "?new=1" : ""}`)
    }
  }, [inst?.type, id, isNew, router])

  if (!inst) {
    notFound()
  }

  if (inst.type === "serverless") {
    return null
  }

  const fakeIp = `203.0.113.${(parseInt(id.slice(-2), 36) % 200) + 10}`
  const sshCmd = `ssh root@${fakeIp} -p 22`
  const isRunning = inst.status === "running"
  const isStopped = inst.status === "stopped"
  const isTransitioning = inst.status === "deploying" || inst.status === "stopping"
  const attachedVolume = volumes.find((v) => v.id === inst.volumeId)
  const diskOverage = getDiskOveragePrice(inst.diskSize ?? FREE_DISK_GB)
  const status = statusMeta[inst.status]
  const logs = seedLogs(inst)

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text)
    toast.success(`${label}已复制`)
  }

  function clearStopTimer() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current)
      stopTimerRef.current = null
    }
  }

  function handleStart() {
    if (!isStopped) return
    clearStopTimer()
    setActionLoading("start")
    setInstanceStatus(id, "deploying")
    toast.info("正在开机…")
    setTimeout(() => {
      setInstanceStatus(id, "running")
      setActionLoading(null)
      toast.success("实例已启动")
    }, 2000)
  }

  function handleShutdown() {
    if (!isRunning) return
    clearStopTimer()
    setActionLoading("shutdown")
    setInstanceStatus(id, "stopping")
    toast.info("正在优雅关机…")
    stopTimerRef.current = setTimeout(() => {
      setInstanceStatus(id, "stopped")
      setActionLoading(null)
      stopTimerRef.current = null
      toast.success("实例已关机")
    }, 2500)
  }

  function handleForceStop() {
    clearStopTimer()
    setActionLoading("force")
    setInstanceStatus(id, "stopped")
    setActionLoading(null)
    toast.success("已强制关机")
  }

  function handleConfirmPowerAction() {
    if (!confirmAction) return
    const action = confirmAction
    setConfirmAction(null)
    if (action === "start") handleStart()
    else if (action === "shutdown") handleShutdown()
    else handleForceStop()
  }

  function handleDelete() {
    removeInstance(id)
    setDeleteOpen(false)
    toast.success("实例已删除")
    router.push("/console/apps")
  }

  const createdLabel = new Date(inst.createdAt).toLocaleString("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none pb-4">
        <div className="mx-auto w-full max-w-7xl px-5 py-6">
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <LocaleLink href="/console/apps">应用</LocaleLink>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRight className="size-3.5" />
              </BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>{inst.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <LocaleLink
            href="/console/apps"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            返回实例列表
          </LocaleLink>

          {newBannerVisible && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/30 bg-accent p-4">
              <CheckCircle2 className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-accent-foreground">
                  实例已成功部署
                </p>
                <p className="mt-0.5 text-xs text-accent-foreground/80">
                  可通过 SSH 连接实例，或访问已暴露的端口。
                </p>
              </div>
            </div>
          )}

          {/* 概览与操作 */}
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                  <Server className="size-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{inst.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{inst.id}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    创建于 {createdLabel}
                  </p>
                </div>
              </div>
              <Badge variant={status.badge} className="w-fit gap-1.5">
                <span className={cn("size-1.5 rounded-full", status.dot)} />
                {status.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat icon={Cpu} label="GPU" value={`${inst.gpuCount} × ${inst.gpu}`} />
              <Stat icon={Globe} label="区域" value={inst.region} />
              <Stat icon={Activity} label="计费" value={inst.billing} />
              <Stat icon={HardDrive} label="价格" value={`${formatUSD(inst.pricePerHour)}/hr`} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => setConfirmAction("start")}
                disabled={!isStopped || actionLoading !== null}
              >
                <Play className="size-3.5" />
                开机
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction("shutdown")}
                disabled={!isRunning || actionLoading !== null}
              >
                <Power className="size-3.5" />
                关机
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmAction("force")}
                disabled={isStopped || isTransitioning || actionLoading !== null}
              >
                <PowerOff className="size-3.5" />
                强制关机
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-3.5" />
                删除
              </Button>
            </div>
          </Card>

          {/* 部署配置 */}
          <Card className="mt-4 gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Box className="size-4 text-primary" />
              部署配置
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label="模板" value={inst.templateLabel ?? "—"} />
              <InfoRow label="镜像" value={inst.image} mono />
              {inst.templateMode === "custom" && inst.registrySource && (
                <InfoRow
                  label="镜像来源"
                  value={inst.registrySource === "platform" ? "平台镜像" : "自定义镜像"}
                />
              )}
              <InfoRow
                label="容器磁盘"
                value={
                  inst.diskSize
                    ? inst.diskSize > FREE_DISK_GB
                      ? `${inst.diskSize} GB（${FREE_DISK_GB} GB 免费 + ${inst.diskSize - FREE_DISK_GB} GB 按量 ${formatUSDDetail(diskOverage)}/hr）`
                      : `${inst.diskSize} GB（${FREE_DISK_GB} GB 内免费）`
                    : "—"
                }
              />
              <InfoRow
                label="S3 网络卷"
                value={attachedVolume ? `${attachedVolume.name} (${attachedVolume.id})` : "未挂载"}
              />
              <InfoRow label="SSH" value={inst.sshEnabled ? "已启用" : "未启用"} />
              <InfoRow label="暴露端口" value={inst.ports ?? "—"} />
              {inst.envVars?.trim() && (
                <InfoRow label="环境变量" value={inst.envVars.trim()} mono className="sm:col-span-2" />
              )}
              {inst.startCommand?.trim() && (
                <InfoRow
                  label="启动命令"
                  value={inst.startCommand.trim()}
                  mono
                  className="sm:col-span-2"
                />
              )}
              {inst.sshEnabled && inst.sshKey?.trim() && (
                <div className="sm:col-span-2">
                  <InfoRow
                    label="SSH 公钥"
                    value={
                      inst.sshKey.length > 48
                        ? `${inst.sshKey.slice(0, 44)}…`
                        : inst.sshKey
                    }
                    mono
                    icon={KeyRound}
                  />
                </div>
              )}
            </div>
          </Card>

          {/* 连接信息 */}
          <Card className="mt-4 gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Terminal className="size-4 text-primary" />
              连接信息
            </h2>
            <div className="flex flex-col gap-3">
              <Field
                label="公网 IP"
                value={isStopped ? "—（实例已停止）" : fakeIp}
                onCopy={isStopped ? undefined : () => copy(fakeIp, "IP")}
              />
              {inst.sshEnabled ? (
                <Field
                  label="SSH 命令"
                  value={isStopped ? "—（实例已停止）" : sshCmd}
                  onCopy={isStopped ? undefined : () => copy(sshCmd, "SSH 命令")}
                  mono
                />
              ) : (
                <p className="text-xs text-muted-foreground">该实例未启用 SSH。</p>
              )}
              <Field
                label="暴露端口"
                value={inst.ports ?? "-"}
                onCopy={() => copy(inst.ports ?? "", "端口")}
              />
              {inst.ports
                ?.split(",")
                .map((p) => p.trim())
                .filter(Boolean).length ? (
                <div className="flex flex-wrap gap-2">
                  {inst.ports!
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .map((port) => (
                      <Badge key={port} variant="secondary" className="font-mono text-xs">
                        <Container className="mr-1 size-3" />
                        :{port}
                      </Badge>
                    ))}
                </div>
              ) : null}
            </div>
          </Card>

          {/* 运行日志 */}
          <Card className="mt-4 gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="text-sm font-bold text-foreground">运行日志</h2>
            <div className="rounded-lg border bg-background/60">
              <div className="max-h-64 space-y-0 overflow-y-auto font-mono text-xs">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 border-b border-border/60 px-3 py-1.5 last:border-b-0">
                    <span className="shrink-0 text-muted-foreground">{log.time}</span>
                    <span
                      className={cn(
                        "shrink-0",
                        log.level === "ERROR" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {log.level}
                    </span>
                    <span className="text-foreground/90">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction ? powerActionConfig[confirmAction].title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction ? powerActionConfig[confirmAction].description : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction && powerActionConfig[confirmAction].destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={handleConfirmPowerAction}
            >
              {confirmAction ? powerActionConfig[confirmAction].confirmLabel : "确认"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除实例？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后实例将被销毁，数据无法恢复。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
  icon: Icon,
  className,
}: {
  label: string
  value: string
  mono?: boolean
  icon?: React.ElementType
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-foreground",
          mono && "break-all font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function Field({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string
  value: string
  onCopy?: () => void
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className={cn(
            "flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground",
            mono && "font-mono",
          )}
        >
          {value}
        </code>
        {onCopy && (
          <Button
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={onCopy}
            aria-label={`复制 ${label}`}
          >
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}