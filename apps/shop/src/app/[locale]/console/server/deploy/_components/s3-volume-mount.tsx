"use client"

import { Info } from "lucide-react"
import type { Volume } from "@/components/console-store"
import { LocaleLink } from "@/lib/i18n/navigation"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"

interface S3VolumeMountProps {
  volumes: Volume[]
  value: string
  onChange: (volumeId: string) => void
}

export function S3VolumeMount({ volumes, value, onChange }: S3VolumeMountProps) {
  const attachedVolume = volumes.find((volume) => volume.id === value)

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <Label className="w-24 shrink-0 pt-1 text-sm font-bold">网络卷:</Label>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="text-sm text-muted-foreground">
            挂载 S3 网络卷（可选），与数据盘分开计费，用于持久化数据集与模型权重。
          </p>
        </div>

        <Select value={value} onValueChange={(next) => next && onChange(next)}>
          <SelectTrigger className="w-full sm:max-w-lg">
            <SelectValue placeholder="选择网络卷" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不挂载</SelectItem>
            {volumes.map((volume) => (
              <SelectItem key={volume.id} value={volume.id}>
                {volume.name} · {volume.size} GB · {volume.region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {attachedVolume && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              将挂载到 <code className="rounded bg-muted px-1">/workspace</code>
              ，端点 {attachedVolume.endpoint}
            </span>
          </p>
        )}

        {volumes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            暂无可用网络卷，请先在
            <LocaleLink href="/console/storage" className="mx-1 text-primary hover:underline">
              网络卷
            </LocaleLink>
            页面创建 S3 卷。
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            需要新建卷？前往
            <LocaleLink href="/console/storage" className="mx-1 text-primary hover:underline">
              网络卷管理
            </LocaleLink>
          </p>
        )}

        {attachedVolume && value !== "none" && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-xs sm:max-w-lg">
              <div>
                <span className="text-muted-foreground">Bucket</span>
                <p className="font-medium">{attachedVolume.bucket}</p>
              </div>
              <div>
                <span className="text-muted-foreground">容量</span>
                <p className="font-medium">
                  {attachedVolume.used} / {attachedVolume.size} GB
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
