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
  getBalance,
  toRelatedLedgerShape,
  useInventoryBalances,
  useInventoryLedger,
} from '@/lib/crossborder/wms-store'
import { LocaleLink } from '@/lib/i18n/navigation'
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
  if (sourceId.startsWith('OUT')) return `/console/stock-outbounds/${encodeURIComponent(sourceId)}`
  if (sourceId.startsWith('ADJ')) return `/console/stock-adjustments/${encodeURIComponent(sourceId)}`
  if (sourceId.startsWith('AS')) return `/console/aftersales/${encodeURIComponent(sourceId)}`
  return undefined
}

export default function InventoryLedgerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const ledger = useInventoryLedger()
  useInventoryBalances()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const entry = ledger.find((item) => item.id === id)

  if (!entry) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/inventory-ledger"
          title={mounted ? '未找到流水' : '加载中…'}
          description={mounted ? `流水 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo(
    'inventory-ledger',
    toRelatedLedgerShape(entry) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const balance = getBalance(`${entry.warehouse}-${entry.bin}-${entry.sku}`)
  const href = sourceHref(entry.sourceType, entry.sourceId)
  const delta = entry.onHandAfter - entry.onHandBefore

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '库存流水', href: '/console/inventory-ledger' }, { label: entry.id }]}
      />
      <DetailPageHeader
        backHref="/console/inventory-ledger"
        title={entry.id}
        description={`${entry.eventType} · ${entry.sku} · ${entry.bin}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
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
          幂等键 {entry.idempotencyKey}。更正请创建反向流水（manual_adjust）并保留原因与审批。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        本条已记账。账面 {entry.onHandBefore} → {entry.onHandAfter}；预留 {entry.reservedBefore} →{' '}
        {entry.reservedAfter}。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '变动数量', value: delta > 0 ? `+${delta}` : String(delta) },
          { label: '变动后账面', value: String(entry.onHandAfter) },
          { label: '事件类型', value: entry.eventType },
          { label: '方向', value: entry.direction },
        ]}
      />
      <DetailFieldGrid
        title="流水主信息"
        description="inventory_ledger"
        fields={[
          { label: '流水号', value: entry.id, mono: true },
          ...parentFields,
          { label: '仓库', value: entry.warehouse, mono: true },
          { label: '库位', value: entry.bin, mono: true },
          { label: 'SKU', value: entry.sku, mono: true },
          { label: '展示类型', value: entry.type },
          { label: '来源类型', value: entry.sourceType },
          { label: '来源单', value: entry.sourceId, mono: true },
          { label: '来源行', value: entry.sourceLineId || '—' },
          { label: '原因', value: entry.reason || '—' },
          { label: '操作人', value: entry.actor },
          { label: '幂等键', value: entry.idempotencyKey, mono: true },
          { label: '业务时间', value: entry.occurredAt },
        ]}
      />
      <DetailRelatedTables sections={related.sections || []} />
    </div>
  )
}
