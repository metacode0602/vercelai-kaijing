"use client"

import type { Volume } from "@/components/console-store"
import { Button } from "@workspace/ui/components/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { LocaleLink } from "@/lib/i18n/navigation"
import {
  GpuRegionStep,
  type LogicalRegionOption,
} from "../../../deploy/_components/gpu-region-step"
import { WorkerConfigStep } from "../../../deploy/_components/worker-config-step"
import { StorageStep } from "../../../deploy/_components/storage-step"
import type {
  GpuRegionValues,
  StorageValues,
  WorkerConfigValues,
} from "../../../deploy/_components/types"
import { RuntimeConfigStep, type RuntimeConfigValues } from "./runtime-config-step"

export interface ConfigPanelProps {
  gpuRegion: GpuRegionValues
  workerConfig: WorkerConfigValues
  storage: StorageValues
  runtimeConfig: RuntimeConfigValues
  volumes: Volume[]
  logicalRegions?: LogicalRegionOption[]
  orchestratorType?: string | null
  isDirty: boolean
  saving: boolean
  onGpuRegionChange: <K extends keyof GpuRegionValues>(
    key: K,
    value: GpuRegionValues[K],
  ) => void
  onWorkerConfigChange: <K extends keyof WorkerConfigValues>(
    key: K,
    value: WorkerConfigValues[K],
  ) => void
  onStorageChange: <K extends keyof StorageValues>(
    key: K,
    value: StorageValues[K],
  ) => void
  onRuntimeConfigChange: <K extends keyof RuntimeConfigValues>(
    key: K,
    value: RuntimeConfigValues[K],
  ) => void
  onSave: () => void
  onReset: () => void
}

export function ConfigPanel({
  gpuRegion,
  workerConfig,
  storage,
  runtimeConfig,
  volumes,
  logicalRegions = [],
  orchestratorType,
  isDirty,
  saving,
  onGpuRegionChange,
  onWorkerConfigChange,
  onStorageChange,
  onRuntimeConfigChange,
  onSave,
  onReset,
}: ConfigPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {isDirty && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-accent/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-accent-foreground">
            有未保存的配置变更，保存后将在新 Worker 上生效。
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={onReset} disabled={saving}>
              放弃更改
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? "保存中…" : "保存配置"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card px-5">
        <Accordion type="multiple" defaultValue={["scaling", "runtime"]} className="w-full">
          <AccordionItem value="scaling">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              扩缩容与端点
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <WorkerConfigStep
                variant="detail"
                values={workerConfig}
                onChange={onWorkerConfigChange}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="gpu">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              GPU 与区域
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <GpuRegionStep
                variant="detail"
                values={gpuRegion}
                logicalRegions={
                  orchestratorType === "waverless" ? logicalRegions : []
                }
                onChange={onGpuRegionChange}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="runtime">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              运行时参数
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <RuntimeConfigStep
                variant="detail"
                values={runtimeConfig}
                onChange={onRuntimeConfigChange}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="storage">
            <AccordionTrigger className="text-sm font-semibold hover:no-underline">
              存储
            </AccordionTrigger>
            <AccordionContent className="pb-5">
              <StorageStep
                variant="detail"
                values={storage}
                volumes={volumes}
                onChange={onStorageChange}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <p className="text-xs text-muted-foreground">
        镜像地址不可在此修改。如需更换镜像，请
        <LocaleLink href="/serverless/deploy" className="mx-1 text-primary hover:underline">
          部署新端点
        </LocaleLink>
        。
      </p>
    </div>
  )
}
