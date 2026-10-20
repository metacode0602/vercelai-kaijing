"use client"

import { useEffect, useState } from "react"
import { ArrowUpCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { cn } from "@/lib/utils"
import {
  DISK_EXPAND_RATE_PER_GB_DAY,
  formatCNY,
  getDeployPrice,
  GPU_COUNT_OPTIONS,
  type DeployBillingMethod,
  type MarketOffering,
} from "@/lib/server-market-data"
import {
  filterOptionActive,
  filterOptionInactive,
} from "../../../_components/theme-styles"

interface UpgradeConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  offering: MarketOffering
  billing: DeployBillingMethod
  gpuCount: number
  diskExpandEnabled: boolean
  extraDiskGb: number
  onConfirm: (values: {
    gpuCount: number
    diskExpandEnabled: boolean
    extraDiskGb: number
  }) => void
}

export function UpgradeConfigDialog({
  open,
  onOpenChange,
  offering,
  billing,
  gpuCount: initialGpuCount,
  diskExpandEnabled: initialDiskExpand,
  extraDiskGb: initialExtraDisk,
  onConfirm,
}: UpgradeConfigDialogProps) {
  const [gpuCount, setGpuCount] = useState(initialGpuCount)
  const [diskExpandEnabled, setDiskExpandEnabled] = useState(initialDiskExpand)
  const [extraDiskGb, setExtraDiskGb] = useState(initialExtraDisk)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setGpuCount(initialGpuCount)
      setDiskExpandEnabled(initialDiskExpand)
      setExtraDiskGb(initialExtraDisk)
    }
  }, [open, initialGpuCount, initialDiskExpand, initialExtraDisk])

  const currentPrice = getDeployPrice(offering, billing)
  const nextPrice = getDeployPrice(
    { ...offering, gpuCount },
    billing,
  )
  const priceDiff = nextPrice.amount - currentPrice.amount
  const hasChanges =
    gpuCount !== initialGpuCount ||
    diskExpandEnabled !== initialDiskExpand ||
    extraDiskGb !== initialExtraDisk

  function handleConfirm() {
    if (!hasChanges) {
      toast.info("配置未变更")
      return
    }
    setSubmitting(true)
    setTimeout(() => {
      onConfirm({ gpuCount, diskExpandEnabled, extraDiskGb })
      setSubmitting(false)
      onOpenChange(false)
      toast.success("配置升级已提交，请部署服务使变更生效")
    }, 800)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="size-4" />
            升级配置
          </DialogTitle>
          <DialogDescription>
            调整 GPU 数量与数据盘容量。升级后需关机并点击「部署服务」应用变更，镜像不可修改。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-bold">GPU 数量</Label>
            <div className="flex flex-wrap gap-2">
              {GPU_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setGpuCount(count)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    gpuCount === count ? filterOptionActive : filterOptionInactive,
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-bold">数据盘扩容</Label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={diskExpandEnabled}
                onCheckedChange={(checked) => setDiskExpandEnabled(checked === true)}
                className="mt-0.5"
              />
              <span>
                启用扩容
                {offering.expandableDiskGb != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    （上限 {offering.expandableDiskGb} GB，单价{" "}
                    {DISK_EXPAND_RATE_PER_GB_DAY} 元 / GB / 日）
                  </span>
                )}
              </span>
            </label>

            {diskExpandEnabled && offering.expandableDiskGb != null && (
              <div className="flex max-w-xs items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={offering.expandableDiskGb}
                  value={extraDiskGb}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isNaN(next)) return
                    setExtraDiskGb(
                      Math.min(Math.max(1, next), offering.expandableDiskGb!),
                    )
                  }}
                />
                <span className="shrink-0 text-sm text-muted-foreground">GB</span>
              </div>
            )}
          </div>

          {hasChanges && (
            <div className="rounded-lg border border-primary/30 bg-accent/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">预估费用变化：</span>
              <span className="font-semibold text-primary">
                {priceDiff >= 0 ? "+" : ""}
                {formatCNY(priceDiff)} / {nextPrice.unit}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!hasChanges || submitting}>
            {submitting ? "提交中…" : "确认升级"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
