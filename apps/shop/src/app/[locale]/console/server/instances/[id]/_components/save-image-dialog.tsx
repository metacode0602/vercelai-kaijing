"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { PLATFORM_REGISTRY } from "@/lib/gpu-data"
import { trpc } from "@/trpc/client"
import type { ServerInstance } from "@/components/console-store"

interface SaveImageDialogProps {
  inst: ServerInstance
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SaveImageDialog({ inst, open, onOpenChange }: SaveImageDialogProps) {
  const defaultTag = `${inst.name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()}-snapshot`
  const [tag, setTag] = useState(defaultTag)

  const utils = trpc.useUtils()
  const saveMutation = trpc.image.saveFromInstance.useMutation({
    onSuccess: () => {
      utils.image.listCustom.invalidate()
      onOpenChange(false)
      toast.success(`镜像已保存至 ${PLATFORM_REGISTRY.host}/${tag}`)
    },
    onError: (e) => toast.error(e.message),
  })

  const imageRef = `${PLATFORM_REGISTRY.host}/${tag}`

  function handleSave() {
    const trimmed = tag.trim()
    if (!trimmed) {
      toast.error("请输入镜像标签")
      return
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
      toast.error("标签仅支持字母、数字、点、下划线和连字符")
      return
    }

    saveMutation.mutate({
      sourceTaskId: inst.id,
      tagName: trimmed,
    })
  }

  const isSaving = saveMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="size-4" />
            保存镜像
          </DialogTitle>
          <DialogDescription>
            将当前云主机的系统环境保存为可复用镜像，保存后可在「我的镜像」中选用。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="image-tag">镜像标签</Label>
            <Input
              id="image-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="my-app-snapshot"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              完整地址：<code className="font-mono">{imageRef}</code>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            基于{" "}
            <span className="font-medium text-foreground">
              {inst.imageId} · {inst.imageVersion}
            </span>{" "}
            的当前运行状态将被快照。保存过程约需 1–3 分钟，期间实例仍可正常使用。
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "保存中…" : "确认保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
