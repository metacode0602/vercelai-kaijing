"use client"

import { useEffect, useState } from "react"
import { MessageSquarePlus } from "lucide-react"
import { toast } from "sonner"
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
import { Textarea } from "@workspace/ui/components/textarea"

interface EnvFeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EnvFeedbackDialog({ open, onOpenChange }: EnvFeedbackDialogProps) {
  const [envName, setEnvName] = useState("")
  const [description, setDescription] = useState("")
  const [contact, setContact] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setEnvName("")
    setDescription("")
    setContact("")
    setSubmitting(false)
  }, [open])

  function handleSubmit() {
    const trimmedName = envName.trim()
    if (!trimmedName) {
      toast.error("请填写您需要的环境名称")
      return
    }

    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      onOpenChange(false)
      toast.success("需求已提交，我们会尽快评估并上架")
    }, 600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="size-4" />
            环境需求反馈
          </DialogTitle>
          <DialogDescription>
            告诉我们您需要的环境或镜像，提交后由平台评估是否上架。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="env-name">环境名称</Label>
            <Input
              id="env-name"
              value={envName}
              onChange={(event) => setEnvName(event.target.value)}
              placeholder="例如：JAX 0.4 + CUDA 12.4"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="env-description">
              详细说明
              <span className="ml-1 font-normal text-muted-foreground">（选填）</span>
            </Label>
            <Textarea
              id="env-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="框架版本、Python 版本、CUDA 要求等"
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="env-contact">
              联系方式
              <span className="ml-1 font-normal text-muted-foreground">（选填）</span>
            </Label>
            <Input
              id="env-contact"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="邮箱或手机号，便于通知上架进度"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "提交中…" : "提交需求"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface EnvFeedbackLinkProps {
  className?: string
  onClick: () => void
}

export function EnvFeedbackLink({ className, onClick }: EnvFeedbackLinkProps) {
  return (
    <button type="button" onClick={onClick} className={className}>
      没有我要的环境？
    </button>
  )
}
