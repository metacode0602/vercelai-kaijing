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
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
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

const REASON_OPTIONS = ['备货', '补货', '订单采购']

function statusVariant(status: string) {
  if (status === '待审核') return 'outline' as const
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '已转采购单' || status === '已批准') return 'secondary' as const
  return 'outline' as const
}

export default function PurchaseRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [lineOpen, setLineOpen] = React.useState(false)
  const [lineSku, setLineSku] = React.useState('')
  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [confirmAction, setConfirmAction] = React.useState<'submit' | 'withdraw' | null>(null)
  const [notice, setNotice] = React.useState('')

  const detailQuery = trpc.purchase.getRequest.useQuery({ id })
  const suppliersMeta = trpc.suppliers.meta.useQuery(undefined, { enabled: headerOpen })
  const warehousesQuery = trpc.wms.listWarehouses.useQuery(
    { page: 1, pageSize: 100, status: '启用' },
    { enabled: headerOpen },
  )
  const skuCodesQuery = trpc.purchase.listSkuCodes.useQuery()
  const skuOptions = skuCodesQuery.data?.length ? skuCodesQuery.data : ['HSY000001001']
  const preferredSku = lineSku || skuOptions[0] || 'HSY000001001'
  const preferredQuery = trpc.suppliers.preferredForSku.useQuery(
    { sku: preferredSku },
    { enabled: lineOpen && Boolean(preferredSku) },
  )

  const invalidate = async () => {
    await utils.purchase.getRequest.invalidate({ id })
    await utils.purchase.listRequests.invalidate()
    await utils.purchase.requestStats.invalidate()
  }

  const updateMutation = trpc.purchase.updateRequest.useMutation({
    onSuccess: async () => {
      await invalidate()
      setHeaderOpen(false)
      setNotice('主信息已写入数据库。')
    },
    onError: (error) => setNotice(error.message),
  })
  const addLineMutation = trpc.purchase.addRequestLine.useMutation({
    onSuccess: async (updated) => {
      await invalidate()
      setLineOpen(false)
      setNotice(
        `已添加明细行 #${updated.lines.length}，合计 ${updated.totalAmount} ${updated.currency}。`,
      )
    },
    onError: (error) => setNotice(error.message),
  })
  const submitMutation = trpc.purchase.submitRequest.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`${row.requestNo} 已提交审核。`)
    },
    onError: (error) => setNotice(error.message),
  })
  const withdrawMutation = trpc.purchase.withdrawRequest.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`${row.requestNo} 已撤回为草稿。`)
    },
    onError: (error) => setNotice(error.message),
  })
  const cancelMutation = trpc.purchase.cancelRequest.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`${row.requestNo} 已取消。`)
    },
    onError: (error) => setNotice(error.message),
  })

  if (detailQuery.isLoading) {
    return (
      <DetailPageHeader
        backHref="/console/purchase-requests"
        title="加载采购申请…"
        description="正在从数据库读取…"
      />
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/purchase-requests"
          title="未找到采购申请"
          description={detailQuery.error?.message || `申请 ${id} 不存在。`}
        />
      </div>
    )
  }

  const current = detailQuery.data
  const canEdit = current.status === '草稿' || current.status === '已驳回'
  const canSubmit = canEdit
  const canWithdraw = current.status === '待审核'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
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
            <Badge variant="outline">数据库</Badge>
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
              <Button size="sm" onClick={() => { setLineSku(skuOptions[0] || ''); setLineOpen(true) }}>
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
          主信息与明细经 tRPC 写入 PostgreSQL。提交审核且正式批准后，才会生成 purchase_orders。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        {current.lines.length === 0
          ? '当前尚无申请明细。请添加明细后再提交审核。'
          : current.status === '待审核'
            ? '已提交审核。可在「采购审核」通过或驳回。'
            : current.status === '已转采购单'
              ? `本申请已转换为采购单 ${current.convertedPoId || '—'}。`
              : '明细行金额会汇总到主信息。'}
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '明细行数', value: String(current.lines.length) },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          {
            label: '申请数量',
            value: String(current.lines.reduce((sum, line) => sum + line.qty, 0)),
          },
          { label: '分配审核人', value: current.approver || '—' },
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
          { label: '审核人', value: current.approver || '—' },
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
            <Button size="sm" variant="outline" onClick={() => { setLineSku(skuOptions[0] || ''); setLineOpen(true) }}>
              添加申请明细
            </Button>
          ) : null
        }
      >
        {current.lines.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6">
            <p className="text-sm text-muted-foreground">
              主信息已保存，明细为空。无明细时不可提交审核。
            </p>
            {canEdit ? (
              <Button size="sm" onClick={() => { setLineSku(skuOptions[0] || ''); setLineOpen(true) }}>
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
            disabled={submitMutation.isPending}
            onClick={() => setConfirmAction('submit')}
          >
            提交审核
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button
            size="sm"
            variant="outline"
            disabled={withdrawMutation.isPending}
            onClick={() => setConfirmAction('withdraw')}
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
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({ id: current.id })}
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

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'submit' ? '确认提交审核？' : '确认撤回申请？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'submit'
                ? `${current.requestNo} 提交后将进入「采购审核」，审核期间不可修改主信息与明细。`
                : `${current.requestNo} 撤回后将回到草稿状态，可修改后重新提交审核。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitMutation.isPending || withdrawMutation.isPending}
              onClick={() => {
                if (confirmAction === 'submit') submitMutation.mutate({ id: current.id })
                if (confirmAction === 'withdraw') withdrawMutation.mutate({ id: current.id })
                setConfirmAction(null)
              }}
            >
              {confirmAction === 'submit' ? '确认提交' : '确认撤回'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {headerOpen ? (
        <UedDialog
          title="编辑主信息"
          description="仅修改 purchase_requests 表头字段；明细行在下方单独维护。"
          fields={[
            { key: 'reason', label: '采购原因', options: REASON_OPTIONS, defaultValue: current.reason, required: true },
            {
              key: 'supplier',
              label: '供应商',
              options: (() => {
                const names = (suppliersMeta.data?.suppliers ?? []).map((row) => row.name)
                if (current.supplier && !names.includes(current.supplier)) names.unshift(current.supplier)
                return names
              })(),
              searchable: true,
              defaultValue: current.supplier,
              required: true,
              placeholder: '输入名称模糊搜索供应商',
              helper: '仅启用供应商可选；当前值若不在启用列表中仍可保留',
            },
            {
              key: 'warehouse',
              label: '预计入库仓',
              options: (() => {
                const codes = (warehousesQuery.data?.items ?? []).map((row) => row.code)
                if (current.warehouse && !codes.includes(current.warehouse)) codes.unshift(current.warehouse)
                return codes
              })(),
              searchable: true,
              defaultValue: current.warehouse,
              required: true,
              placeholder: '输入仓编码模糊搜索',
            },
            { key: 'currency', label: '币种', options: ['CNY', 'USD'], defaultValue: current.currency, required: true },
            { key: 'expectedAt', label: '期望到货', type: 'date', defaultValue: current.expectedAt, required: true },
            { key: 'remark', label: '申请说明', type: 'textarea', fullWidth: true, defaultValue: current.remark },
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
            updateMutation.mutate({
              id: current.id,
              reason: values.reason || current.reason,
              supplier: values.supplier || current.supplier,
              warehouse: values.warehouse || current.warehouse,
              currency: values.currency || current.currency,
              expectedAt: values.expectedAt || current.expectedAt,
              remark: values.remark ?? current.remark,
            })
          }}
          saveLabel="保存主信息"
        />
      ) : null}

      {lineOpen ? (
        <UedDialog
          title="添加申请明细"
          description="写入 purchase_request_lines：variant_id、qty、unit_price；金额自动计算。"
          fields={[
            { key: 'sku', label: '内部 SKU', options: skuOptions, required: true, helper: '对应 product_variants；选中后自动带首选供货价/交期', defaultValue: preferredSku },
            {
              key: 'supplierSku',
              label: '供应商 SKU',
              placeholder: preferredQuery.data?.factoryCode || '可空',
              defaultValue: preferredQuery.data?.factoryCode || '',
              helper: preferredQuery.data
                ? `首选：${preferredQuery.data.supplier} · 交期 ${preferredQuery.data.leadDays} 天 · MOQ ${preferredQuery.data.moq}`
                : '无首选供应商货号时可手填',
            },
            { key: 'qty', label: '申请数量', type: 'number', required: true, defaultValue: preferredQuery.data ? String(preferredQuery.data.moq || 1) : '1' },
            {
              key: 'unitPrice',
              label: '采购单价',
              type: 'number',
              required: true,
              defaultValue: preferredQuery.data ? String(preferredQuery.data.price) : '0',
              helper: preferredQuery.data
                ? `来自 suppliers.preferredForSku · ${preferredQuery.data.currency}`
                : '无参考价时请手填',
            },
            { key: 'remark', label: '行备注', type: 'textarea', fullWidth: true, defaultValue: preferredQuery.data ? `交期约 ${preferredQuery.data.leadDays} 天` : '' },
          ]}
          onClose={() => setLineOpen(false)}
          onSave={(values) => {
            const sku = values.sku || skuOptions[0]!
            setLineSku(sku)
            addLineMutation.mutate({
              requestId: current.id,
              sku,
              supplierSku: values.supplierSku || preferredQuery.data?.factoryCode,
              qty: Number(values.qty || preferredQuery.data?.moq || 1),
              unitPrice: Number(values.unitPrice || preferredQuery.data?.price || 0),
              remark: values.remark,
            })
          }}
          saveLabel="保存明细行"
        />
      ) : null}
    </div>
  )
}
