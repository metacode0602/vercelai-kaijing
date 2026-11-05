'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function PurchaseOrdersPage() {
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.purchase.listOrders.useQuery({ page: 1, pageSize: 100 })
  const rows = listQuery.data?.items ?? []
  const receivable = rows.filter((row) =>
    ['已下发', '部分到货'].includes(row.status),
  )

  const registerMutation = trpc.purchase.registerReceipt.useMutation({
    onSuccess: async (receipt) => {
      await utils.purchase.listReceipts.invalidate()
      await utils.purchase.listOrders.invalidate()
      setNotice(`${receipt.purchaseOrderId} 已创建到货批次 ${receipt.receiptNo}，正在打开…`)
      router.push(`/console/purchase-receipts/${encodeURIComponent(receipt.id)}`)
    },
    onError: (error) => setNotice(error.message),
  })

  async function registerReceive(poId: string) {
    try {
      const order = await utils.purchase.getOrder.fetch({ id: poId })
      const lines = order.lines
        .map((line) => ({
          poLineId: line.id,
          sku: line.sku,
          qtyArrived: Math.max(0, line.qtyOrdered - line.qtyReceived),
        }))
        .filter((line) => line.qtyArrived > 0)
      if (!lines.length) {
        setNotice('该采购单已无待收数量')
        return
      }
      registerMutation.mutate({
        purchaseOrderId: order.id,
        receivedBy: '当前用户',
        lines,
      })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '加载采购单失败')
    }
  }

  return (
    <UedWorkspace
      title="采购单"
      description="由采购审核批准后写入 purchase_orders；可在此登记分批到货。数据经 tRPC 写入 PostgreSQL。"
      rows={rows}
      detailHref={(row) => `/console/purchase-orders/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'poNo', 'sourceRequest', 'supplier', 'firstSku', 'status', 'warehouse']}
      searchPlaceholder="搜索采购单号、申请号或供应商"
      filters={[{ label: '状态', options: ['草稿', '已下发', '部分到货', '已收货', '已关闭', '已取消'] }]}
      emptyText="暂无采购单。请先在「采购申请」提交并由「采购审核」批准转单。"
      columns={[
        { key: 'poNo', label: '采购单号' },
        { key: 'sourceRequest', label: '来源申请' },
        { key: 'supplier', label: '供应商' },
        {
          key: 'lineCount',
          label: '明细行数',
          render: (row) => String(row.lineCount),
        },
        {
          key: 'firstSku',
          label: '首行 SKU',
          render: (row) => (row.lineCount > 0 ? row.firstSku : '待添加'),
        },
        {
          key: 'totalAmount',
          label: '合计金额',
          render: (row) => `${row.totalAmount} ${row.currency}`,
        },
        { key: 'expectedAt', label: '预计到货' },
        { key: 'warehouse', label: '收货仓库' },
        {
          key: 'status',
          label: '状态',
          render: (row) => (
            <Badge variant={row.status === '已收货' || row.status === '已关闭' ? 'secondary' : 'outline'}>
              {row.status}
            </Badge>
          ),
        },
      ]}
    >
      {listQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{listQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <UedPrototypeNotice>
        采购单由审核批准生成（不再提供控制台手工新建）。列表可对「已下发 / 部分到货」登记到货批次，写入 purchase_receipts。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {receivable.map((row) => (
          <Button
            key={row.id}
            variant="outline"
            size="sm"
            disabled={registerMutation.isPending}
            onClick={() => registerReceive(row.id)}
          >
            登记到货 · {row.poNo}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => router.push('/console/purchase-receipts')}>
          打开到货质检入库
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setNotice('催货通知已生成（演示，不会联系供应商）。')}
        >
          供应商催货
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
