'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { usePurchaseOrders } from '@/lib/crossborder/purchase-order-store'
import {
  approveAndConvertPurchaseRequest,
  countByStatus,
  rejectPurchaseRequest,
  toApprovalListRow,
  usePurchaseRequests,
} from '@/lib/crossborder/purchase-request-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '待审核') return 'outline' as const
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '已转采购单' || status === '已批准') return 'secondary' as const
  return 'outline' as const
}

export default function PurchaseApprovalsPage() {
  const requests = usePurchaseRequests()
  const orders = usePurchaseOrders()
  const router = useLocaleRouter()
  const rows = React.useMemo(() => {
    const mapped = requests.map(toApprovalListRow)
    return [...mapped].sort((a, b) => {
      const rank = (status: string) => (status === '待审核' ? 0 : status === '已驳回' ? 1 : 2)
      const diff = rank(a.status) - rank(b.status)
      if (diff !== 0) return diff
      return (b.submittedAt || '').localeCompare(a.submittedAt || '')
    })
  }, [requests])
  const counts = React.useMemo(() => countByStatus(requests), [requests])
  const [notice, setNotice] = React.useState('')
  const [opinionFor, setOpinionFor] = React.useState<string | null>(null)
  const [decisionMode, setDecisionMode] = React.useState<'approve' | 'reject'>('reject')

  function approve(id: string, opinion?: string, approver?: string) {
    const result = approveAndConvertPurchaseRequest(requests, orders, id, { opinion, approver })
    if (!result.ok) {
      setNotice(result.reason)
      setOpinionFor(null)
      return
    }
    setNotice(
      `${id} 已批准并生成采购单 ${result.order.poNo}（草稿，含 ${result.order.lines.length} 行明细）。申请状态「已转采购单」。`,
    )
    setOpinionFor(null)
  }

  function reject(id: string, opinion: string, approver?: string) {
    const result = rejectPurchaseRequest(requests, id, { opinion, approver })
    if (!result.ok) {
      setNotice(result.reason)
      setOpinionFor(null)
      return
    }
    setNotice(`${id} 已驳回（原型会话）；申请人可编辑后重新提交。`)
    setOpinionFor(null)
  }

  const editor = opinionFor ? (
    <UedDialog
      title={`${decisionMode === 'approve' ? '批准并转采购单' : '驳回申请'} · ${opinionFor}`}
      description={
        decisionMode === 'approve'
          ? '通过后写入 purchase_orders + purchase_order_lines，申请标记为「已转采购单」。审核意见随审批事件留痕。'
          : '驳回理由必填；驳回后申请回到可编辑状态（已驳回），保留审核历史意见。'
      }
      fields={[
        {
          key: 'opinion',
          label: '审核意见',
          type: 'textarea',
          required: true,
          fullWidth: true,
          placeholder: decisionMode === 'approve' ? '说明通过依据' : '说明驳回依据（必填）',
          defaultValue: decisionMode === 'approve' ? '同意转采购单（原型）' : '',
        },
        {
          key: 'approver',
          label: '审核人',
          required: true,
          helper: '系统按互审规则自动分配，不允许自审',
          defaultValue: requests.find((item) => item.id === opinionFor)?.approver.split(' / ')[0] || '杨洁',
        },
      ]}
      onClose={() => setOpinionFor(null)}
      onSave={(values) => {
        if (decisionMode === 'approve') {
          approve(opinionFor, values.opinion, values.approver)
        } else {
          reject(opinionFor, values.opinion || '', values.approver)
        }
      }}
      saveLabel={decisionMode === 'approve' ? '批准并生成采购单' : '确认驳回'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="采购审核"
        description="审核队列与采购申请共享同一数据源。通过后正式生成采购单；驳回须填写意见。"
        rows={rows}
        detailHref={(row) => `/console/purchase-approvals/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'requestNo', 'applicant', 'firstSku', 'approver', 'status', 'supplier']}
        searchPlaceholder="搜索申请号、申请人或 SKU"
        filters={[{ label: '状态', options: ['待审核', '已转采购单', '已驳回', '草稿', '已取消'] }]}
        emptyText="暂无待审或历史申请。请先在「采购申请」创建并提交。"
        columns={[
          { key: 'requestNo', label: '申请单号' },
          { key: 'applicant', label: '申请人' },
          {
            key: 'firstSku',
            label: '首行 SKU',
            render: (row) => (row.lineCount > 0 ? row.firstSku : '无明细'),
          },
          {
            key: 'totalQty',
            label: '数量',
            render: (row) => String(row.totalQty),
          },
          {
            key: 'totalAmount',
            label: '金额',
            render: (row) => `${row.totalAmount} ${row.currency}`,
          },
          { key: 'supplier', label: '供应商' },
          { key: 'submittedAt', label: '提交时间' },
          { key: 'approver', label: '分配审核人' },
          { key: 'opinion', label: '审核意见' },
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
          互审规则：普通员工由杨洁或黄发聪审核；杨洁的申请由黄发聪审核、黄发聪的申请由杨洁审核，禁止自审。批准动作会创建
          purchase_orders（主信息）并复制 purchase_request_lines → purchase_order_lines；申请状态变为「已转采购单」。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">待审核 {counts.待审核}</Badge>
          <Badge variant="secondary">已转采购单 {counts.已转采购单}</Badge>
          <Badge variant="destructive">已驳回 {counts.已驳回}</Badge>
          {['杨洁 ↔ 黄发聪 互审', '禁自审', '批准即生成采购单'].map((rule) => (
            <Badge key={rule} variant="outline">
              {rule}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.status === '待审核')
            .map((row) => (
              <React.Fragment key={row.id}>
                <Button
                  size="sm"
                  onClick={() => {
                    setDecisionMode('approve')
                    setOpinionFor(row.id)
                  }}
                >
                  通过并转采购单 · {row.id}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDecisionMode('reject')
                    setOpinionFor(row.id)
                  }}
                >
                  填写意见并驳回
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    router.push(`/console/purchase-requests/${encodeURIComponent(row.id)}`)
                  }
                >
                  查看申请详情
                </Button>
              </React.Fragment>
            ))}
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
