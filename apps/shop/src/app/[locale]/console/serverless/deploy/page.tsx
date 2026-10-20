"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { DeploySummary } from "@/components/deploy-summary"
import { GPUS, formatCNY, formatCNYDetail, getCommitmentLabel, getDiskOveragePrice, getGpuUnitPrice, FREE_DISK_GB } from "@/lib/gpu-data"
import { useLocaleRouter } from "@/lib/i18n/navigation"
import { trpc } from "@/trpc/client"
import { GpuRegionStep } from "./_components/gpu-region-step"
import { TemplateStep } from "./_components/template-step"
import { WorkerConfigStep } from "./_components/worker-config-step"
import { StorageStep } from "./_components/storage-step"
import {
  generateEndpointName,
  buildCustomImageRef,
  isCustomImageConfigValid,
  type GpuRegionValues,
  type SavedTemplate,
  type StorageValues,
  type TemplateValues,
  type WorkerConfigValues,
} from "./_components/types"

export default function DeployServerlessPage() {
  const router = useLocaleRouter()
  const searchParams = useSearchParams()
  const createMutation = trpc.compute.createServerless.useMutation({
    onSuccess: (data) => {
      toast.success("Serverless 端点已创建")
      router.push(`/console/serverless/instances/${data.id}?new=1`)
    },
    onError: (error) => {
      toast.error(`创建失败: ${error.message}`)
    },
  })

  const {
    data: deployOptions,
    isLoading: deployOptionsLoading,
    error: deployOptionsError,
  } = trpc.compute.serverlessDeployOptions.useQuery()
  const { data: appTemplateData } = trpc.applicationTemplate.list.useQuery({
    deployType: "serverless",
    pageSize: 100,
  })
  const dbTemplates = (appTemplateData?.items ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    image: t.imageRef,
    desc: t.description ?? "",
    category: t.category,
    featured: false,
  }))

  const requestedTemplateId = searchParams.get("template")
  const presetAppliedRef = useRef(false)
  const deployDefaultsAppliedRef = useRef(false)

  const [gpuRegion, setGpuRegion] = useState<GpuRegionValues | null>(null)
  const [template, setTemplate] = useState<TemplateValues>({
    mode: "preset",
    templateId: "vllm",
    registrySource: "platform",
    customImage: "",
    registryHost: "",
    registryCredentials: null,
    envVars: "",
    startCommand: "",
    ports: "8000",
  })
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [workerConfig, setWorkerConfig] = useState<WorkerConfigValues | null>(null)
  const [storage, setStorage] = useState<StorageValues>({
    diskSize: FREE_DISK_GB,
    volumeId: "none",
  })

  useEffect(() => {
    if (deployOptionsError) {
      toast.error(deployOptionsError.message)
    }
  }, [deployOptionsError])

  useEffect(() => {
    if (!deployOptions || deployDefaultsAppliedRef.current) return
    deployDefaultsAppliedRef.current = true
    const d = deployOptions.defaults
    setGpuRegion({
      gpuId: d.gpuId,
      gpuCount: String(d.gpuCount),
      regionAllowlist: [],
      skypilotRegion: d.region?.trim() ? d.region : undefined,
      commitment: d.commitment,
    })
    setWorkerConfig({
      endpointName: generateEndpointName(),
      appName: "",
      minWorkers: d.minWorkers,
      maxWorkers: d.maxWorkers,
      idleTimeout: d.idleTimeout,
      maxConcurrency: d.maxConcurrency,
      cudaVersion: "",
      requestTimeout: d.requestTimeout,
    })
  }, [deployOptions])

  useEffect(() => {
    if (!requestedTemplateId || presetAppliedRef.current || dbTemplates.length === 0) {
      return
    }
    const preset = dbTemplates.find((t) => t.id === requestedTemplateId)
    if (!preset) return
    presetAppliedRef.current = true
    setTemplate((prev) => ({
      ...prev,
      mode: "preset",
      templateId: preset.id,
      customImage: preset.image,
    }))
  }, [requestedTemplateId, dbTemplates])

  useEffect(() => {
    if (dbTemplates && template.mode === "preset" && !template.customImage) {
      const vllm = dbTemplates.find((t) => t.id === "vllm")
      if (vllm) {
        setTemplate((prev) => ({ ...prev, customImage: vllm.image }))
      }
    }
  }, [dbTemplates, template.mode, template.customImage])

  function resolveImage(tmpl: TemplateValues, saved: SavedTemplate[]) {
    if (tmpl.mode === "custom") {
      return buildCustomImageRef(tmpl)
    }
    const savedTmpl = saved.find((s) => s.id === tmpl.templateId)
    if (savedTmpl) return savedTmpl.image
    return dbTemplates?.find((dt) => dt.id === tmpl.templateId)?.image ?? ""
  }

  function updateGpuRegion<K extends keyof GpuRegionValues>(
    key: K,
    value: GpuRegionValues[K],
  ) {
    setGpuRegion((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function updateTemplate<K extends keyof TemplateValues>(
    key: K,
    value: TemplateValues[K],
  ) {
    setTemplate((prev) => ({ ...prev, [key]: value }))
  }

  function updateWorkerConfig<K extends keyof WorkerConfigValues>(
    key: K,
    value: WorkerConfigValues[K],
  ) {
    setWorkerConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function updateStorage<K extends keyof StorageValues>(
    key: K,
    value: StorageValues[K],
  ) {
    setStorage((prev) => ({ ...prev, [key]: value }))
  }

  const logicalRegions = useMemo(
    () => deployOptions?.logicalRegions ?? [],
    [deployOptions],
  )

  const skypilotRegions = useMemo(
    () =>
      deployOptions?.skypilotRegions.map((r) => ({
        id: r.id,
        name: r.name,
        supportsStorage: r.supportsStorage,
      })) ?? [],
    [deployOptions],
  )

  const gpuCountOptions = useMemo(
    () =>
      deployOptions?.gpuCountOptions.map((n) => String(n)) ?? [],
    [deployOptions],
  )

  const gpu =
    gpuRegion && GPUS.find((g) => g.id === gpuRegion.gpuId)
      ? GPUS.find((g) => g.id === gpuRegion.gpuId)!
      : GPUS[0]
  const resolvedImage = resolveImage(template, savedTemplates)

  const diskPrice = getDiskOveragePrice(storage.diskSize)
  const pricePerHour = useMemo(
    () =>
      gpuRegion
        ? getGpuUnitPrice(gpu, gpuRegion.commitment) * Number(gpuRegion.gpuCount) +
          diskPrice
        : 0,
    [gpu, gpuRegion, diskPrice],
  )
  const commitmentLabel = gpuRegion
    ? getCommitmentLabel(gpuRegion.commitment)
    : "—"
  const gpuUnitPrice = gpuRegion
    ? getGpuUnitPrice(gpu, gpuRegion.commitment)
    : 0

  function handleDeploy() {
    if (!gpuRegion || !workerConfig) return
    if (!resolvedImage) {
      toast.error("请配置容器镜像")
      return
    }
    if (!isCustomImageConfigValid(template)) {
      if (template.mode === "custom" && template.registrySource === "custom") {
        if (!template.registryHost.trim()) {
          toast.error("请填写自定义镜像仓库地址")
          return
        }
        toast.error("请配置自定义镜像仓库的登录凭证")
        return
      }
      toast.error("请填写镜像地址")
      return
    }

    const envVars: Record<string, string> = {}
    if (template.envVars.trim()) {
      for (const line of template.envVars.trim().split("\n")) {
        const eqIndex = line.indexOf("=")
        if (eqIndex > 0) {
          envVars[line.slice(0, eqIndex).trim()] = line.slice(eqIndex + 1).trim()
        }
      }
    }

    createMutation.mutate({
      name:
        workerConfig.endpointName ||
        workerConfig.appName ||
        `${template.templateId}-endpoint`,
      gpuId: gpuRegion.gpuId,
      gpuCount: Number(gpuRegion.gpuCount),
      region: gpuRegion.skypilotRegion?.trim() || undefined,
      regionAllowlist: gpuRegion.regionAllowlist,
      placementMode: deployOptions?.placementMode ?? "auto",
      faultTolerance: "non_interruptible",
      commitment: gpuRegion.commitment === "spot" ? "on-demand" : gpuRegion.commitment,
      image: resolvedImage,
      minReplicas: workerConfig.minWorkers,
      maxReplicas: workerConfig.maxWorkers,
      targetPort: template.ports ? Number(template.ports.split(",")[0]) : 8080,
      command: template.startCommand || undefined,
      envVars,
      diskSize: storage.diskSize,
      scaleUpWaitSeconds: workerConfig.requestTimeout,
    })
  }

  const formReady = gpuRegion && workerConfig && deployOptions

  if (deployOptionsLoading || !formReady) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {deployOptionsLoading ? "加载部署配置…" : "部署配置不可用"}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-none">
        <div className="mx-auto w-full max-w-7xl px-5 py-6">
          <div className="flex flex-col gap-4">
            <GpuRegionStep
              values={gpuRegion}
              logicalRegions={logicalRegions}
              skypilotRegions={skypilotRegions}
              gpuCountOptions={gpuCountOptions}
              onChange={updateGpuRegion}
            />
            <TemplateStep
              values={template}
              savedTemplates={savedTemplates}
              onChange={updateTemplate}
              onSaveTemplate={(saved) =>
                setSavedTemplates((prev) => [saved, ...prev])
              }
            />
            <WorkerConfigStep
              values={workerConfig}
              onChange={updateWorkerConfig}
            />
            <StorageStep
              values={storage}
              volumes={[]}
              onChange={updateStorage}
            />
          </div>
        </div>
      </div>

      <DeploySummary
        pricePerHour={pricePerHour}
        ctaLabel="创建端点"
        onDeploy={handleDeploy}
        loading={createMutation.isPending}
        note="按 GPU 实际运行秒级计费，缩容到零时不收费"
        rows={[
          { label: "计费方式", value: commitmentLabel },
          {
            label: "GPU 算力",
            value: `${gpuRegion.gpuCount} × ${gpu.name}`,
          },
          {
            label: "GPU 小计",
            value: `${formatCNY(gpuUnitPrice * Number(gpuRegion.gpuCount))}/hr`,
          },
          {
            label: "容器磁盘",
            value:
              storage.diskSize > FREE_DISK_GB
                ? `超出 ${storage.diskSize - FREE_DISK_GB} GB · ${formatCNYDetail(diskPrice)}/hr`
                : `${FREE_DISK_GB} GB 内免费`,
          },
        ]}
      />
    </div>
  )
}
