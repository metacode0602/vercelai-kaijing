"use client"

import { AlertCircle, Info } from "lucide-react"
import { FormSection } from "@/components/form-section"
import { Label } from "@workspace/ui/components/label"
import { Slider } from "@workspace/ui/components/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Separator } from "@workspace/ui/components/separator"
import {
  DISK_OVERAGE_RATE_PER_GB_HR,
  FREE_DISK_GB,
  formatUSD,
  formatUSDDetail,
  getDiskOveragePrice,
} from "@/lib/gpu-data"
import type { Volume } from "@/components/console-store"
import type { StorageValues } from "./types"

export interface StorageStepProps {
  values: StorageValues
  volumes: Volume[]
  onChange: <K extends keyof StorageValues>(
    key: K,
    value: StorageValues[K],
  ) => void
  variant?: "deploy" | "detail"
}

export function StorageStep({ values, volumes, onChange, variant = "deploy" }: StorageStepProps) {
  const attachedVolume = volumes.find((v) => v.id === values.volumeId)
  const overageGb = Math.max(0, values.diskSize - FREE_DISK_GB)
  const overagePrice = getDiskOveragePrice(values.diskSize)

  const body = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label>容器磁盘（本地 NVMe SSD）</Label>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Free {FREE_DISK_GB}GB
              </span>
            </div>
            <span className="text-sm font-medium text-foreground">
              {values.diskSize} GB
            </span>
          </div>
          <Slider
            value={[values.diskSize]}
            min={FREE_DISK_GB}
            max={500}
            step={10}
            onValueChange={(v) => onChange("diskSize", v[0])}
          />
          <p className="text-xs text-muted-foreground">
            前 {FREE_DISK_GB} GB 免费；超出部分按 {formatUSDDetail(DISK_OVERAGE_RATE_PER_GB_HR)}
            /GB·hr 按需按量计费。本地磁盘随 Worker 生命周期存在，缩容后数据将被清除。
          </p>
          {overageGb > 0 && (
            <Alert>
              <AlertCircle />
              <AlertTitle>超出免费额度，将产生磁盘费用</AlertTitle>
              <AlertDescription>
                当前超出 {overageGb} GB（{FREE_DISK_GB} GB 免费 + {overageGb}{" "}
                GB 付费），超出部分约 {formatUSDDetail(overagePrice)}/hr
                按 Worker 实际运行时长计费。
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <div>
            <Label>挂载 S3 网络卷（可选）</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              S3 网络卷与容器磁盘分开计费与挂载，用于持久化数据集与模型权重。
            </p>
          </div>
          <Select
            value={values.volumeId}
            onValueChange={(v) => v && onChange("volumeId", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不挂载</SelectItem>
              {volumes.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name} · {v.size}GB · {v.region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {attachedVolume && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              将挂载到{" "}
              <code className="rounded bg-muted px-1">/workspace</code>，端点{" "}
              {attachedVolume.endpoint}
            </p>
          )}
          {volumes.length === 0 && (
            <p className="text-xs text-muted-foreground">
              暂无可用网络卷，请先在「网络卷」页面创建 S3 卷。
            </p>
          )}
        </div>
      </div>
  )

  if (variant === "detail") return body

  return (
    <FormSection
      step={4}
      title="存储配置"
      description="配置容器本地磁盘与 S3 网络卷挂载，两者相互独立。"
    >
      {body}
    </FormSection>
  )
}
