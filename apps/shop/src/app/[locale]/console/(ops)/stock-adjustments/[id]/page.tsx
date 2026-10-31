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
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  approveStockAdjustment,
  cancelStockAdjustment,
  postStockAdjustment,
  rejectStockAdjustment,
  submitStockAdjustment,
  toRelatedAdjustmentShape,
  useInventoryBalances,
  useStockAdjustments,
} from '@/lib/crossborder/wms-store'
import { LocaleLink } from '@/lib/i18n/navigation'
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
  const adjustments = useStockAdjustments()
  useInventoryBalances()
  const adjustment = adjustments.find((item) => item.id === id || item.adjustmentNo === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!adjustment) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/stock-adjustments"
          title={mounted ? '未找到调整单' : '加载中…'}
          description={mounted ? `调整单 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo(
    'stock-adjustments',
    toRelatedAdjustmentShape(adjustment) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const totalDiff = adjustment.lines.reduce((sum, line) => sum + line.qtyDiff, 0)

  const timeline = [
    {
      at: adjustment.createdAt,
      status: '草稿',
      note: '创建调整单',
      current: adjustment.status === '草稿',
    },
    {
      at: adjustment.status === '草稿' ? '—' : adjustment.createdAt,
      status: '待审批',
      note: '提交审批',
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
      note: adjustment.postedLedgerBatchId || '待过账写流水',
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
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(adjustment.status)}>{adjustment.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {adjustment.status === '草稿' ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = submitStockAdjustment(adjustment.id)
                  setNotice(result.ok ? '已提交审批' : result.reason)
                }}
              >
                提交审批
              </Button>
            ) : null}
            {adjustment.status === '待审批' ? (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    const result = approveStockAdjustment(adjustment.id)
                    setNotice(result.ok ? '已通过' : result.reason)
                  }}
                >
                  审批通过
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const result = rejectStockAdjustment(adjustment.id, '详情驳回：证据不足')
                    setNotice(result.ok ? '已驳回' : result.reason)
                  }}
                >
                  驳回
                </Button>
              </>
            ) : null}
            {adjustment.status === '已通过' ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = postStockAdjustment(adjustment.id)
                  setNotice(result.ok ? '已过账写流水' : result.reason)
                }}
              >
                确认过账
              </Button>
            ) : null}
            {adjustment.status === '草稿' || adjustment.status === '待审批' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = cancelStockAdjustment(adjustment.id)
                  setNotice(result.ok ? '已取消' : result.reason)
                }}
              >
                取消
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
          状态机：草稿 → 待审批 → 已通过 → 已过账。过账逐行写 inventory_ledger（盘点差异 /
          手工调整），幂等键防重复。已过账不可取消。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        原因必填：{adjustment.reason}
        {adjustment.rejectReason ? `；驳回原因：${adjustment.rejectReason}` : ''}
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '行数', value: String(adjustment.lines.length) },
          { label: '差异合计', value: totalDiff > 0 ? `+${totalDiff}` : String(totalDiff) },
          { label: '类型', value: adjustment.kind },
          { label: '状态', value: adjustment.status },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <DetailFieldGrid
          title="调整单主信息"
          description="stock_adjustments 头"
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
            { label: '流水批次', value: adjustment.postedLedgerBatchId || '—' },
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
                  <TableCell className="font-mono text-sm">
                    <LocaleLink
                      className="underline-offset-2 hover:underline"
                      href={`/console/warehouse/${encodeURIComponent(line.bin)}`}
                    >
                      {line.bin}
                    </LocaleLink>
                  </TableCell>
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
      <DetailRelatedTables sections={related.sections || []} />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
