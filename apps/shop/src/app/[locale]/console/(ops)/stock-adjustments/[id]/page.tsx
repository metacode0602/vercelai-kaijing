'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  StatusTimeline,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import {
  BALANCE_COLUMNS,
  MOVEMENT_COLUMNS,
  buildUedRelatedInfo,
  mapBalanceRows,
  mapMovementRows,
} from '@/lib/console/related-info'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
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
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '已过账') return 'secondary' as const
  return 'outline' as const
}

export default function StockAdjustmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')

  const query = trpc.wms.getAdjustment.useQuery({ id }, { retry: false })
  const adjustment = query.data

  const firstSku = adjustment?.lines[0]?.sku || adjustment?.firstSku
  const balancesQuery = trpc.wms.listBalances.useQuery(
    { page: 1, pageSize: 50, sku: firstSku, warehouse: adjustment?.warehouse },
    { enabled: !!adjustment },
  )
  const movementsQuery = trpc.wms.listMovements.useQuery(
    { page: 1, pageSize: 50, warehouse: adjustment?.warehouse, sku: firstSku },
    { enabled: !!adjustment },
  )

  const invalidate = async () => {
    await Promise.all([
      utils.wms.getAdjustment.invalidate({ id }),
      utils.wms.listAdjustments.invalidate(),
      utils.wms.adjustmentStats.invalidate(),
      utils.wms.listBalances.invalidate(),
      utils.wms.listMovements.invalidate(),
    ])
  }

  const approveMut = trpc.wms.approveAdjustment.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('已审批通过')
    },
    onError: (e) => setNotice(e.message),
  })
  const rejectMut = trpc.wms.rejectAdjustment.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('已驳回')
    },
    onError: (e) => setNotice(e.message),
  })
  const postMut = trpc.wms.postAdjustment.useMutation({
    onSuccess: async () => {
      await invalidate()
      setNotice('已过账写流水')
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/stock-adjustments"
          title="加载中…"
          description="正在从数据库读取调整单…"
        />
      </div>
    )
  }

  if (!adjustment) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/stock-adjustments"
          title="未找到调整单"
          description={query.error?.message ?? `调整单 ${id} 不存在。`}
        />
      </div>
    )
  }

  const lineSkus = new Set(adjustment.lines.map((line) => line.sku))
  const lineBins = new Set(adjustment.lines.map((line) => line.bin))
  const balances = (balancesQuery.data?.items ?? []).filter(
    (item) => lineSkus.has(item.sku) && lineBins.has(item.bin),
  )
  const movements = (movementsQuery.data?.items ?? []).filter(
    (item) =>
      item.sourceId === adjustment.id ||
      item.sourceId === adjustment.adjustmentNo ||
      (lineSkus.has(item.sku) && lineBins.has(item.bin)),
  )

  const related = buildUedRelatedInfo(
    'stock-adjustments',
    {
      id: adjustment.id,
      sku: firstSku,
      warehouse: adjustment.warehouse,
      bin: adjustment.lines[0]?.bin,
      firstSku,
    },
    {
      balances: mapBalanceRows(balances),
      movements: mapMovementRows(movements),
    },
  )
  const parentFields = parentsToFields(related.parents)
  const totalDiff = adjustment.totalDiff

  const timeline = [
    {
      at: adjustment.createdAt,
      status: '待审批',
      note: '创建并进入审批',
      current: adjustment.status === '待审批',
    },
    {
      at: adjustment.approvedAt || '—',
      status: adjustment.status === '已驳回' ? '已驳回' : '已通过',
      note: adjustment.rejectReason || (adjustment.approver ? `审批人 ${adjustment.approver}` : '待审'),
      current: adjustment.status === '已通过' || adjustment.status === '已驳回',
    },
    {
      at: adjustment.postedAt || '—',
      status: '已过账',
      note: '过账写库存流水',
      current: adjustment.status === '已过账',
    },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '盘点与调整', href: '/console/stock-adjustments' },
          { label: adjustment.adjustmentNo },
        ]}
      />
      <DetailPageHeader
        backHref="/console/stock-adjustments"
        title={adjustment.adjustmentNo}
        description={`${adjustment.kind} · ${adjustment.warehouse} · 差异 ${totalDiff > 0 ? '+' : ''}${totalDiff}`}
        badges={
          <>
            <Badge variant="outline">stock_adjustments</Badge>
            <Badge variant={statusVariant(adjustment.status)}>{adjustment.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {adjustment.status === '待审批' ? (
              <>
                <Button
                  size="sm"
                  disabled={approveMut.isPending}
                  onClick={() => approveMut.mutate({ id: adjustment.id })}
                >
                  审批通过
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rejectMut.isPending}
                  onClick={() =>
                    rejectMut.mutate({ id: adjustment.id, rejectReason: '详情驳回：证据不足' })
                  }
                >
                  驳回
                </Button>
              </>
            ) : null}
            {adjustment.status === '已通过' || adjustment.status === '待审批' ? (
              <Button
                size="sm"
                disabled={postMut.isPending}
                onClick={() => postMut.mutate({ id: adjustment.id })}
              >
                确认过账
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/inventory-ledger">库存流水</LocaleLink>
            </Button>
          </div>
        }
      />
      <Alert>
        <AlertTitle>审批后过账才改余额</AlertTitle>
        <AlertDescription>
          状态机：待审批 → 已通过 → 已过账。过账写 inventory_movements，幂等键防重复。原因：
          {adjustment.reason}
          {adjustment.rejectReason ? `；驳回：${adjustment.rejectReason}` : ''}
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '行数', value: String(adjustment.lineCount) },
          { label: '差异合计', value: totalDiff > 0 ? `+${totalDiff}` : String(totalDiff) },
          { label: '类型', value: adjustment.kind },
          { label: '状态', value: adjustment.status },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <DetailFieldGrid
          title="调整单主信息"
          description="stock_adjustments"
          fields={[
            { label: '调整单号', value: adjustment.adjustmentNo, mono: true },
            ...parentFields,
            { label: '类型', value: adjustment.kind },
            { label: '仓库', value: adjustment.warehouse, mono: true },
            { label: '原因', value: adjustment.reason },
            { label: '申请人', value: adjustment.applicant },
            { label: '审批人', value: adjustment.approver || '—' },
            { label: '创建时间', value: adjustment.createdAt },
            { label: '审批时间', value: adjustment.approvedAt || '—' },
            { label: '过账时间', value: adjustment.postedAt || '—' },
            { label: '备注', value: adjustment.remark || '—' },
          ]}
        />
        <StatusTimeline title="调整状态机" steps={timeline} />
      </div>
      <DetailSection title="调整明细" description="stock_adjustment_lines：账面 / 实盘 / 差异">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>行号</TableHead>
                <TableHead>内部 SKU</TableHead>
                <TableHead>库位</TableHead>
                <TableHead className="text-right">账面</TableHead>
                <TableHead className="text-right">实盘</TableHead>
                <TableHead className="text-right">差异</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustment.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.lineNo}</TableCell>
                  <TableCell className="font-mono text-sm">
                    <LocaleLink
                      className="underline-offset-2 hover:underline"
                      href={`/console/master-skus/${encodeURIComponent(line.sku)}`}
                    >
                      {line.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{line.bin}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtySystem}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyCounted}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${line.qtyDiff < 0 ? 'text-destructive' : ''}`}
                  >
                    {line.qtyDiff > 0 ? `+${line.qtyDiff}` : line.qtyDiff}
                  </TableCell>
                  <TableCell>{line.note || '—'}</TableCell>
                </TableRow>
              ))}
              {adjustment.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                    暂无明细行
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </DetailSection>
      <DetailRelatedTables
        sections={
          related.sections?.length
            ? related.sections
            : [
                {
                  title: '相关余额',
                  description: 'wms.listBalances',
                  columns: BALANCE_COLUMNS,
                  rows: mapBalanceRows(balances),
                  emptyText: '暂无关联数据',
                },
                {
                  title: '过账流水',
                  description: 'wms.listMovements',
                  columns: MOVEMENT_COLUMNS,
                  rows: mapMovementRows(movements),
                  emptyText: '暂无关联数据',
                },
              ]
        }
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
