"use client"

import { use, useEffect, useRef, useState } from "react"
import { notFound } from "next/navigation"
import { toast } from "sonner"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  ChevronRight,
  Container,
  Copy,
  Clock,
  ImageIcon,
  Loader2,
  Play,
  Power,
  PowerOff,
  Rocket,
  Save,
  ScrollText,
  Server,
  Terminal,
  Trash2,
} from "lucide-react"
import { useStore, type ServerInstance } from "@/components/console-store"
import { LocaleLink, useLocaleRouter } from "@/lib/i18n/navigation"
import {
  BASE_IMAGES,
  DEPLOY_BILLING_OPTIONS,
  getDeployBillingLabel,
  getOfferingById,
  type DeployBillingMethod,
} from "@/lib/server-market-data"
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
import { InstanceSummaryCard } from "../../deploy/_components/instance-summary-card"
import { S3VolumeMount } from "../../deploy/_components/s3-volume-mount"
import { SegmentedControl } from "../../../../../../components/segmented-control"
import {
  SshAccessStep,
  type SshAccessValues,
} from "../../deploy/_components/ssh-access-step"
import { SaveImageDialog } from "./_components/save-image-dialog"
import { InstanceLogsSheet } from "./_components/instance-logs-sheet"
import { NodeEventsPanel } from "./_components/node-events-panel"
import { UpgradeConfigDialog } from "./_components/upgrade-config-dialog"

