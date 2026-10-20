"use client"

import { TEMPLATES } from "@/lib/gpu-data"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

interface TemplatePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (image: string) => void
}

export function TemplatePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择模板</DialogTitle>
          <DialogDescription>从预置模板中选择容器镜像地址。</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto py-1">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className={cn(
                "flex flex-col rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors",
                "hover:border-primary/40 hover:bg-accent/40",
              )}
              onClick={() => {
                onSelect(template.image)
                onOpenChange(false)
              }}
            >
              <span className="text-sm font-medium text-foreground">{template.name}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">{template.category}</span>
              <code className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {template.image}
              </code>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
