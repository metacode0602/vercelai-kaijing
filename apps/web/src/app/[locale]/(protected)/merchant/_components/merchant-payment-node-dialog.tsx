'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { MerchantPaymentNode } from '@/lib/types/merchant'
import { MerchantMonthlyBillSelect } from './merchant-monthly-bill-select'
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
import { Textarea } from '@workspace/ui/components/textarea'

export type MerchantPaymentNodeFormInput = {
  name: string
  expectedAmount: number
  dueDate: string
  sortOrder?: number
  remark?: string
  billMonth?: string | null
}

export type MerchantPaymentNodeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  merchantId: string
  node?: MerchantPaymentNode
  onSubmit: (input: MerchantPaymentNodeFormInput) => void | Promise<void>
}

export function MerchantPaymentNodeDialog({
  open,
  onOpenChange,
  mode,
  merchantId,
  node,
  onSubmit,
}: MerchantPaymentNodeDialogProps) {
  const [name, setName] = useState('')
  const [expectedAmountInput, setExpectedAmountInput] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [sortOrderInput, setSortOrderInput] = useState('')
  const [remark, setRemark] = useState('')
  const [billMonth, setBillMonth] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && node) {
      setName(node.name)
      setExpectedAmountInput(String(node.expectedAmount))
      setDueDate(node.dueDate)
      setSortOrderInput(String(node.sortOrder))
      setRemark(node.remark ?? '')
      setBillMonth(node.billMonth ?? '')
    } else {
      setName('')
      setExpectedAmountInput('')
      setDueDate('')
      setSortOrderInput('')
      setRemark('')
      setBillMonth('')
    }
  }, [open, mode, node])

  const handleSubmit = async () => {
    const expectedAmount = Number(expectedAmountInput)
    if (!name.trim()) {
      toast.error('请填写节点名称')
      return
    }
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      toast.error('计划回款金额须为正数')
      return
    }
    if (!dueDate.trim()) {
      toast.error('请填写计划回款日期')
      return
    }

    const sortOrder = sortOrderInput.trim() ? Number(sortOrderInput) : undefined
    if (sortOrder != null && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      toast.error('排序须为非负整数')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        expectedAmount,
        dueDate: dueDate.trim(),
        sortOrder,
        remark: remark.trim() || undefined,
        billMonth: billMonth.trim() || null,
      })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增回款节点' : '编辑回款节点'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="node-name">节点名称</Label>
            <Input
              id="node-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：首期款、验收款"
              disabled={submitting}
            />
          </div>
          <MerchantMonthlyBillSelect
            merchantId={merchantId}
            value={billMonth}
            onValueChange={setBillMonth}
            onBillSelected={(bill) => {
              if (bill) setExpectedAmountInput(String(bill.totalAmount))
            }}
            disabled={submitting}
          />
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <Label htmlFor="node-amount">计划回款金额（元）</Label>
              <Input
                id="node-amount"
                type="number"
                min={0}
                step="0.01"
                value={expectedAmountInput}
                onChange={(e) => setExpectedAmountInput(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="node-due-date">计划回款日期</Label>
              <Input
                id="node-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="node-sort">排序（可选）</Label>
            <Input
              id="node-sort"
              type="number"
              min={0}
              step={1}
              value={sortOrderInput}
              onChange={(e) => setSortOrderInput(e.target.value)}
              placeholder="留空则自动追加"
              disabled={submitting}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="node-remark">备注</Label>
            <Textarea
              id="node-remark"
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                处理中…
              </>
            ) : mode === 'create' ? (
              '创建'
            ) : (
              '保存'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
