'use client'

/**
 * 兼容旧入口「采购管理」：与采购申请共用同一 store 与两步创建流程。
 * 主路径请使用 /console/purchase-requests 与 /console/purchase-approvals。
 */

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  countByStatus,
  createPurchaseRequestHeader,
  toListRow,
  usePurchaseRequests,
} from '@/lib/crossborder/purchase-request-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const SUPPLIER_OPTIONS = ['厦门优品服饰有限公司', '泉州联创数码配件厂']
const WAREHOUSE_OPTIONS = ['WH-CN-XMN-001']
const REASON_OPTIONS = ['备货', '补货', '订单采购']

function statusVariant(status: string) {
  if (status === '待审核') return 'outline' as const
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '已转采购单' || status === '已批准') return 'secondary' as const
  return 'outline' as const
}

export default function PurchasesPage() {
  const requests = usePurchaseRequests()
  const rows = React.useMemo(() => requests.map(toListRow), [requests])
  const counts = React.useMemo(() => countByStatus(requests), [requests])
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)

  const editor = open ? (
    <UedDialog
      title="新建采购申请 · 主信息"
      description="与「采购申请」相同：先保存 purchase_requests 主信息，再在详情添加明细；批准后才生成采购单。"
      fields={[
        { key: 'reason', label: '采购原因', options: REASON_OPTIONS, required: true },
        { key: 'supplier', label: '供应商', options: SUPPLIER_OPTIONS, required: true },
        { key: 'warehouse', label: '预计入库仓', options: WAREHOUSE_OPTIONS, required: true },
        { key: 'currency', label: '币种', options: ['CNY', 'USD'], required: true },
        { key: 'expectedAt', label: '期望到货', type: 'date', required: true },
        { key: 'remark', label: '申请说明', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const created = createPurchaseRequestHeader(requests, {
          reason: values.reason || REASON_OPTIONS[0]!,
          supplier: values.supplier || SUPPLIER_OPTIONS[0]!,
          warehouse: values.warehouse || WAREHOUSE_OPTIONS[0]!,
          currency: values.currency || 'CNY',
          expectedAt: values.expectedAt || new Date().toISOString().slice(0, 10),
          remark: values.remark,
        })
        setOpen(false)
        router.push(`/console/purchase-requests/${encodeURIComponent(created.id)}`)
      }}
      saveLabel="保存主信息并继续"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="采购管理"
        description="兼容入口：申请创建 → 明细 → 审核转采购单。完整页面见「采购申请 / 采购审核 / 采购单」。"
        rows={rows}
        detailHref={(row) => `/console/purchase-requests/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'requestNo', 'applicant', 'firstSku', 'supplier', 'status']}
        searchPlaceholder="搜索申请号、SKU 或供应商"
        filters={[
          { label: '状态', options: ['草稿', '待审核', '已驳回', '已转采购单', '已取消'] },
        ]}
        addLabel="新建采购申请"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'requestNo', label: '申请单号' },
          { key: 'applicant', label: '申请人' },
          {
            key: 'firstSku',
            label: '首行 SKU',
            render: (row) => (row.lineCount > 0 ? row.firstSku : '待添加'),
          },
          {
            key: 'totalQty',
            label: '申请数量',
            render: (row) => String(row.totalQty),
          },
          { key: 'supplier', label: '供应商' },
          {
            key: 'totalAmount',
            label: '金额',
            render: (row) => `${row.totalAmount} ${row.currency}`,
          },
          { key: 'approver', label: '审核人' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
          {
            key: 'convertedPoId',
            label: '采购单',
            render: (row) => row.convertedPoId || '—',
          },
        ]}
      >
        <UedPrototypeNotice>
          本页与「采购申请」共用会话数据。流程：创建主信息 → 详情加明细 → 提交审核 → 采购审核批准后生成
          purchase_orders / purchase_order_lines。收货与质检请到「到货质检入库 / 采购单」。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">待审核 {counts.待审核}</Badge>
          <Badge variant="secondary">已转采购单 {counts.已转采购单}</Badge>
          <Button size="sm" variant="outline" onClick={() => router.push('/console/purchase-requests')}>
            采购申请
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push('/console/purchase-approvals')}>
            采购审核
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push('/console/purchase-orders')}>
            采购单
          </Button>
        </div>
      </UedWorkspace>
    </>
  )
}
