'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import {
  ADJUSTMENT_COLUMNS,
  MOVEMENT_COLUMNS,
  OUTBOUND_COLUMNS,
  buildUedRelatedInfo,
  mapAdjustmentRows,
  mapMovementRows,
  mapOutboundRows,
} from '@/lib/console/related-info'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { useStockAdjustmentDialog } from '@/components/console/stock-adjustment-create-dialog'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function InventoryBalanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const balanceQuery = trpc.wms.getBalance.useQuery({ id }, { retry: false })
  const balance = balanceQuery.data
  const { openWith, dialog, notice: adjustNotice } = useStockAdjustmentDialog()

  const movementsQuery = trpc.wms.listMovements.useQuery(
    { page: 1, pageSize: 50, sku: balance?.sku, warehouse: balance?.warehouse },
    { enabled: !!balance?.sku },
  )
  const outboundsQuery = trpc.wms.listOutbounds.useQuery(
    { page: 1, pageSize: 50 },
    { enabled: !!balance },
  )
  const adjustmentsQuery = trpc.wms.listAdjustments.useQuery(
    { page: 1, pageSize: 50 },
    { enabled: !!balance },
  )

  if (balanceQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/inventory-balances"
          title="加载中…"
          description="正在从数据库读取库存余额…"
        />
      </div>
    )
  }

  if (!balance) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/inventory-balances"
          title="未找到库存余额"
          description={
            balanceQuery.error?.message ??
            `余额 ${id} 不存在。余额随入库上架 / 出库 / 调整过账自动投影。`
          }
        />
      </div>
    )
  }

  const movements = (movementsQuery.data?.items ?? []).filter(
    (item) => item.bin === balance.bin && item.sku === balance.sku,
  )
  const relatedOutbounds = (outboundsQuery.data?.items ?? []).filter(
    (item) => item.sku === balance.sku && (!item.bin || item.bin === balance.bin),
  )
  const relatedAdjustments = (adjustmentsQuery.data?.items ?? []).filter(
    (item) => item.firstSku === balance.sku || item.warehouse === balance.warehouse,
  )

  const related = buildUedRelatedInfo(
    'inventory-balances',
    {
      id: balance.id,
      sku: balance.sku,
      bin: balance.bin,
      warehouse: balance.warehouse,
      name: balance.name,
    },
    {
      movements: mapMovementRows(movements),
      outbounds: mapOutboundRows(relatedOutbounds),
      adjustments: mapAdjustmentRows(relatedAdjustments),
    },
  )
  const parentFields = parentsToFields(related.parents)

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '库存汇总', href: '/console/inventory-balances' },
          { label: balance.sku },
        ]}
      />
      <DetailPageHeader
        backHref="/console/inventory-balances"
        title={balance.sku}
        description={`${balance.name} · ${balance.warehouse} / ${balance.bin}`}
        badges={
          <>
            <Badge variant="outline">inventory_balances</Badge>
            <Badge variant={balance.status === '低库存' ? 'destructive' : 'secondary'}>
              {balance.status}
            </Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" asChild>
              <LocaleLink href={`/console/master-skus/${encodeURIComponent(balance.sku)}`}>
                SKU 主档
              </LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/stock-adjustments">调整列表</LocaleLink>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!balance}
              onClick={() =>
                openWith({
                  sku: balance.sku,
                  warehouse: balance.warehouse,
                  bin: balance.bin,
                  qtySystem: balance.onHand,
                })
              }
            >
              发起调整
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <LocaleLink href={`/console/warehouse/${encodeURIComponent(balance.warehouse)}`}>
                打开仓库
              </LocaleLink>
            </Button>
          </div>
        }
      />
      <Alert>
        <AlertTitle>余额只读 · 流水驱动</AlertTitle>
        <AlertDescription>
          禁止直接改余额。修正请走调整单（审批后过账）或反向流水。乐观锁 version={balance.version}。
          可用 {balance.available} = 实物 {balance.onHand} − 预留 {balance.reserved} − 质检{' '}
          {balance.qcHold} − 残次 {balance.damaged}。在途 {balance.inTransit} 不计入可用。
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '实物', value: String(balance.onHand) },
          { label: '预留', value: String(balance.reserved) },
          { label: '可用', value: String(balance.available) },
          { label: '安全库存', value: String(balance.threshold) },
        ]}
      />
      <DetailFieldGrid
        title="余额主信息"
        description="inventory_balances · UNIQUE(org, warehouse, bin, variant)"
        fields={[
          { label: '余额 ID', value: balance.id, mono: true },
          ...parentFields,
          { label: '仓库', value: balance.warehouse, mono: true },
          { label: '库位', value: balance.bin, mono: true },
          { label: '内部 SKU', value: balance.sku, mono: true },
          { label: '商品', value: balance.name },
          { label: '质检占用', value: String(balance.qcHold) },
          { label: '残次', value: String(balance.damaged) },
          { label: '在途', value: String(balance.inTransit) },
          { label: '版本', value: String(balance.version) },
          { label: '更新时间', value: balance.updatedAt },
        ]}
      />
      <DetailRelatedTables
        sections={
          related.sections?.length
            ? related.sections
            : [
                {
                  title: '库存流水',
                  description: 'wms.listMovements',
                  columns: MOVEMENT_COLUMNS,
                  rows: mapMovementRows(movements),
                  emptyText: '暂无关联数据',
                },
                {
                  title: '相关出库单',
                  description: 'wms.listOutbounds',
                  columns: OUTBOUND_COLUMNS,
                  rows: mapOutboundRows(relatedOutbounds),
                  emptyText: '暂无关联数据',
                },
                {
                  title: '相关调整单',
                  description: 'wms.listAdjustments',
                  columns: ADJUSTMENT_COLUMNS,
                  rows: mapAdjustmentRows(relatedAdjustments),
                  emptyText: '暂无关联数据',
                },
              ]
        }
      />
      {dialog}
      {adjustNotice ? <p role="status" className="text-sm text-muted-foreground">{adjustNotice}</p> : null}
    </div>
  )
}
