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
  BALANCE_COLUMNS,
  buildUedRelatedInfo,
  mapBalanceRows,
} from '@/lib/console/related-info'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function sourceHref(sourceType: string, sourceId: string) {
  if (!sourceId) return undefined
  if (sourceId.startsWith('RCV') || sourceType === 'purchase_receipt') {
    return `/console/purchase-receipts/${encodeURIComponent(sourceId)}`
  }
  if (sourceId.startsWith('PO')) return `/console/purchase-orders/${encodeURIComponent(sourceId)}`
  if (sourceId.startsWith('IN')) return `/console/stock-inbounds/${encodeURIComponent(sourceId)}`
  if (sourceId.startsWith('OUT') || sourceType.includes('outbound')) {
    return `/console/stock-outbounds/${encodeURIComponent(sourceId)}`
  }
  if (sourceId.startsWith('ADJ') || sourceType.includes('adjust')) {
    return `/console/stock-adjustments/${encodeURIComponent(sourceId)}`
  }
  return undefined
}

export default function InventoryLedgerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const movementQuery = trpc.wms.getMovement.useQuery({ id }, { retry: false })
  const entry = movementQuery.data

  const balancesQuery = trpc.wms.listBalances.useQuery(
    { page: 1, pageSize: 20, sku: entry?.sku, warehouse: entry?.warehouse },
    { enabled: !!entry?.sku },
  )

  if (movementQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/inventory-ledger"
          title="加载中…"
          description="正在从数据库读取库存流水…"
        />
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/inventory-ledger"
          title="未找到流水"
          description={movementQuery.error?.message ?? `流水 ${id} 不存在。`}
        />
      </div>
    )
  }

  const balances = (balancesQuery.data?.items ?? []).filter(
    (item) => item.bin === entry.bin && item.sku === entry.sku,
  )
  const related = buildUedRelatedInfo(
    'inventory-ledger',
    {
      id: entry.id,
      sku: entry.sku,
      bin: entry.bin,
      warehouse: entry.warehouse,
      source: entry.sourceId,
      type: entry.type,
    },
    { balances: mapBalanceRows(balances) },
  )
  const parentFields = parentsToFields(related.parents)
  const href = sourceHref(entry.sourceType, entry.sourceId)
  const balance = balances[0]

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '库存流水', href: '/console/inventory-ledger' }, { label: entry.id }]}
      />
      <DetailPageHeader
        backHref="/console/inventory-ledger"
        title={entry.id}
        description={`${entry.type} · ${entry.sku} · ${entry.bin}`}
        badges={
          <>
            <Badge variant="outline">inventory_movements</Badge>
            <Badge variant="secondary">{entry.status}</Badge>
            <Badge variant="outline">{entry.direction}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {href ? (
              <Button size="sm" variant="secondary" asChild>
                <LocaleLink href={href}>查看来源单</LocaleLink>
              </Button>
            ) : null}
            {balance ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/inventory-balances/${encodeURIComponent(balance.id)}`}>
                  当前余额
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />
      <Alert>
        <AlertTitle>追加式流水 · 禁止 UPDATE/DELETE</AlertTitle>
        <AlertDescription>
          幂等键 {entry.idempotencyKey}。更正请创建反向流水并保留原因与审批。变动 {entry.qtyDelta > 0 ? `+${entry.qtyDelta}` : entry.qtyDelta} → 账面 {entry.onHandAfter}。
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '变动数量', value: entry.qtyDelta > 0 ? `+${entry.qtyDelta}` : String(entry.qtyDelta) },
          { label: '变动后账面', value: String(entry.onHandAfter) },
          { label: '事件类型', value: entry.type },
          { label: '方向', value: entry.direction },
        ]}
      />
      <DetailFieldGrid
        title="流水主信息"
        description="inventory_movements"
        fields={[
          { label: '流水号', value: entry.id, mono: true },
          ...parentFields,
          { label: '仓库', value: entry.warehouse, mono: true },
          { label: '库位', value: entry.bin, mono: true },
          { label: 'SKU', value: entry.sku, mono: true },
          { label: '展示类型', value: entry.type },
          { label: '来源类型', value: entry.sourceType },
          { label: '来源单', value: entry.sourceId, mono: true },
          { label: '操作人', value: entry.operator || '—' },
          { label: '幂等键', value: entry.idempotencyKey, mono: true },
          { label: '业务时间', value: entry.occurredAt },
        ]}
      />
      <DetailRelatedTables
        sections={
          related.sections?.length
            ? related.sections
            : [
                {
                  title: '当前余额',
                  description: 'wms.listBalances',
                  columns: BALANCE_COLUMNS,
                  rows: mapBalanceRows(balances),
                  emptyText: '暂无关联数据',
                },
              ]
        }
      />
    </div>
  )
}
