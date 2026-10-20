"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
  getRegionOptions,
  MAX_PRELOAD_TASKS,
  REGISTRY_CREDENTIAL_OPTIONS,
  type PreloadTask,
  type RegistryCredentialId,
} from "@/lib/preloaded-data"
import { PreloadGpuPanel } from "./preload-gpu-panel"
import { QuotaIndicator } from "./quota-indicator"
import { TemplatePickerDialog } from "./template-picker-dialog"

interface CreatePreloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskCount: number
  onCreate: (input: { imageRef: string; note: string; regionId: string }) => PreloadTask
}

export function CreatePreloadDialog({
  open,
  onOpenChange,
  taskCount,
  onCreate,
}: CreatePreloadDialogProps) {
  const [imageRef, setImageRef] = useState("")
  const [note, setNote] = useState("")
  const [regionId, setRegionId] = useState("")
  const [credentialId, setCredentialId] = useState<RegistryCredentialId>("none")
  const [creating, setCreating] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setImageRef("")
      setNote("")
      setRegionId("")
      setCredentialId("none")
      setCreating(false)
      setTemplateOpen(false)
    }
  }, [open])

  function handleCreate() {
    const trimmedRef = imageRef.trim()
    if (!trimmedRef) {
      toast.error("请输入容器镜像地址")
      return
    }
    if (!regionId) {
      toast.error("请选择区域")
      return
    }
    if (taskCount >= MAX_PRELOAD_TASKS) {
      toast.error(`最多只能创建 ${MAX_PRELOAD_TASKS} 个镜像预热任务`)
      return
    }

    setCreating(true)
    const task = onCreate({
      imageRef: trimmedRef,
      note,
      regionId,
    })

    setTimeout(() => {
      setCreating(false)
      onOpenChange(false)
      toast.success(`镜像预热任务已创建：${task.imageName}`)
    }, 600)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 sm:max-w-lg">
          <DialogHeader className="pb-4">
            <DialogTitle>创建镜像预热任务</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col">
            <QuotaIndicator used={taskCount} variant="dialog" compact />

            <div className="mt-6">
              <Label className="text-sm font-medium text-foreground">容器镜像：</Label>
              <div className="mt-2 flex gap-3">
                <Input
                  value={imageRef}
                  onChange={(event) => setImageRef(event.target.value)}
                  placeholder=""
                  className="h-8 min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-32 shrink-0 rounded-full"
                  onClick={() => setTemplateOpen(true)}
                >
                  选择模板
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                你可以输入镜像地址。支持私有镜像仓库地址和 Docker Hub 镜像地址，例如：
                gpurun/tensorflow:2.7.0
              </p>
            </div>

            <div className="mt-6">
              <Label className="text-sm font-medium text-foreground">容器镜像仓库凭证</Label>
              <Select
                value={credentialId}
                onValueChange={(value) => setCredentialId(value as RegistryCredentialId)}
              >
                <SelectTrigger className="mt-2 h-9 w-max min-w-[200px]">
                  <SelectValue placeholder="选择凭证" />
                </SelectTrigger>
                <SelectContent>
                  {REGISTRY_CREDENTIAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-6">
              <Label className="text-sm font-medium text-foreground">区域</Label>
              <Select value={regionId || undefined} onValueChange={setRegionId}>
                <SelectTrigger className="mt-2 h-8 w-full">
                  <SelectValue placeholder="请选择区域" />
                </SelectTrigger>
                <SelectContent>
                  {getRegionOptions().map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {regionId ? (
              <div className="mt-6">
                <Label className="text-sm font-medium text-foreground">GPU</Label>
                <div className="mt-2">
                  <PreloadGpuPanel regionId={regionId} />
                </div>
              </div>
            ) : null}

            <div className="mt-6">
              <Label className="text-sm font-medium text-foreground">备注</Label>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-2 h-8"
              />
            </div>

            <div className="mt-6 flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={handleCreate}
                disabled={creating || taskCount >= MAX_PRELOAD_TASKS}
              >
                {creating ? "创建中…" : "确认创建"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 rounded-full px-3"
                onClick={() => onOpenChange(false)}
                disabled={creating}
              >
                取消
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <TemplatePickerDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onSelect={setImageRef}
      />
    </>
  )
}
