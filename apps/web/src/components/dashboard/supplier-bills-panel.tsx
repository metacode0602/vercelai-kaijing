'use client'

import { useCallback, useState } from 'react'
import { CheckCircle2, Download } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import type { Supplier } from '@/lib/data/types'
import { trpc } from '@/lib/trpc/client'
import {
  billCooperationModeLabels,
  billPricingModeLabels,
  billStatusColors,
  statusNames,
} from '@/components/dashboard/supplier-detail-constants'
import {
  computeBillDetailAmount,
  isRevenueSharePricingMode,
} from '@/lib/supplier/pricing-mode'
import { toast } from 'sonner'
import { BillSettlementDialog } from './bill-settlement-dialog'

interface SupplierBillsPanelProps {
  supplier: Supplier
}

export function SupplierBillsPanel({ supplier }: SupplierBillsPanelProps) {
  const utils = trpc.useUtils()
  const [settlingBillId, setSettlingBillId] = useState<string | null>(null)
  const { data: bills = [], isLoading } = trpc.supplier.listBills.useQuery({
    supplierId: supplier.id,
  })
  const settlingBill = bills.find((b) => b.id === settlingBillId)

  // W-26：此前「导出账单」按钮没有 onClick，是个死按钮，供应商无法自助导出对账单。
  // 导出为单张平表：账单头字段逐行重复，便于直接在 Excel 里透视/求和。
  const handleExport = useCallback(() => {
    if (bills.length === 0) return

    const escapeCsv = (v: string | number | null | undefined): string => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const amount = (v: number | null | undefined) =>
      v == null ? '' : v.toFixed(4)

    const header = [
      '账单月',
      '状态',
      '结算模式',
      '计价方式',
      '总使用卡时',
      '账单金额',
      '网络费用',
      '管控节点费用',
      '应结金额',
      '结算截止',
      '机房',
      '卡型',
      '使用卡时',
      '单价',
      '客户消费',
      '明细金额',
    ]

    const rows: (string | number)[][] = []
    for (const bill of bills) {
      const base = [
        bill.month,
        statusNames[bill.status] ?? bill.status,
        billCooperationModeLabels[bill.cooperationMode] ?? bill.cooperationMode,
        billPricingModeLabels[bill.pricingMode] ?? bill.pricingMode,
        amount(bill.totalUsageHours),
        amount(bill.totalAmount),
        amount(bill.networkFee),
        amount(bill.managementFee),
        amount(bill.finalAmount),
        bill.dueDate ?? '',
      ]
      if (bill.details.length === 0) {
        rows.push([...base, '', '', '', '', '', ''])
        continue
      }
      for (const detail of bill.details) {
        const computed = computeBillDetailAmount({
          pricingMode: detail.pricingMode,
          amount: detail.amount,
          tenantConsumption: detail.tenantConsumption,
          revenueShareRatio: supplier.revenueShareRatio,
        })
        rows.push([
          ...base,
          detail.dataCenterName ?? '',
          detail.cardTypeName ?? '',
          amount(detail.usageHours),
          detail.unitCost == null ? '' : detail.unitCost.toFixed(4),
          amount(detail.tenantConsumption),
          computed.pending ? '待结算' : amount(computed.value),
        ])
      }
    }

    const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\r\n')
    // 加 BOM，否则 Excel 打开中文表头会乱码
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${supplier.name}-供应商结算账单-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`已导出 ${rows.length} 行`)
  }, [bills, supplier.name, supplier.revenueShareRatio])
  const markPaidMutation = trpc.supplier.markBillPaid.useMutation({
    onSuccess: async () => {
      toast.success('已标记为已结算')
      setSettlingBillId(null)
      await utils.supplier.listBills.invalidate({ supplierId: supplier.id })
    },
    onError: (err) => {
      toast.error(err.message || '标记结算失败')
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-foreground">账单结算</h2>
          <p className="text-sm text-muted-foreground">按月查看与供应商的结算账单</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          disabled={bills.length === 0}
          onClick={handleExport}
        >
          <Download className="w-4 h-4" />
          导出账单
        </Button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">加载账单列表…</p>
      )}

      {!isLoading && bills.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            暂无结算账单
          </CardContent>
        </Card>
      )}

      {bills.map((bill) => {
        // mixed 表示当月跨机房/卡型计价方式不一致，只要有一行走分成公式就展示客户消费列。
        const showConsumptionColumn =
          isRevenueSharePricingMode(bill.pricingMode) ||
          bill.pricingMode === 'mixed' ||
          bill.details.some((d) => isRevenueSharePricingMode(d.pricingMode))
        return (
          <Card key={bill.id} className="bg-card border-border">
            <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <CardTitle className="text-base">{bill.month} 月度账单</CardTitle>
                  <CardDescription>
                    账单生成于 {new Date(bill.createdAt).toLocaleDateString('zh-CN')}
                  </CardDescription>
                </div>
                <Badge variant="outline" className={billStatusColors[bill.status]}>
                  {statusNames[bill.status]}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-foreground">
                  ¥{bill.finalAmount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">应结金额</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-5 gap-4 p-4 rounded-lg bg-muted/30">
              <div>
                <p className="text-sm text-muted-foreground">结算模式</p>
                <Badge
                  variant="outline"
                  className={
                    bill.cooperationMode === 'idle_time'
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 mt-1'
                      : 'bg-purple-500/10 text-purple-400 border-purple-500/30 mt-1'
                  }
                >
                  {billCooperationModeLabels[bill.cooperationMode] ?? bill.cooperationMode}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">计价方式</p>
                <Badge variant="outline" className="mt-1">
                  {billPricingModeLabels[bill.pricingMode] ?? bill.pricingMode}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">总使用卡时</p>
                <p className="text-lg font-semibold text-foreground">
                  {bill.totalUsageHours.toLocaleString()} 小时
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">网络费用</p>
                <p className="text-lg font-semibold text-foreground">
                  ¥{bill.networkFee.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">管控节点费用</p>
                <p className="text-lg font-semibold text-foreground">
                  ¥{bill.managementFee.toLocaleString()}
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">机房</TableHead>
                  <TableHead className="text-muted-foreground">卡型</TableHead>
                  <TableHead className="text-muted-foreground">使用卡时</TableHead>
                  <TableHead className="text-muted-foreground">单价</TableHead>
                  {showConsumptionColumn && (
                    <TableHead className="text-muted-foreground">客户消费</TableHead>
                  )}
                  <TableHead className="text-muted-foreground">金额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bill.details.map((detail, index) => {
                  const amount = computeBillDetailAmount({
                    pricingMode: detail.pricingMode,
                    amount: detail.amount,
                    tenantConsumption: detail.tenantConsumption,
                    revenueShareRatio: supplier.revenueShareRatio,
                  })
                  return (
                    <TableRow key={index} className="border-border">
                      <TableCell className="text-foreground">{detail.dataCenterName}</TableCell>
                      <TableCell className="text-foreground">{detail.cardTypeName}</TableCell>
                      <TableCell className="text-foreground">
                        {detail.usageHours.toLocaleString()} 小时
                      </TableCell>
                      <TableCell className="text-foreground">¥{detail.unitCost}/小时</TableCell>
                      {showConsumptionColumn && (
                        <TableCell className="text-foreground">
                          {detail.tenantConsumption == null ? (
                            <span className="text-muted-foreground">待结算</span>
                          ) : (
                            `¥${detail.tenantConsumption.toLocaleString()}`
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-foreground">
                        {amount.pending ? (
                          <span className="text-muted-foreground">待结算</span>
                        ) : (
                          `¥${amount.value.toLocaleString()}`
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">结算截止: {bill.dueDate}</span>
                {bill.paidAt && (
                  <span className="text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    已于 {new Date(bill.paidAt).toLocaleDateString('zh-CN')} 结算
                  </span>
                )}
              </div>
              {bill.status === 'confirmed' && (
                <Button
                  disabled={markPaidMutation.isPending}
                  onClick={() => setSettlingBillId(bill.id)}
                >
                  标记已结算
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        )
      })}

      <BillSettlementDialog
        open={settlingBillId !== null}
        onOpenChange={(open) => {
          if (!open) setSettlingBillId(null)
        }}
        billId={settlingBillId ?? ''}
        billMonth={settlingBill?.month ?? ''}
        finalAmount={settlingBill?.finalAmount ?? 0}
        isPending={markPaidMutation.isPending}
        onSubmit={(input) => {
          if (!settlingBillId) return
          markPaidMutation.mutate({ billId: settlingBillId, ...input })
        }}
      />
    </div>
  )
}
