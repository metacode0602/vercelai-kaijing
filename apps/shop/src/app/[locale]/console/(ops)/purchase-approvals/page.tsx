'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { countByStatus } from '@/lib/crossborder/purchase-request-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function statusVariant(status: string) {
  if (status === '待审核') return 'outline' as const
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '已转采购单' || status === '已批准') return 'secondary' as const
  return 'outline' as const
}

export default function PurchaseApprovalsPage() {
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const [opinionFor, setOpinionFor] = React.useState<string | null>(null)
  const [decisionMode, setDecisionMode] = React.useState<'approve' | 'reject'>('reject')

  const listQuery = trpc.purchase.listRequests.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.purchase.requestStats.useQuery()

  const approveMutation = trpc.purchase.approveAndConvert.useMutation({
    onSuccess: async (result) => {
      await utils.purchase.listRequests.invalidate()
      await utils.purchase.listOrders.invalidate()
      await utils.purchase.requestStats.invalidate()
      setNotice(
        `${result.request.requestNo} 已批准并生成采购单 ${result.order.poNo}（含 ${result.order.lines.length} 行明细）。`,
      )
      setOpinionFor(null)
    },
    onError: (error) => {
      setNotice(error.message)
      setOpinionFor(null)
    },
  })
  const rejectMutation = trpc.purchase.rejectRequest.useMutation({
    onSuccess: async (row) => {
      await utils.purchase.listRequests.invalidate()
      await utils.purchase.requestStats.invalidate()
      setNotice(`${row.requestNo} 已驳回；申请人可编辑后重新提交。`)
      setOpinionFor(null)
    },
    onError: (error) => {
      setNotice(error.message)
      setOpinionFor(null)
    },
  })

  const requests = listQuery.data?.items ?? []
  const rows = React.useMemo(() => {
    return [...requests]
      .map((row) => ({
        ...row,
        pendingLabel: row.status === '待审核' ? '待审' : row.status,
      }))
      .sort((a, b) => {
        const rank = (status: string) => (status === '待审核' ? 0 : status === '已驳回' ? 1 : 2)
        const diff = rank(a.status) - rank(b.status)
        if (diff !== 0) return diff
        return (b.submittedAt || '').localeCompare(a.submittedAt || '')
      })
  }, [requests])
  const counts = statsQuery.data?.byStatus ?? countByStatus(rows)
  const current = requests.find((item) => item.id === opinionFor)

  const editor = opinionFor ? (
    <UedDialog
      title={`${decisionMode === 'approve' ? '批准并转采购单' : '驳回申请'} · ${current?.requestNo || opinionFor}`}
      description={
        decisionMode === 'approve'
          ? '通过后写入 purchase_orders + purchase_order_lines，申请标记为「已转采购单」。'
          : '驳回理由必填；驳回后申请回到可编辑状态（已驳回）。'
      }
      fields={[
        {
          key: 'opinion',
          label: '审核意见',
          type: 'textarea',
          required: true,
          fullWidth: true,
          placeholder: decisionMode === 'approve' ? '说明通过依据' : '说明驳回依据（必填）',
          defaultValue: decisionMode === 'approve' ? '同意转采购单' : '',
        },
        {
          key: 'approver',
          label: '审核人',
          required: true,
          helper: '系统按互审规则自动分配，不允许自审',
          defaultValue: current?.approver.split(' / ')[0] || '杨洁',
        },
      ]}
      onClose={() => setOpinionFor(null)}
      onSave={(values) => {
        if (decisionMode === 'approve') {
          approveMutation.mutate({
            id: opinionFor,
            opinion: values.opinion,
            approver: values.approver,
          })
        } else {
          rejectMutation.mutate({
            id: opinionFor,
            opinion: values.opinion || '',
            approver: values.approver,
          })
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
        description="审核队列与采购申请共享数据库。通过后正式生成采购单；驳回须填写意见。"
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
        {listQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>加载失败</AlertTitle>
            <AlertDescription>{listQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <UedPrototypeNotice>
          互审规则：普通员工由杨洁或黄发聪审核，禁止自审。批准后会生成采购单并复制明细。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">待审核 {counts['待审核'] ?? 0}</Badge>
          <Badge variant="secondary">已转采购单 {counts['已转采购单'] ?? 0}</Badge>
          <Badge variant="destructive">已驳回 {counts['已驳回'] ?? 0}</Badge>
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
                  通过并转采购单 · {row.requestNo}
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
