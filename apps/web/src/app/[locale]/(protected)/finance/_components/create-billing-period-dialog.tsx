'use client'

import { getPeriodDateRange, isValidPeriodCode } from '@/app/[locale]/(protected)/finance/_lib/period'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { IconLoader2 } from '@tabler/icons-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

export type CreateBillingPeriodDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 创建成功后回调 */
  onPeriodReady?: (period: { id: string }) => void
}

export function CreateBillingPeriodDialog({
  open,
  onOpenChange,
  onPeriodReady,
}: CreateBillingPeriodDialogProps) {
  const utils = trpc.useUtils()
  const createPeriod = trpc.finance.periods.create.useMutation()

  const [periodCode, setPeriodCode] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [ignoreListPriceWindows, setIgnoreListPriceWindows] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const datesReady =
    Boolean(periodStart) && Boolean(periodEnd) && periodStart <= periodEnd

  const resetState = useCallback(() => {
    setPeriodCode('')
    setPeriodStart('')
    setPeriodEnd('')
    setIgnoreListPriceWindows(true)
    setCreating(false)
    setCreateError(null)
  }, [])

  useEffect(() => {
    if (!open) resetState()
  }, [open, resetState])

  const canCreate = isValidPeriodCode(periodCode) && datesReady && !creating

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createPeriod.mutateAsync({
        periodCode: periodCode.trim(),
        periodStart,
        periodEnd,
        ignoreListPriceWindows,
      })
      await utils.finance.periods.list.invalidate()
      toast.success(`账期 ${created.period_code} 已创建`)
      onPeriodReady?.({ id: created.id })
      onOpenChange(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '创建账期失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>添加账期</DialogTitle>
          <DialogDescription>
            创建账期主数据后，请在账期收入页导入企业收入；成本与提成请在「月度成本」页跑批并确认固化。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="dialog_period_code">账期编码</Label>
              <Input
                id="dialog_period_code"
                placeholder="YYYY-MM，例如 2026-06"
                value={periodCode}
                onChange={(e) => {
                  const v = e.target.value
                  setPeriodCode(v)
                  const range = getPeriodDateRange(v)
                  if (range) {
                    setPeriodStart(range.start)
                    setPeriodEnd(range.end)
                  }
                }}
              />
              {periodCode.trim() && !isValidPeriodCode(periodCode) && (
                <p className="text-sm text-destructive">账期编码格式应为 YYYY-MM</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog_period_start">账期开始</Label>
              <Input
                id="dialog_period_start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog_period_end">账期结束</Label>
              <Input
                id="dialog_period_end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {periodStart && periodEnd && periodStart > periodEnd && (
            <p className="text-sm text-destructive">结束日期不能早于开始日期</p>
          )}

          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
            <Checkbox
              id="ignore_list_price"
              checked={ignoreListPriceWindows}
              onCheckedChange={(v) => setIgnoreListPriceWindows(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="ignore_list_price" className="cursor-pointer font-medium">
                忽略刊例价分段
              </Label>
              <p className="text-xs text-muted-foreground">
                开启后整月单窗口上传客户账单；关闭则按刊例价变动日切分多段上传（收入导入时使用）。
              </p>
            </div>
          </div>

          {createError && <p className="text-sm text-destructive">{createError}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!canCreate} onClick={() => void handleCreate()}>
            {creating ? (
              <>
                <IconLoader2 className="mr-2 size-4 animate-spin" />
                创建中…
              </>
            ) : (
              '创建账期'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
