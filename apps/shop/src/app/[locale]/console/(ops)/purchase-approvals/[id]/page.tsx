'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { usePurchaseOrders } from '@/lib/crossborder/purchase-order-store'
import {
  approveAndConvertPurchaseRequest,
  rejectPurchaseRequest,
  usePurchaseRequests,
} from '@/lib/crossborder/purchase-request-store'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

function statusVariant(status: string) {
  if (status === '待审核') return 'outline' as const
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '已转采购单' || status === '已批准') return 'secondary' as const
  return 'outline' as const
}

export default function PurchaseApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const requests = usePurchaseRequests()
  const orders = usePurchaseOrders()
  const router = useLocaleRouter()
  const request = requests.find((item) => item.id === id)

  const [dialog, setDialog] = React.useState<'approve' | 'reject' | null>(null)
  const [notice, setNotice] = React.useState('')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!request) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/purchase-approvals"
          title={mounted ? '未找到审核单' : '加载审核单…'}
          description={
            mounted
              ? `申请 ${id} 不在审核队列或原型会话中。`
              : '正在读取本机原型会话中的采购申请…'
          }
        />
      </div>
    )
  }

  const current = request
  const pending = current.status === '待审核'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '采购审核', href: '/console/purchase-approvals' },
          { label: current.requestNo },
        ]}
      />

      <DetailPageHeader
        backHref="/console/purchase-approvals"
        title={`审核 · ${current.requestNo}`}
        description={`申请人 ${current.applicant} · 分配审核人 ${current.approver}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/purchase-requests/${encodeURIComponent(current.id)}`}>
                打开申请详情
              </LocaleLink>
            </Button>
            {current.convertedPoId ? (
              <Button size="sm" variant="secondary" asChild>
                <LocaleLink href={`/console/purchase-orders/${encodeURIComponent(current.convertedPoId)}`}>
                  查看采购单 {current.convertedPoId}
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertTitle>审阅面板 · 通过即转采购单</AlertTitle>
        <AlertDescription>
          底部仅「通过」与「驳回」。通过后创建 purchase_orders + purchase_order_lines，申请状态变为「已转采购单」。驳回意见必填。申请人不得自审（服务端按 approval_rules 校验，前端仅展示分配审核人）。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        审阅聚焦：申请人、商品明细、数量、报价、供应商、仓库。历史申请与当前库存请从关联申请详情下钻（示例）。
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '明细行数', value: String(current.lines.length) },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          {
            label: '申请数量',
            value: String(current.lines.reduce((sum, line) => sum + line.qty, 0)),
          },
          { label: '提交时间', value: current.submittedAt || '—' },
        ]}
      />

      <DetailFieldGrid
        title="申请摘要"
        description="purchase_requests 表头（只读审阅）"
        fields={[
          { label: '申请单号', value: current.requestNo, mono: true },
          { label: '申请人', value: current.applicant },
          { label: '采购原因', value: current.reason },
          { label: '供应商', value: current.supplier },
          { label: '预计入库仓', value: current.warehouse, mono: true },
          { label: '币种', value: current.currency },
          { label: '期望到货', value: current.expectedAt },
          { label: '分配审核人', value: current.approver },
          { label: '审核意见', value: current.opinion },
          {
            label: '关联采购单',
            value: current.convertedPoId || '（尚未生成）',
            mono: Boolean(current.convertedPoId),
          },
          { label: '申请说明', value: current.remark || '—' },
        ]}
        columns={3}
      />

      <DetailSection title="申请明细" description="purchase_request_lines（审阅只读）">
        {current.lines.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            无明细，不可批准。请驳回或联系申请人补充。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>行号</TableHead>
                <TableHead>内部 SKU</TableHead>
                <TableHead>供应商 SKU</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">单价</TableHead>
                <TableHead className="text-right">金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="tabular-nums">{line.lineNo}</TableCell>
                  <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                  <TableCell className="font-mono text-xs">{line.supplierSku || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.unitPrice} {current.currency}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.amount} {current.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDialog('approve')} disabled={current.lines.length === 0}>
            通过并转采购单
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog('reject')}>
            驳回
          </Button>
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {dialog ? (
        <UedDialog
          title={dialog === 'approve' ? '批准并转采购单' : '驳回申请'}
          description={
            dialog === 'approve'
              ? '将创建采购单主信息与明细，申请标记为「已转采购单」。'
              : '驳回意见必填；申请人可修改后重新提交。'
          }
          fields={[
            {
              key: 'opinion',
              label: '审核意见',
              type: 'textarea',
              required: true,
              fullWidth: true,
              defaultValue: dialog === 'approve' ? '同意转采购单（原型）' : '',
            },
            {
              key: 'approver',
              label: '审核人',
              required: true,
              defaultValue: current.approver.split(' / ')[0] || '杨洁',
            },
          ]}
          onClose={() => setDialog(null)}
          onSave={(values) => {
            if (dialog === 'approve') {
              const result = approveAndConvertPurchaseRequest(requests, orders, current.id, {
                opinion: values.opinion,
                approver: values.approver,
              })
              setDialog(null)
              if (!result.ok) {
                setNotice(result.reason)
                return
              }
              setNotice(
                `已生成采购单 ${result.order.poNo}。正在打开采购单详情…`,
              )
              router.push(`/console/purchase-orders/${encodeURIComponent(result.order.id)}`)
              return
            }
            const result = rejectPurchaseRequest(requests, current.id, {
              opinion: values.opinion,
              approver: values.approver,
            })
            setDialog(null)
            setNotice(result.ok ? `${current.requestNo} 已驳回。` : result.reason)
          }}
          saveLabel={dialog === 'approve' ? '批准并生成采购单' : '确认驳回'}
        />
      ) : null}
    </div>
  )
}
