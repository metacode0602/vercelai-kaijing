'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  createPurchaseOrderHeader,
  listReceivablePurchaseOrders,
  toListRow,
  usePurchaseOrders,
} from '@/lib/crossborder/purchase-order-store'
import {
  createReceiptFromPurchaseOrder,
  usePurchaseReceipts,
} from '@/lib/crossborder/purchase-receipt-store'
import { usePurchaseRequests } from '@/lib/crossborder/purchase-request-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const SUPPLIER_OPTIONS = ['厦门优品服饰有限公司', '泉州联创数码配件厂']
const WAREHOUSE_OPTIONS = ['WH-CN-XMN-001']

export default function PurchaseOrdersPage() {
  const orders = usePurchaseOrders()
  const receipts = usePurchaseReceipts()
  const purchaseRequests = usePurchaseRequests()
  const receivable = React.useMemo(() => listReceivablePurchaseOrders(orders), [orders])
  const REQUEST_OPTIONS = React.useMemo(() => {
    const nos = purchaseRequests.map((item) => item.requestNo)
    return [...nos, '—']
  }, [purchaseRequests])
  const rows = React.useMemo(() => orders.map(toListRow), [orders])
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  function registerReceive(poId: string) {
    const result = createReceiptFromPurchaseOrder(receipts, poId, { receivedBy: '当前用户' })
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    setNotice(`${poId} 已创建到货批次 ${result.receipt.receiptNo}，正在打开…`)
    router.push(`/console/purchase-receipts/${encodeURIComponent(result.receipt.id)}`)
  }

  const editor = open ? (
    <UedDialog
      title="新建采购单 · 主信息"
      description="第一步只保存采购单主信息（purchase_orders）。保存后进入详情页，再添加具体采购明细（purchase_order_lines）。"
      fields={[
        {
          key: 'sourceRequest',
          label: '来源申请',
          options: REQUEST_OPTIONS,
          required: true,
          helper: '对应 purchase_request_id；手工建单可选「—」',
        },
        { key: 'supplier', label: '供应商', options: SUPPLIER_OPTIONS, required: true, helper: '对应 supplier_id' },
        { key: 'warehouse', label: '收货仓库', options: WAREHOUSE_OPTIONS, required: true, helper: '对应 warehouse_id' },
        { key: 'currency', label: '币种', options: ['CNY', 'USD'], required: true },
        { key: 'expectedAt', label: '预计到货', type: 'date', required: true, helper: '对应 expected_arrival_at' },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const created = createPurchaseOrderHeader(orders, {
          sourceRequest: values.sourceRequest || '—',
          supplier: values.supplier || SUPPLIER_OPTIONS[0]!,
          warehouse: values.warehouse || WAREHOUSE_OPTIONS[0]!,
          currency: values.currency || 'CNY',
          expectedAt: values.expectedAt || new Date().toISOString().slice(0, 10),
        })
        setOpen(false)
        setNotice(`${created.poNo} 主信息已保存（草稿）。正在进入详情页添加采购明细…`)
        router.push(`/console/purchase-orders/${encodeURIComponent(created.id)}`)
      }}
      saveLabel="保存主信息并继续"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="采购单"
        description="主信息与采购明细分步维护：先建 purchase_orders，再在详情添加 purchase_order_lines。"
        rows={rows}
        detailHref={(row) => `/console/purchase-orders/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'poNo', 'sourceRequest', 'supplier', 'firstSku', 'status', 'warehouse']}
        searchPlaceholder="搜索采购单号、申请号或供应商"
        filters={[{ label: '状态', options: ['草稿', '已下发', '部分到货', '已收货', '已关闭', '已取消'] }]}
        addLabel="新建采购单"
        onAdd={() => setOpen(true)}
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
        <UedPrototypeNotice>
          创建流程对齐表结构：列表「新建」只写主信息（供应商、仓库、币种、预计到货等），不要求同时填写行项目。明细在详情页按行追加；无明细的草稿也可先保存。正式环境仍可由已审核申请转换生成。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {receivable.map((row) => (
            <Button key={row.id} variant="outline" size="sm" onClick={() => registerReceive(row.id)}>
              登记到货 · {row.poNo}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => router.push('/console/purchase-receipts')}>
            打开到货质检入库
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNotice('催货通知已生成（原型，不会联系供应商）。')}
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
    </>
  )
}
