'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import {
  addPurchaseRequestLine,
  cancelPurchaseRequest,
  submitPurchaseRequest,
  updatePurchaseRequestHeader,
  usePurchaseRequests,
  withdrawPurchaseRequest,
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

const SKU_OPTIONS = ['HSY000001001', 'HSY000001002', 'HSY000002001']
const SUPPLIER_OPTIONS = ['厦门优品服饰有限公司', '泉州联创数码配件厂']
const WAREHOUSE_OPTIONS = ['WH-CN-XMN-001']
const REASON_OPTIONS = ['备货', '补货', '订单采购']

function statusVariant(status: string) {
  if (status === '待审核') return 'outline' as const
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '已转采购单' || status === '已批准') return 'secondary' as const
  return 'outline' as const
}

export default function PurchaseRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const requests = usePurchaseRequests()
  const request = requests.find((item) => item.id === id)
  const router = useLocaleRouter()

  const [lineOpen, setLineOpen] = React.useState(false)
  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!request) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/purchase-requests"
          title={mounted ? '未找到采购申请' : '加载采购申请…'}
          description={
            mounted
              ? `申请 ${id} 不存在，或仅存在于其他浏览器会话的示例数据中。`
              : '正在读取本机原型会话中的采购申请…'
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或新建申请主信息后再添加明细。
        </p>
      </div>
    )
  }

  const current = request
  const canEdit =
    current.status === '草稿' || current.status === '已驳回'
  const canSubmit = canEdit
  const canWithdraw = current.status === '待审核'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[
          { label: '采购申请', href: '/console/purchase-requests' },
          { label: current.requestNo },
        ]}
      />

      <DetailPageHeader
        backHref="/console/purchase-requests"
        title={current.requestNo}
        description={`采购申请主信息 · ${current.supplier} · 申请人 ${current.applicant}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setHeaderOpen(true)}>
                编辑主信息
              </Button>
            ) : null}
            {canEdit ? (
              <Button size="sm" onClick={() => setLineOpen(true)}>
                添加申请明细
              </Button>
            ) : null}
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
        <AlertTitle>两步创建 · 对齐 purchase_requests / purchase_request_lines</AlertTitle>
        <AlertDescription>
          上方主信息对应表头；下方明细对应行表。新建时先保存主信息，再在本页追加具体申请信息。提交审核且正式批准后，才会生成
          purchase_orders + purchase_order_lines（不会在申请创建时直接建采购单）。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        {current.lines.length === 0
          ? '当前尚无申请明细。请点击「添加申请明细」写入 purchase_request_lines（variant_id / qty / unit_price）。无明细不可提交审核。'
          : current.status === '待审核'
            ? '已提交审核。可在「采购审核」通过或驳回；通过后系统生成正式采购单并将本单标记为「已转采购单」。'
            : current.status === '已转采购单'
              ? `本申请已转换为采购单 ${current.convertedPoId || '—'}；申请行不可再改。`
              : '明细行金额汇总写入主信息 total_amount；提交后进入审批队列。'}
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '明细行数', value: String(current.lines.length) },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          {
            label: '申请数量',
            value: String(current.lines.reduce((sum, line) => sum + line.qty, 0)),
          },
          { label: '分配审核人', value: current.approver },
        ]}
      />

      <DetailFieldGrid
        title="主信息"
        description="purchase_requests：供应商、仓库、币种、期望到货、原因等表头字段"
        fields={[
          { label: '申请单号', value: current.requestNo, mono: true },
          { label: '申请人', value: current.applicant },
          { label: '采购原因', value: current.reason },
          { label: '供应商', value: current.supplier },
          { label: '预计入库仓', value: current.warehouse, mono: true },
          { label: '币种', value: current.currency },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          { label: '期望到货', value: current.expectedAt },
          { label: '创建日期', value: current.createdAt },
          { label: '提交时间', value: current.submittedAt || '—' },
          { label: '审核人', value: current.approver },
          { label: '审核意见', value: current.opinion },
          {
            label: '关联采购单',
            value: current.convertedPoId ? (
              <LocaleLink
                href={`/console/purchase-orders/${encodeURIComponent(current.convertedPoId)}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {current.convertedPoId}
              </LocaleLink>
            ) : (
              '—'
            ),
          },
          { label: '申请说明', value: current.remark || '—' },
          {
            label: '状态',
            value: <Badge variant={statusVariant(current.status)}>{current.status}</Badge>,
          },
        ]}
        columns={3}
        action={
          canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setHeaderOpen(true)}>
              编辑
            </Button>
          ) : null
        }
      />

      <DetailSection
        title="申请明细"
        description="purchase_request_lines：内部 SKU、数量、报价单价与金额"
        action={
          canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setLineOpen(true)}>
              添加申请明细
            </Button>
          ) : null
        }
      >
        {current.lines.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-sm text-muted-foreground">
              主信息已保存，明细为空。第二步在此添加具体申请信息，无需回到列表重填表头。无明细时不可提交审核。
            </p>
            {canEdit ? (
              <Button size="sm" onClick={() => setLineOpen(true)}>
                添加第一条明细
              </Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>行号</TableHead>
                <TableHead>内部 SKU</TableHead>
                <TableHead>供应商 SKU</TableHead>
                <TableHead className="text-right">申请数量</TableHead>
                <TableHead className="text-right">单价</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>行备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="tabular-nums">{line.lineNo}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/master-skus/${encodeURIComponent(line.sku)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {line.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{line.supplierSku || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.unitPrice} {current.currency}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.amount} {current.currency}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.remark || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

      <div className="flex flex-wrap gap-2">
        {canSubmit ? (
          <Button
            size="sm"
            onClick={() => {
              const result = submitPurchaseRequest(requests, current.id)
              if (!result.ok) {
                setNotice(result.reason)
                return
              }
              setNotice(`${current.requestNo} 已提交审核，进入「采购审核」队列（原型会话）。`)
            }}
          >
            提交审核
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              withdrawPurchaseRequest(requests, current.id)
              setNotice(`${current.requestNo} 已撤回为草稿。`)
            }}
          >
            撤回申请
          </Button>
        ) : null}
        {current.status === '待审核' ? (
          <Button size="sm" variant="secondary" onClick={() => router.push('/console/purchase-approvals')}>
            前往采购审核
          </Button>
        ) : null}
        {canEdit || current.status === '待审核' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              cancelPurchaseRequest(requests, current.id)
              setNotice(`${current.requestNo} 已取消。`)
            }}
          >
            取消申请
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {headerOpen ? (
        <UedDialog
          title="编辑主信息"
          description="仅修改 purchase_requests 表头字段；明细行在下方单独维护。"
          fields={[
            {
              key: 'reason',
              label: '采购原因',
              options: REASON_OPTIONS,
              defaultValue: current.reason,
              required: true,
            },
            {
              key: 'supplier',
              label: '供应商',
              options: SUPPLIER_OPTIONS,
              defaultValue: current.supplier,
              required: true,
            },
            {
              key: 'warehouse',
              label: '预计入库仓',
              options: WAREHOUSE_OPTIONS,
              defaultValue: current.warehouse,
              required: true,
            },
            {
              key: 'currency',
              label: '币种',
              options: ['CNY', 'USD'],
              defaultValue: current.currency,
              required: true,
            },
            {
              key: 'expectedAt',
              label: '期望到货',
              type: 'date',
              defaultValue: current.expectedAt,
              required: true,
            },
            {
              key: 'remark',
              label: '申请说明',
              type: 'textarea',
              fullWidth: true,
              defaultValue: current.remark,
            },
          ]}
          initialValues={{
            reason: current.reason,
            supplier: current.supplier,
            warehouse: current.warehouse,
            currency: current.currency,
            expectedAt: current.expectedAt,
            remark: current.remark,
          }}
          onClose={() => setHeaderOpen(false)}
          onSave={(values) => {
            updatePurchaseRequestHeader(requests, current.id, {
              reason: values.reason || current.reason,
              supplier: values.supplier || current.supplier,
              warehouse: values.warehouse || current.warehouse,
              currency: values.currency || current.currency,
              expectedAt: values.expectedAt || current.expectedAt,
              remark: values.remark ?? current.remark,
            })
            setHeaderOpen(false)
            setNotice('主信息已更新（原型会话，未写入数据库）。')
          }}
          saveLabel="保存主信息"
        />
      ) : null}

      {lineOpen ? (
        <UedDialog
          title="添加申请明细"
          description="写入 purchase_request_lines：variant_id、qty、unit_price；金额自动计算。"
          fields={[
            { key: 'sku', label: '内部 SKU', options: SKU_OPTIONS, required: true, helper: '对应 variant_id' },
            {
              key: 'supplierSku',
              label: '供应商 SKU',
              placeholder: '可空，对应 supplier_sku_id',
            },
            {
              key: 'qty',
              label: '申请数量',
              type: 'number',
              required: true,
              defaultValue: '1',
              helper: '对应 qty',
            },
            {
              key: 'unitPrice',
              label: '采购单价',
              type: 'number',
              required: true,
              defaultValue: '28',
              helper: '对应 unit_price',
            },
            {
              key: 'remark',
              label: '行备注',
              type: 'textarea',
              fullWidth: true,
            },
          ]}
          onClose={() => setLineOpen(false)}
          onSave={(values) => {
            const updated = addPurchaseRequestLine(requests, current.id, {
              sku: values.sku || SKU_OPTIONS[0]!,
              supplierSku: values.supplierSku,
              qty: Number(values.qty || 1),
              unitPrice: Number(values.unitPrice || 0),
              remark: values.remark,
            })
            setLineOpen(false)
            setNotice(
              updated
                ? `已添加明细行 #${updated.lines.length}（${values.sku} × ${values.qty}），合计 ${updated.totalAmount} ${updated.currency}。`
                : '当前状态不可添加明细（仅草稿/已驳回可编辑）。',
            )
          }}
          saveLabel="保存明细行"
        />
      ) : null}
    </div>
  )
}