const powerActionConfig = {
  start: {
    title: "确认开机？",
    description:
      "开机后将恢复计费，实例重新启动并绑定公网 IP。按量计费实例以开机时的价格为准。",
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
  ServerInstance["status"],
  { dot: string; label: string; badge: "default" | "secondary" | "outline" }
> = {
  running: { dot: "bg-primary", label: "运行中", badge: "default" },
  deploying: { dot: "bg-chart-4 animate-pulse", label: "部署中", badge: "secondary" },
  stopping: { dot: "bg-chart-4 animate-pulse", label: "关机中", badge: "secondary" },
  stopped: { dot: "bg-muted-foreground", label: "已停止", badge: "outline" },
}

type ConfigDraft = {
  billing: DeployBillingMethod
  gpuCount: number
  diskExpandEnabled: boolean
  extraDiskGb: number
  volumeId: string
  sshAccess: SshAccessValues
}

function toDraft(inst: ServerInstance): ConfigDraft {
  return {
    billing: inst.billing,
    gpuCount: inst.gpuCount,
    diskExpandEnabled: inst.diskExpandEnabled,
    extraDiskGb: inst.extraDiskGb,
    volumeId: inst.volumeId ?? "none",
    sshAccess: {
      sshEnabled: inst.sshEnabled,
      sshKey: inst.sshKey,
      ports: inst.ports,
    },
  }
}

function draftsEqual(a: ConfigDraft, b: ConfigDraft) {
  return (
    a.billing === b.billing &&
    a.gpuCount === b.gpuCount &&
    a.diskExpandEnabled === b.diskExpandEnabled &&
    a.extraDiskGb === b.extraDiskGb &&
    a.volumeId === b.volumeId &&
    a.sshAccess.sshEnabled === b.sshAccess.sshEnabled &&
    a.sshAccess.sshKey === b.sshAccess.sshKey &&
    a.sshAccess.ports === b.sshAccess.ports
  )
}

export default function ServerInstanceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = use(params)
  const { new: isNew } = use(searchParams)
  const router = useLocaleRouter()
  const {
    serverInstances,
    volumes,
    updateServerInstance,
    setServerInstanceStatus,
    removeServerInstance,
  } = useStore()
  const inst = serverInstances.find((item) => item.id === id)

  const [draft, setDraft] = useState<ConfigDraft | null>(null)
  const [savedDraft, setSavedDraft] = useState<ConfigDraft | null>(null)
  const [saveImageOpen, setSaveImageOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [deployConfirmOpen, setDeployConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<PowerAction | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deploying, setDeploying] = useState(false)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (inst) {
      const initial = toDraft(inst)
      setDraft(initial)
      setSavedDraft(initial)
    }
  }, [inst?.id])

  useEffect(() => {
    if (isNew && inst?.status === "deploying") {
      const timer = setTimeout(() => {
        setServerInstanceStatus(id, "running")
        toast.success("实例部署完成，已启动")
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [id, inst?.status, isNew, setServerInstanceStatus])

  if (!inst || !draft || !savedDraft) {
    if (!inst) notFound()
    return null
  }

  const offering = getOfferingById(inst.offeringId)
  if (!offering) notFound()

  const imageMeta = BASE_IMAGES.find((image) => image.id === inst.imageId)
  const imageLabel = imageMeta?.label ?? inst.imageId

  const isDirty = !draftsEqual(draft, savedDraft)
  const isRunning = inst.status === "running"
  const isStopped = inst.status === "stopped"
  const isTransitioning =
    inst.status === "deploying" || inst.status === "stopping"
  const status = statusMeta[inst.status]
  const fakeIp = `101.89.${(parseInt(id.slice(-3), 36) % 200) + 10}.${(parseInt(id.slice(-2), 36) % 240) + 10}`
  const sshCmd = `ssh root@${fakeIp} -p 22`
  const totalDiskGb =
    offering.dataDiskGb + (draft.diskExpandEnabled ? draft.extraDiskGb : 0)

  const configLocked = isRunning || isTransitioning || actionLoading !== null

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

  function updateDraft<K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function updateSshAccess<K extends keyof SshAccessValues>(
    key: K,
    value: SshAccessValues[K],
  ) {
    setDraft((prev) =>
      prev ? { ...prev, sshAccess: { ...prev.sshAccess, [key]: value } } : prev,
    )
  }

  function persistDraft(nextDraft: ConfigDraft) {
    updateServerInstance(id, {
      billing: nextDraft.billing,
      gpuCount: nextDraft.gpuCount,
      diskExpandEnabled: nextDraft.diskExpandEnabled,
      extraDiskGb: nextDraft.extraDiskGb,
      volumeId: nextDraft.volumeId === "none" ? null : nextDraft.volumeId,
      sshEnabled: nextDraft.sshAccess.sshEnabled,
      sshKey: nextDraft.sshAccess.sshKey,
      ports: nextDraft.sshAccess.ports,
    })
    setSavedDraft(nextDraft)
  }

  function handleSaveConfig() {
    if (!isDirty || !draft) return
    persistDraft(draft)
    toast.success("配置已保存")
  }

  function handleDiscardChanges() {
    if (!savedDraft) return
    setDraft(savedDraft)
    toast.info("已撤销未保存的修改")
  }

  function handleStart() {
    if (!isStopped) return
    clearStopTimer()
    setActionLoading("start")
    setServerInstanceStatus(id, "deploying")
    toast.info("正在开机…")
    setTimeout(() => {
      setServerInstanceStatus(id, "running")
      setActionLoading(null)
      toast.success("实例已启动")
    }, 2000)
  }

  function handleShutdown() {
    if (!isRunning) return
    clearStopTimer()
    setActionLoading("shutdown")
    setServerInstanceStatus(id, "stopping")
    toast.info("正在优雅关机…")
    stopTimerRef.current = setTimeout(() => {
      setServerInstanceStatus(id, "stopped")
      setActionLoading(null)
      stopTimerRef.current = null
      toast.success("实例已关机")
    }, 2500)
  }

  function handleForceStop() {
    clearStopTimer()
    setActionLoading("force")
    setServerInstanceStatus(id, "stopped")
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
    removeServerInstance(id)
    setDeleteOpen(false)
    toast.success("实例已删除")
    router.push("/console/server/instances")
  }

  function handleDeployService() {
    if (!draft) return
    if (!isStopped) {
      toast.error("请先关机后再部署服务")
      return
    }
    setDeployConfirmOpen(false)
    setDeploying(true)
    setServerInstanceStatus(id, "deploying")
    persistDraft(draft)
    toast.info("正在部署服务…")
    setTimeout(() => {
      setServerInstanceStatus(id, "stopped")
      setDeploying(false)
      toast.success("服务部署完成，可以开机了")
    }, 2500)
  }

  function handleUpgradeConfirm(values: {
    gpuCount: number
    diskExpandEnabled: boolean
    extraDiskGb: number
  }) {
    if (!draft) return
    const nextDraft: ConfigDraft = {
      ...draft,
      gpuCount: values.gpuCount,
      diskExpandEnabled: values.diskExpandEnabled,
      extraDiskGb: values.extraDiskGb,
    }
    setDraft(nextDraft)
    persistDraft(nextDraft)
  }

  const createdLabel = new Date(inst.createdAt).toLocaleString("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  return (
    <>
      <div className="container mx-auto px-4 pb-32 pt-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <LocaleLink
            href="/console/server/instances"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            返回列表
          </LocaleLink>
        </div>

        {isNew && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/30 bg-accent p-4">
            <CheckCircle2 className="mt-0.5 size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-accent-foreground">
                云主机已成功创建
              </p>
              <p className="mt-0.5 text-xs text-accent-foreground/80">
                可通过 SSH 连接实例，或访问已暴露的端口。
              </p>
            </div>
          </div>
        )}

        {/* 概览与操作 */}
        <section className="mb-6">
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                  <Server className="size-5 text-accent-foreground" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-foreground">
                      {inst.name}
                    </p>
                    <Badge variant={status.badge} className="gap-1.5">
                      <span className={cn("size-1.5 rounded-full", status.dot)} />
                      {status.label}
                    </Badge>
                    {actionLoading && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Loader2 className="size-3 animate-spin" />
                        处理中
                      </Badge>
                    )}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{inst.id}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    创建于 {createdLabel}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLogsOpen(true)}
                >
                  <ScrollText className="size-3.5" />
                  查看日志
                </Button>
                <Button
                  size="sm"
                  onClick={() => setConfirmAction("start")}
                  disabled={!isStopped || actionLoading !== null || deploying}
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
                  onClick={() => setSaveImageOpen(true)}
                  disabled={!isRunning || actionLoading !== null}
                >
                  <Save className="size-3.5" />
                  保存镜像
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUpgradeOpen(true)}
                  disabled={isTransitioning || actionLoading !== null || deploying}
                >
                  <ArrowUpCircle className="size-3.5" />
                  升级配置
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDeployConfirmOpen(true)}
                  disabled={
                    isRunning || isTransitioning || actionLoading !== null || deploying
                  }
                >
                  <Rocket className="size-3.5" />
                  部署服务
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
            </div>

            {isRunning && isDirty && (
              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="text-amber-600" />
                <AlertDescription className="text-xs text-muted-foreground">
                  实例运行中无法应用配置变更。请先关机，保存配置后点击「部署服务」。
                </AlertDescription>
              </Alert>
            )}

            {!isRunning && !isTransitioning && (
              <Alert className="border-border bg-muted/50 py-2">
                <AlertTriangle className="text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                  修改配置后需点击「部署服务」使变更生效。镜像创建后不可修改。
                </AlertDescription>
              </Alert>
            )}
          </Card>
        </section>

        <section className="mb-6">
          <InstanceSummaryCard offering={offering} billing={draft.billing} />
        </section>

        {/* 可编辑配置 */}
        <section className="mb-6">
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="text-sm font-bold text-foreground">实例配置</h2>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Label className="w-24 shrink-0 text-sm font-bold">计费方式:</Label>
              <SegmentedControl
                options={DEPLOY_BILLING_OPTIONS.filter((o) => o.id !== "voucher")}
                value={draft.billing}
                onChange={(value) => updateDraft("billing", value)}
                className={cn(configLocked && "pointer-events-none opacity-60")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              当前：{getDeployBillingLabel(draft.billing)}。创建后仍可转换计费方式。
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Label className="w-24 shrink-0 text-sm font-bold">GPU数量:</Label>
              <div
                className={cn(
                  "flex flex-wrap gap-2",
                  configLocked && "pointer-events-none opacity-60",
                )}
              >
                <span className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm font-medium">
                  {draft.gpuCount}（通过「升级配置」调整）
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <Label className="w-24 shrink-0 pt-1 text-sm font-bold">数据盘:</Label>
              <div
                className={cn("space-y-3", configLocked && "pointer-events-none opacity-60")}
              >
                <div className="text-sm">
                  <span className="text-muted-foreground">总容量：</span>
                  <span className="font-semibold">{totalDiskGb} GB</span>
                  <span className="text-muted-foreground">
                    {" "}
                    （免费 {offering.dataDiskGb} GB
                    {draft.diskExpandEnabled ? ` + 扩容 ${draft.extraDiskGb} GB` : ""}）
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  数据盘扩容请使用「升级配置」
                </p>
              </div>
            </div>

            <div className={cn(configLocked && "pointer-events-none opacity-60")}>
              <S3VolumeMount
                volumes={volumes}
                value={draft.volumeId}
                onChange={(value) => updateDraft("volumeId", value)}
              />
            </div>
          </Card>
        </section>

        {/* 镜像（只读） */}
        <section className="mb-6">
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-primary" />
              <Label className="text-sm font-bold">镜像</Label>
              <Badge variant="secondary" className="text-xs">
                不可修改
              </Badge>
            </div>
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium text-foreground">{imageLabel}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {inst.imageVersion}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              实例创建后镜像不可更换。如需使用新环境，请保存镜像后重新创建实例。
            </p>
          </Card>
        </section>

        {/* SSH 与端口 */}
        <section className="mb-6">
          <Card
            className={cn(
              "gap-4 rounded-2xl p-4 ring-border/80",
              configLocked && "pointer-events-none opacity-60",
            )}
          >
            <SshAccessStep values={draft.sshAccess} onChange={updateSshAccess} />
          </Card>
        </section>

        {/* 连接信息 */}
        <section className="mb-6">
          <Card className="gap-4 rounded-2xl p-4 ring-border/80">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Terminal className="size-4 text-primary" />
              连接信息
            </h2>
            <div className="flex flex-col gap-3">
              <ConnectionField
                label="公网 IP"
                value={isStopped ? "—（实例已停止）" : fakeIp}
                onCopy={isStopped ? undefined : () => copy(fakeIp, "IP")}
              />
              {draft.sshAccess.sshEnabled ? (
                <ConnectionField
                  label="SSH 命令"
                  value={isStopped ? "—（实例已停止）" : sshCmd}
                  onCopy={isStopped ? undefined : () => copy(sshCmd, "SSH 命令")}
                  mono
                />
              ) : (
                <p className="text-xs text-muted-foreground">该实例未启用 SSH。</p>
              )}
              <ConnectionField
                label="暴露端口"
                value={draft.sshAccess.ports || "—"}
                onCopy={() => copy(draft.sshAccess.ports, "端口")}
              />
              {draft.sshAccess.ports
                ?.split(",")
                .map((p) => p.trim())
                .filter(Boolean).length ? (
                <div className="flex flex-wrap gap-2">
                  {draft.sshAccess.ports
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
        </section>

        {/* 节点事件 */}
        <section className="mb-6">
          <NodeEventsPanel inst={inst} />
        </section>
      </div>

      {/* 未保存变更提示条 */}
      {isDirty && (
        <section className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <p className="text-sm text-muted-foreground">
              有未保存的配置变更
              {isRunning && "（运行中无法部署，请先关机）"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDiscardChanges}>
                撤销
              </Button>
              <Button onClick={handleSaveConfig}>保存配置</Button>
            </div>
          </div>
        </section>
      )}

      <SaveImageDialog
        inst={inst}
        open={saveImageOpen}
        onOpenChange={setSaveImageOpen}
      />

      <InstanceLogsSheet
        inst={inst}
        open={logsOpen}
        onOpenChange={setLogsOpen}
      />

      <UpgradeConfigDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        offering={offering}
        billing={draft.billing}
        gpuCount={draft.gpuCount}
        diskExpandEnabled={draft.diskExpandEnabled}
        extraDiskGb={draft.extraDiskGb}
        onConfirm={handleUpgradeConfirm}
      />

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
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

      <AlertDialog open={deployConfirmOpen} onOpenChange={setDeployConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认部署服务？</AlertDialogTitle>
            <AlertDialogDescription>
              将根据当前配置重新部署实例服务（SSH、端口、网络卷等）。部署期间实例不可开机，约需
              1–3 分钟。{isDirty && "未保存的变更将一并应用。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeployService}>
              确认部署
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除实例？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后实例将被销毁，绑定的公网 IP 与数据将无法恢复。此操作不可撤销。
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
    </>
  )
}

function ConnectionField({
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
