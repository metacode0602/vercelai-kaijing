"use client"

import { use, useEffect, useMemo, useState } from "react"
import { notFound } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Settings, LayoutDashboard, Box, Receipt } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useStore } from "@/components/console-store"
import { trpc } from "@/trpc/client"
import { LocaleLink } from "@/lib/i18n/navigation"
import type { GpuRegionValues, WorkerConfigValues } from "../../deploy/_components/types"
import type { StorageValues } from "../../deploy/_components/types"
import { EndpointHeader } from "./_components/endpoint-header"
import { EndpointOverview } from "./_components/endpoint-overview"
import { ConfigPanel } from "./_components/config-panel"
import { WorkersPanel } from "./_components/workers-panel"
import { BillingPanel } from "./_components/billing-panel"
import { generatePods } from "../../_components/pod-list"
import type { RuntimeConfigValues } from "./_components/runtime-config-step"
import {
  serverlessToStoreInstance,
  instanceToGpuRegion,
  instanceToRuntimeConfig,
  instanceToStorage,
  instanceToWorkerConfig,
} from "./_components/utils"

export default function ServerlessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = use(params)
  const { new: isNew } = use(searchParams)
  const { volumes } = useStore()
  const utils = trpc.useUtils()
  const { data, isLoading, error } = trpc.compute.serverlessGetById.useQuery({ id })
  const { data: deployOptions } = trpc.compute.serverlessDeployOptions.useQuery()

  const scaleMutation = trpc.compute.scaleServerless.useMutation({
    onSuccess: () => {
      setSaving(false)
      toast.success("配置已保存，新副本将按最新副本数伸缩")
      utils.compute.serverlessGetById.invalidate({ id })
      utils.compute.serverlessList.invalidate()
    },
    onError: (err) => {
      setSaving(false)
      toast.error(err.message || "保存失败")
    },
  })

  const endpoint = useMemo(
    () => (data ? serverlessToStoreInstance(data) : null),
    [data],
  )

  const [activeTab, setActiveTab] = useState("overview")
  const [gpuRegion, setGpuRegion] = useState<GpuRegionValues | null>(null)
  const [workerConfig, setWorkerConfig] = useState<WorkerConfigValues | null>(null)
  const [storage, setStorage] = useState<StorageValues | null>(null)
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigValues | null>(null)
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [podRefreshKey, setPodRefreshKey] = useState(0)

  useEffect(() => {
    if (!endpoint) return
    setGpuRegion(instanceToGpuRegion(endpoint))
    setWorkerConfig(instanceToWorkerConfig(endpoint))
    setStorage(instanceToStorage(endpoint))
    setRuntimeConfig(instanceToRuntimeConfig(endpoint))
  }, [endpoint?.id])

  useEffect(() => {
    if (!endpoint) return
    const pods = generatePods(endpoint)
    if (pods.length === 0) {
      setSelectedPodId(null)
      return
    }
    setSelectedPodId((current) => {
      if (current && pods.some((p) => p.id === current)) return current
      return pods[0]!.id
    })
  }, [endpoint?.id, endpoint?.status, podRefreshKey])

  const isDirty = useMemo(() => {
    if (!endpoint || !gpuRegion || !workerConfig || !storage || !runtimeConfig) {
      return false
    }
    return (
      JSON.stringify(gpuRegion) !== JSON.stringify(instanceToGpuRegion(endpoint)) ||
      JSON.stringify(workerConfig) !== JSON.stringify(instanceToWorkerConfig(endpoint)) ||
      JSON.stringify(storage) !== JSON.stringify(instanceToStorage(endpoint)) ||
      JSON.stringify(runtimeConfig) !== JSON.stringify(instanceToRuntimeConfig(endpoint))
    )
  }, [endpoint, gpuRegion, workerConfig, storage, runtimeConfig])

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    )
  }

  if (error || !endpoint || !data) {
    notFound()
  }
  if (!gpuRegion || !workerConfig || !storage || !runtimeConfig) return null

  const pricePerHour = endpoint.pricePerHour
  const endpointUrl = `https://api.gpucloud.dev/v1/endpoints/${id}/run`

  function copy(text: string, label: string) {
    navigator.clipboard?.writeText(text)
    toast.success(`${label}已复制`)
  }

  function handleReset() {
    if (!endpoint) return
    setGpuRegion(instanceToGpuRegion(endpoint))
    setWorkerConfig(instanceToWorkerConfig(endpoint))
    setStorage(instanceToStorage(endpoint))
    setRuntimeConfig(instanceToRuntimeConfig(endpoint))
    toast.info("已恢复为已保存的配置")
  }

  function handleSave() {
    if (!workerConfig || !gpuRegion || !data) return
    if (workerConfig.minWorkers > workerConfig.maxWorkers) {
      toast.error("Workers 最小值不能大于最大值")
      return
    }
    if (!workerConfig.endpointName.trim()) {
      toast.error("请填写端点名称")
      return
    }

    setSaving(true)
    scaleMutation.mutate({
      id,
      minReplicas: workerConfig.minWorkers,
      maxReplicas: workerConfig.maxWorkers,
      ...(data.orchestratorType === "waverless"
        ? { regionAllowlist: gpuRegion.regionAllowlist }
        : {}),
    })
  }

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-5 py-6">
        <LocaleLink
          href="/console/serverless/instances"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回端点列表
        </LocaleLink>

        {isNew && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-primary/30 bg-accent p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-accent-foreground">端点已创建并就绪</p>
              <p className="mt-0.5 text-xs text-accent-foreground/80">
                可在「概览」查看 API 地址，或在「Workers」标签页监控运行状态。
              </p>
            </div>
          </div>
        )}

        <EndpointHeader endpoint={endpoint} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="w-full justify-start sm:w-auto">
            <TabsTrigger value="overview" className="gap-1.5">
              <LayoutDashboard className="size-3.5" />
              概览
            </TabsTrigger>
            <TabsTrigger value="workers" className="gap-1.5">
              <Box className="size-3.5" />
              Workers
            </TabsTrigger>
            {data.orchestratorType === "waverless" && (
              <TabsTrigger value="billing" className="gap-1.5">
                <Receipt className="size-3.5" />
                计费
              </TabsTrigger>
            )}
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="size-3.5" />
              配置
              {isDirty && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  未保存
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <EndpointOverview
              endpoint={endpoint}
              workerConfig={workerConfig}
              pricePerHour={pricePerHour}
              endpointUrl={endpointUrl}
              onCopy={copy}
            />
          </TabsContent>

          <TabsContent value="workers" className="mt-4">
            <WorkersPanel
              endpoint={endpoint}
              selectedPodId={selectedPodId}
              onSelectPod={setSelectedPodId}
              onRefresh={() => setPodRefreshKey((k) => k + 1)}
            />
          </TabsContent>

          {data.orchestratorType === "waverless" && (
            <TabsContent value="billing" className="mt-4">
              <BillingPanel endpointId={id} />
            </TabsContent>
          )}

          <TabsContent value="settings" className="mt-4">
            <ConfigPanel
              gpuRegion={gpuRegion}
              workerConfig={workerConfig}
              storage={storage}
              runtimeConfig={runtimeConfig}
              volumes={volumes}
              logicalRegions={deployOptions?.logicalRegions}
              orchestratorType={data.orchestratorType}
              isDirty={isDirty}
              saving={saving}
              onGpuRegionChange={(key, value) =>
                setGpuRegion((prev) => (prev ? { ...prev, [key]: value } : prev))
              }
              onWorkerConfigChange={(key, value) =>
                setWorkerConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
              }
              onStorageChange={(key, value) =>
                setStorage((prev) => (prev ? { ...prev, [key]: value } : prev))
              }
              onRuntimeConfigChange={(key, value) =>
                setRuntimeConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
              }
              onSave={handleSave}
              onReset={handleReset}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}