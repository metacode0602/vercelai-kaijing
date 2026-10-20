'use client'

import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { MerchantDatacenterRegion, MerchantRegionStatus } from '@/lib/types/merchant'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

export type MerchantEditRegionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  region: MerchantDatacenterRegion | null
  onSaved: (region: MerchantDatacenterRegion) => void
}

export function MerchantEditRegionDialog({
  open,
  onOpenChange,
  merchantId,
  region,
  onSaved,
}: MerchantEditRegionDialogProps) {
  const updateMutation = trpc.merchant.region.update.useMutation()

  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [status, setStatus] = useState<MerchantRegionStatus>('open')
  const [quotaInput, setQuotaInput] = useState('')

  const isSubmitting = updateMutation.isPending

  useEffect(() => {
    if (!open || !region) return
    setEffectiveFrom(region.effectiveFrom)
    setDisplayName(region.displayName ?? '')
    setStatus(region.status)
    setQuotaInput(region.availableGpuQuota === null ? '' : String(region.availableGpuQuota))
  }, [open, region])

  const handleSubmit = async () => {
    if (!region) return
    if (!effectiveFrom.trim()) {
      toast.error('请指定生效开始时间')
      return
    }

    const quotaTrim = quotaInput.trim()
    let availableGpuQuota: number | null = null
    if (quotaTrim !== '') {
      const parsed = Number(quotaTrim)
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        toast.error('GPU 配额须为非负整数，或留空表示不限')
        return
      }
      availableGpuQuota = parsed
    }

    try {
      const updated = await updateMutation.mutateAsync({
        merchantId,
        regionId: region.id,
        effectiveFrom,
        displayName: displayName.trim() || undefined,
        status,
        availableGpuQuota,
      })
      onSaved(updated)
      toast.success('区域配置已保存')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存区域配置失败')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md min-w-[30vw] max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4" />
            编辑机房区域
          </DialogTitle>
        </DialogHeader>

        {region ? (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <p className="font-medium">{region.dataCenterName}</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {region.location} · {region.regionCode}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="merchant-edit-region-effective-from">
                生效开始时间 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="merchant-edit-region-effective-from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="merchant-edit-region-display-name">展示名（可选）</Label>
              <Input
                id="merchant-edit-region-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="覆盖默认机房名"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>开放状态</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as MerchantRegionStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">开放</SelectItem>
                    <SelectItem value="closed">关闭</SelectItem>
                    <SelectItem value="maintenance">维护中</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="merchant-edit-region-quota">GPU 配额</Label>
                <Input
                  id="merchant-edit-region-quota"
                  type="number"
                  min={0}
                  step={1}
                  value={quotaInput}
                  onChange={(e) => setQuotaInput(e.target.value)}
                  placeholder="留空表示不限"
                />
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!region || isSubmitting}>
            {isSubmitting ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
