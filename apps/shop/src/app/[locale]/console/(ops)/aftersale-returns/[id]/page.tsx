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
import { toRelatedReturnShape } from '@/lib/crossborder/aftersale-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'

function statusVariant(status: string) {
  if (status === '已报损') return 'destructive' as const
  if (status === '已回库' || status === '部分回库') return 'secondary' as const
  return 'outline' as const
}

export default function AftersaleReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.aftersale.getReturn.useQuery({ id }, { retry: false })
  const row = query.data
  const [notice, setNotice] = React.useState('')
  const [qcPass, setQcPass] = React.useState('')
  const [qcDefect, setQcDefect] = React.useState('')

  const qcMutation = trpc.aftersale.completeQc.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.aftersale.getReturn.invalidate({ id }),
        utils.aftersale.listReturns.invalidate(),
        utils.aftersale.returnStats.invalidate(),
        utils.aftersale.list.invalidate(),
      ])
      setNotice(res.note)
    },
    onError: (e) => setNotice(e.message),
  })

  React.useEffect(() => {
    if (!row) return
    if (row.status === '待质检' || row.status === '质检中') {
      setQcPass(String(row.qcPass || row.qty))
      setQcDefect(String(row.qcDefect || 0))
    }
  }, [row?.id, row?.status, row?.qty, row?.qcPass, row?.qcDefect])

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/aftersale-returns"
          title="加载中…"
          description="正在读取退货单…"
        />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/aftersale-returns"
          title="未找到退货单"
          description={`退货单 ${id} 不存在。`}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('aftersale-returns', toRelatedReturnShape(row as never))
  const parentFields = parentsToFields(related.parents)
  const canQc = row.status === '待质检' || row.status === '质检中'

  const timeline = [
    {
      at: row.receivedAt || '—',
      status: '收货',
      note: row.returnShipmentId ? `${row.returnShipmentId} · ${row.tracking}` : '待收货',
      current: row.status === '待收货确认',
    },
    {
      at: canQc ? '进行中' : row.receivedAt || '—',
      status: '质检',
      note: row.qc,
      current: canQc,
    },
    {
      at: row.restockLedgerId || row.scrapLedgerId ? '已过账' : '—',
      status: '回库 / 报损',
      note:
        row.restock || row.scrap
          ? `回库 ${row.restock} · 报损 ${row.scrap}`
          : '待质检过账',
      current: row.status === '已回库' || row.status === '已报损' || row.status === '部分回库',
    },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '退货收货与质检', href: '/console/aftersale-returns' }, { label: row.id }]}
      />
      <DetailPageHeader
        backHref="/console/aftersale-returns"
        title={row.id}
        description={`${row.shop} · ${row.order} · ${row.sku}`}
        badges={
          <>
            <Badge variant="outline">PostgreSQL</Badge>
            <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/orders/${encodeURIComponent(row.order)}`}>原订单</LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/master-skus/${encodeURIComponent(row.sku)}`}>SKU</LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/inventory-ledger?sku=${encodeURIComponent(row.sku)}`}>
                库存流水
              </LocaleLink>
            </Button>
          </div>
        }
      />
      <Alert>
        <AlertTitle>回库须经库存流水</AlertTitle>
        <AlertDescription>
          合格件写 aftersale_restock、残次写 aftersale_scrap；禁止直改余额。幂等键：ledger:aftersale_restock|scrap:{row.id}
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>{notice || '质检数量合计必须等于实收数量。'}</UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '实收', value: String(row.qty) },
          { label: '合格', value: String(row.qcPass) },
          { label: '残次', value: String(row.qcDefect) },
          { label: '回库 / 报损', value: `${row.restock} / ${row.scrap}` },
        ]}
      />
      <StatusTimeline steps={timeline} />
      <DetailFieldGrid
        title="退货主信息"
        description="reverse_orders + return_shipments + reverse_qc_records"
        fields={[
          { label: '售后单号', value: row.id, mono: true },
          { label: '逆向单 ID', value: row.reverseOrderId, mono: true },
          { label: '平台退货单号', value: row.externalReturnId, mono: true },
          ...parentFields,
          { label: '店铺', value: row.shop },
          { label: '原订单', value: row.order, mono: true },
          { label: '内部 SKU', value: row.sku, mono: true },
          { label: '仓库', value: row.warehouse, mono: true },
          { label: '库位', value: row.bin, mono: true },
          { label: '退货包裹 ID', value: row.returnShipmentId, mono: true },
          { label: '寄回运单', value: row.tracking, mono: true },
          { label: '平台状态', value: row.platformStatus },
          { label: '质检结论', value: row.qcDecision },
          { label: '质检时间', value: row.inspectedAt || '—' },
          { label: '退款单号', value: row.refundId, mono: true },
          { label: '退款状态', value: row.refundStatus },
          { label: '外包装', value: row.packageCondition },
          { label: '回库流水键', value: row.restockLedgerId || '—', mono: true },
          { label: '报损流水键', value: row.scrapLedgerId || '—', mono: true },
          { label: '备注', value: row.remark || '—' },
        ]}
      />
      {canQc ? (
        <DetailSection title="质检过账" description="合格 + 残次 = 实收；过账写 inventory_movements">
          <div className="grid max-w-lg gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="qc-pass">合格数量（回库）</Label>
              <Input
                id="qc-pass"
                type="number"
                min={0}
                value={qcPass}
                onChange={(e) => setQcPass(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qc-defect">残次数量（报损）</Label>
              <Input
                id="qc-defect"
                type="number"
                min={0}
                value={qcDefect}
                onChange={(e) => setQcDefect(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="mt-4"
            disabled={qcMutation.isPending}
            onClick={() => {
              qcMutation.mutate({
                id: row.id,
                qcPass: Number(qcPass),
                qcDefect: Number(qcDefect),
              })
            }}
          >
            {qcMutation.isPending ? '过账中…' : '完成质检并过账'}
          </Button>
        </DetailSection>
      ) : null}
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
