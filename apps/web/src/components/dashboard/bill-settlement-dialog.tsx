'use client'

import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
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
import { Textarea } from '@workspace/ui/components/textarea'

function formatAmount(value: number): string {
  return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface BillSettlementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  billId: string
  billMonth: string
  finalAmount: number
  isPending: boolean
  onSubmit: (input: { paidBy: string; paymentReference: string; adjustmentReason: string }) => void
}

/**
 * 标记结算（W-7）。
 *
 * 付款流水号不是可选项：没有回单号的对账记录在财务上等于没记录，
 * 因此这里强制必填，而不是做成「可选增强」。
 */
export function BillSettlementDialog({
  open,
  onOpenChange,
  billId,
  billMonth,
  finalAmount,
  isPending,
  onSubmit,
}: BillSettlementDialogProps) {
  const [paidBy, setPaidBy] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPaidBy('')
    setPaymentReference('')
    setAdjustmentReason('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleSubmit() {
    if (!paidBy.trim()) {
      setError('请填写实际付款人')
      return
    }
    if (!paymentReference.trim()) {
      setError('请填写付款流水号 / 银行回单号')
      return
    }
    setError(null)
    onSubmit({
      paidBy: paidBy.trim(),
      paymentReference: paymentReference.trim(),
      adjustmentReason: adjustmentReason.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>标记结算</DialogTitle>
          <DialogDescription>
            {billMonth} 账单，结算金额 ¥{formatAmount(finalAmount)}。付款信息会写入结算审计记录。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`paidBy-${billId}`}>实际付款人</Label>
            <Input
              id={`paidBy-${billId}`}
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              placeholder="如：张三 / 运营中心对公账户"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`paymentReference-${billId}`}>付款流水号 / 银行回单号</Label>
            <Input
              id={`paymentReference-${billId}`}
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="如：HX20260926000123"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`adjustmentReason-${billId}`}>付款备注（可选）</Label>
            <Textarea
              id={`adjustmentReason-${billId}`}
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="仅作审计留痕，不改变账单金额"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              仅记录付款备注，不会调整账单金额。本次结算金额固定为 ¥
              {finalAmount.toLocaleString('zh-CN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              。如需改金额，请走账单异议流程由运营另开调整单。
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? '提交中…' : '确认结算'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
