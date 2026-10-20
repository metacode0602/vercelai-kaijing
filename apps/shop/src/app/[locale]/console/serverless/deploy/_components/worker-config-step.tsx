"use client"

import type { ReactNode } from "react"
import { CircleHelp } from "lucide-react"
import { FormSection } from "@/components/form-section"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import type { WorkerConfigValues } from "./types"

const CUDA_VERSIONS = ["12.4", "12.6", "12.8", "13.0"] as const

function FieldLabel({
  label,
  required,
  tooltip,
}: {
  label: string
  required?: boolean
  tooltip?: string
}) {
  return (
    <div className="flex min-h-5 flex-row items-center gap-1">
      {required && <span className="text-xs text-destructive">*</span>}
      <Label className="text-xs font-normal text-foreground">{label}</Label>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger
            className="inline-flex shrink-0 cursor-default"
            aria-label={`${label}说明`}
          >
            <CircleHelp className="size-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function FormField({
  label,
  required,
  tooltip,
  className,
  children,
}: {
  label: string
  required?: boolean
  tooltip?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <FieldLabel label={label} required={required} tooltip={tooltip} />
      {children}
    </div>
  )
}

const inputClassName = "h-10"
const selectTriggerClassName = "h-10 w-full"

export interface WorkerConfigStepProps {
  values: WorkerConfigValues
  onChange: <K extends keyof WorkerConfigValues>(
    key: K,
    value: WorkerConfigValues[K],
  ) => void
  variant?: "deploy" | "detail"
}

export function WorkerConfigStep({ values, onChange, variant = "deploy" }: WorkerConfigStepProps) {
  const body = (
      <div className="flex flex-col gap-3">
        <div className="flex w-full flex-col items-start gap-3 sm:flex-row">
          <FormField label="端点名称" required className="w-full sm:w-1/2">
            <Input
              id="serverless_name"
              className={inputClassName}
              placeholder="输入端点名称"
              value={values.endpointName}
              onChange={(e) => onChange("endpointName", e.target.value)}
            />
          </FormField>
          <FormField
            label="应用名称"
            tooltip="可选的应用显示名称，用于在控制台中识别此端点。"
            className="w-full sm:w-1/2"
          >
            <Input
              id="serverless_appName"
              className={inputClassName}
              maxLength={46}
              placeholder="输入应用名称"
              value={values.appName}
              onChange={(e) => onChange("appName", e.target.value)}
            />
          </FormField>
        </div>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField
            label="Workers 最小值"
            required
            tooltip="空闲时保持运行的最小 Worker 数量。"
          >
            <Input
              id="serverless_minWorker"
              className={inputClassName}
              type="number"
              min={0}
              max={1000}
              step={1}
              placeholder="输入 Workers 最小值"
              value={values.minWorkers}
              onChange={(e) =>
                onChange("minWorkers", Number(e.target.value) || 0)
              }
            />
          </FormField>
          <FormField
            label="Workers 最大值"
            required
            tooltip="高峰期可扩容到的最大 Worker 数量。"
          >
            <Input
              id="serverless_maxWorker"
              className={inputClassName}
              type="number"
              min={0}
              max={1000}
              step={1}
              placeholder="输入 Workers 最大值"
              value={values.maxWorkers}
              onChange={(e) =>
                onChange("maxWorkers", Number(e.target.value) || 0)
              }
            />
          </FormField>
          <FormField
            label="空闲超时时间（秒）"
            required
            tooltip="Worker 空闲超过该时长后自动回收。"
          >
            <Input
              id="serverless_idleTimeout"
              className={inputClassName}
              type="number"
              min={1}
              max={1000}
              step={1}
              placeholder="输入空闲超时时间"
              value={values.idleTimeout}
              onChange={(e) =>
                onChange("idleTimeout", Number(e.target.value) || 1)
              }
            />
          </FormField>
          <FormField label="最大并发数" required>
            <Input
              id="serverless_maxConcurrency"
              className={inputClassName}
              type="number"
              min={1}
              max={1000}
              step={1}
              placeholder="输入最大并发数"
              value={values.maxConcurrency}
              onChange={(e) =>
                onChange("maxConcurrency", Number(e.target.value) || 1)
              }
            />
          </FormField>
        </div>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="CUDA 版本" required>
            <Select
              value={values.cudaVersion || undefined}
              onValueChange={(v) => v && onChange("cudaVersion", v)}
            >
              <SelectTrigger
                id="serverless_cudaVersion"
                className={selectTriggerClassName}
              >
                <SelectValue placeholder="选择 CUDA 版本" />
              </SelectTrigger>
              <SelectContent>
                {CUDA_VERSIONS.map((version) => (
                  <SelectItem key={version} value={version}>
                    {version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label="队列超时"
            required
            tooltip="请求在队列中等待的最长时间（秒）。"
          >
            <Input
              id="serverless_requestTimeout"
              className={inputClassName}
              type="number"
              min={1}
              max={3600}
              step={1}
              placeholder="输入队列超时时间"
              value={values.requestTimeout}
              onChange={(e) =>
                onChange("requestTimeout", Number(e.target.value) || 1)
              }
            />
          </FormField>
        </div>
      </div>
  )

  if (variant === "detail") return body

  return (
    <FormSection
      step={3}
      title="扩缩容配置"
      description="配置端点名称、扩缩容参数与运行时限制。"
    >
      {body}
    </FormSection>
  )
}
