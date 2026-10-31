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
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  listLedgerForBin,
  toRelatedBalanceShape,
  useInventoryBalances,
  useInventoryLedger,
  useStockAdjustments,
  useStockOutbounds,
} from '@/lib/crossborder/wms-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function InventoryBalanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const balances = useInventoryBalances()
  useInventoryLedger()
  const outbounds = useStockOutbounds()
  const adjustments = useStockAdjustments()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const balance = balances.find((item) => item.id === id)

  if (!balance) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/inventory-balances"
          title={mounted ? '未找到库存余额' : '加载中…'}
          description={
            mounted
              ? `余额 ${id} 不存在。余额随入库上架 / 出库 / 调整过账自动投影。`
              : '正在读取本机原型会话…'
          }
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo(
    'inventory-balances',
    toRelatedBalanceShape(balance) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const ledger = listLedgerForBin(balance.warehouse, balance.bin).filter((item) => item.sku === balance.sku)
  const relatedOutbounds = outbounds.filter((item) =>
    item.lines.some((line) => line.sku === balance.sku && line.bin === balance.bin),
  )
  const relatedAdjustments = adjustments.filter((item) =>
    item.lines.some((line) => line.sku === balance.sku && line.bin === balance.bin),
  )

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
            <Badge variant="outline">示例数据</Badge>
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
              <LocaleLink href="/console/stock-adjustments">发起调整</LocaleLink>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <LocaleLink href={`/console/warehouse/${encodeURIComponent(balance.bin)}`}>
                打开库位
              </LocaleLink>
            </Button>
          </div>
        }
      />
      <Alert>
        <AlertTitle>余额只读 · 流水驱动</AlertTitle>
        <AlertDescription>
          禁止直接改余额。修正请走调整单（审批后过账）或反向流水。乐观锁 version={balance.version}。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        可用 {balance.available} = 实物 {balance.onHand} − 预留 {balance.reserved} − 质检{' '}
        {balance.qcHold} − 残次 {balance.damaged}。在途 {balance.inTransit} 不计入可用。
      </UedPrototypeNotice>
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
        sections={[
          ...(related.sections || []),
          {
            title: '库存流水',
            description: '本仓位 SKU 的追加流水',
            columns: [
              { key: 'id', label: '流水号', mono: true, hrefKey: 'href' },
              { key: 'type', label: '类型' },
              { key: 'before', label: '变动前', numeric: true },
              { key: 'after', label: '变动后', numeric: true },
              { key: 'source', label: '来源单', mono: true },
              { key: 'at', label: '时间' },
            ],
            rows: ledger.map((item) => ({
              id: item.id,
              type: item.type,
              before: item.onHandBefore,
              after: item.onHandAfter,
              source: item.sourceId,
              at: item.occurredAt,
              href: `/console/inventory-ledger/${encodeURIComponent(item.id)}`,
            })),
            emptyText: '暂无流水',
          },
          {
            title: '相关出库单',
            description: '同库位 SKU 出库作业',
            columns: [
              { key: 'id', label: '出库单', mono: true, hrefKey: 'href' },
              { key: 'order', label: '订单' },
              { key: 'status', label: '状态' },
            ],
            rows: relatedOutbounds.map((item) => ({
              id: item.outboundNo,
              order: item.order,
              status: item.status,
              href: `/console/stock-outbounds/${encodeURIComponent(item.id)}`,
            })),
            emptyText: '暂无出库单',
          },
          {
            title: '相关调整单',
            description: '同库位 SKU 盘点 / 调整',
            columns: [
              { key: 'id', label: '调整单', mono: true, hrefKey: 'href' },
              { key: 'kind', label: '类型' },
              { key: 'status', label: '状态' },
            ],
            rows: relatedAdjustments.map((item) => ({
              id: item.adjustmentNo,
              kind: item.kind,
              status: item.status,
              href: `/console/stock-adjustments/${encodeURIComponent(item.id)}`,
            })),
            emptyText: '暂无调整单',
          },
        ]}
      />
    </div>
  )
}
