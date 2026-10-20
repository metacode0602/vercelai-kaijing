'use client'

import { useEffect, useRef } from 'react'
import { trpc } from '@/lib/trpc/client'
import type { MerchantMonthlyBillListItem } from '@/lib/types/merchant'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

const NONE_VALUE = '__none__'

function formatBillLabel(bill: MerchantMonthlyBillListItem) {
  const amount = bill.totalAmount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${bill.billMonth} · ¥${amount}`
}

export type MerchantMonthlyBillSelectProps = {
  merchantId: string
  /** 账期 YYYY-MM，空表示不关联 */
  value: string
  onValueChange: (billMonth: string) => void
  /** 选中账单时回调；清空时传 null */
  onBillSelected: (bill: MerchantMonthlyBillListItem | null) => void
  /** 打开时若已有 value，账单列表加载后自动回调一次金额回填 */
  autoFillOnMount?: boolean
  disabled?: boolean
}

export function MerchantMonthlyBillSelect({
  merchantId,
  value,
  onValueChange,
  onBillSelected,
  autoFillOnMount = false,
  disabled,
}: MerchantMonthlyBillSelectProps) {
  const billsQuery = trpc.merchant.bill.monthly.useQuery(
    { merchantId },
    { enabled: Boolean(merchantId) },
  )
  const bills = billsQuery.data ?? []
  const filledKeyRef = useRef<string>('')
  const wasAutoFillRef = useRef(false)

  useEffect(() => {
    if (autoFillOnMount && !wasAutoFillRef.current) {
      filledKeyRef.current = ''
    }
    wasAutoFillRef.current = autoFillOnMount
  }, [autoFillOnMount])

  useEffect(() => {
    if (!autoFillOnMount || !value || bills.length === 0) return
    const key = `${merchantId}:${value}`
    if (filledKeyRef.current === key) return
    const bill = bills.find((b) => b.billMonth === value)
    if (!bill) return
    filledKeyRef.current = key
    onBillSelected(bill)
  }, [autoFillOnMount, value, bills, merchantId, onBillSelected])

  return (
    <div className="grid gap-2">
      <Label>关联月度账单（可选）</Label>
      <Select
        value={value || NONE_VALUE}
        onValueChange={(v) => {
          if (v === NONE_VALUE) {
            onValueChange('')
            onBillSelected(null)
            return
          }
          onValueChange(v)
          const bill = bills.find((b) => b.billMonth === v) ?? null
          onBillSelected(bill)
        }}
        disabled={disabled || billsQuery.isLoading}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={billsQuery.isLoading ? '加载账单…' : '不关联'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>不关联</SelectItem>
          {bills.map((bill) => (
            <SelectItem key={bill.id} value={bill.billMonth}>
              {formatBillLabel(bill)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
