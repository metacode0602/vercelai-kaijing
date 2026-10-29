'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  countByStatus,
  createPurchaseRequestHeader,
  toListRow,
  usePurchaseRequests,
  withdrawPurchaseRequest,
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

export default function PurchaseRequestsPage() {
  const requests = usePurchaseRequests()
  const rows = React.useMemo(() => requests.map(toListRow), [requests])
  const counts = React.useMemo(() => countByStatus(requests), [requests])
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="新建采购申请 · 主信息"
      description="第一步只保存申请主信息（purchase_requests）。保存后进入详情页，再添加申请明细（purchase_request_lines）；提交审核通过后才会生成采购单。"
      fields={[
        { key: 'reason', label: '采购原因', options: REASON_OPTIONS, required: true },
        { key: 'supplier', label: '供应商', options: SUPPLIER_OPTIONS, required: true, helper: '对应 supplier_id；停用供应商不可新建' },
        { key: 'warehouse', label: '预计入库仓', options: WAREHOUSE_OPTIONS, required: true, helper: '对应 warehouse_id' },
        { key: 'currency', label: '币种', options: ['CNY', 'USD'], required: true },
        { key: 'expectedAt', label: '期望到货', type: 'date', required: true, helper: '对应 expected_arrival_at' },
        {
          key: 'remark',
          label: '申请说明',
          type: 'textarea',
          fullWidth: true,
          placeholder: '关联库存预警、活动备货或 AI 选品候选',
        },
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
        setNotice(`${created.requestNo} 主信息已保存（草稿）。正在进入详情页添加申请明细…`)
        router.push(`/console/purchase-requests/${encodeURIComponent(created.id)}`)
      }}
      saveLabel="保存主信息并继续"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="采购申请"
        description="主信息与申请明细分步维护：先建 purchase_requests，再在详情添加 purchase_request_lines；正式批准后才转为 purchase_orders。"
        rows={rows}
        detailHref={(row) => `/console/purchase-requests/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'requestNo', 'applicant', 'firstSku', 'supplier', 'reason', 'status', 'approver']}
        searchPlaceholder="搜索申请号、SKU、申请人或供应商"
        filters={[
          {
            label: '状态',
            options: ['草稿', '待审核', '已批准', '已驳回', '已转采购单', '已取消'],
          },
        ]}
        addLabel="新建采购申请"
        onAdd={() => setOpen(true)}
        emptyText="暂无采购申请。点击「新建采购申请」先保存主信息，再在详情添加明细。"
        columns={[
          { key: 'requestNo', label: '申请单号' },
          { key: 'applicant', label: '申请人' },
          { key: 'reason', label: '采购原因' },
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
            key: 'totalQty',
            label: '申请数量',
            render: (row) => String(row.totalQty),
          },
          { key: 'supplier', label: '供应商' },
          {
            key: 'totalAmount',
            label: '合计金额',
            render: (row) => `${row.totalAmount} ${row.currency}`,
          },
          { key: 'expectedAt', label: '期望到货' },
          { key: 'warehouse', label: '入库仓' },
          { key: 'approver', label: '审核人' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
        ]}
      >
        <UedPrototypeNotice>
          创建流程对齐表结构：列表「新建」只写主信息（供应商、仓库、币种、期望到货等），不要求同时填写行项目。明细在详情页按行追加；提交后进入「采购审核」；仅正式批准后才会生成 purchase_orders + purchase_order_lines。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">草稿 {counts.草稿}</Badge>
          <Badge variant="outline">待审核 {counts.待审核}</Badge>
          <Badge variant="outline">已驳回 {counts.已驳回}</Badge>
          <Badge variant="secondary">已转采购单 {counts.已转采购单}</Badge>
          <Badge variant="outline">已取消 {counts.已取消}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.status === '待审核')
            .map((row) => (
              <Button
                key={row.id}
                variant="outline"
                size="sm"
                onClick={() => {
                  withdrawPurchaseRequest(requests, row.id)
                  setNotice(`${row.id} 已撤回为草稿（原型）；可修改后重新提交。`)
                }}
              >
                撤回 · {row.id}
              </Button>
            ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setNotice('补货建议来源：库存预警「HSY000001002 可用 9 低于安全库存 20」（示例）。请新建申请主信息后添加该 SKU 明细。')
            }
          >
            从库存预警带入
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/console/purchase-approvals')}
          >
            前往采购审核
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
