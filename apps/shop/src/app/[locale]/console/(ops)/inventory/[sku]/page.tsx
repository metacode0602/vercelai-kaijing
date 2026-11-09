'use client'

import * as React from 'react'
import { DetailKpiRow, DetailPageHeader, DetailSection } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import { labelStatus } from '@/lib/console/labels'
import { Button } from '@workspace/ui/components/button'
import { trpc } from '@/lib/trpc/client'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'

export default function InventoryDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const sku = decodeRouteParam(React.use(params).sku)
  const alertQuery = trpc.wms.getInventoryAlertBySku.useQuery({ sku }, { retry: false })
  const balancesQuery = trpc.wms.listBalances.useQuery({ page: 1, pageSize: 100, sku })
  if (alertQuery.isLoading || balancesQuery.isLoading) return <p className="text-sm text-muted-foreground">加载库存…</p>
  const item = alertQuery.data
  const balances = balancesQuery.data?.items ?? []
  if (!item && balances.length === 0) {
    return <div className="space-y-4"><DetailPageHeader backHref="/console/inventory" title="未找到库存" description={`SKU ${sku}`} /></div>
  }
  const title = item?.title ?? balances[0]?.name ?? sku
  const totalOnHand = item?.onHand ?? balances.reduce((s, b) => s + b.onHand, 0)
  const totalReserved = item?.reserved ?? balances.reduce((s, b) => s + b.reserved, 0)
  const totalAvailable = item?.available ?? balances.reduce((s, b) => s + b.available, 0)
  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration items={[{ label: '库存', href: '/console/inventory' }, { label: sku }]} />
      <DetailPageHeader
        backHref="/console/inventory"
        title={`${sku} · 库存`}
        description={title}
        badges={<>
          {item?.alert ? <Badge variant={item.alert === 'critical' ? 'destructive' : 'secondary'}>{labelStatus(item.alert)}</Badge> : <Badge variant="outline">正常</Badge>}
          {item ? <Badge variant="outline">库龄 {item.ageDays}d</Badge> : null}
        </>}
        actions={<LocaleLink href={`/console/products/${sku}`} className="text-sm text-muted-foreground underline-offset-2 hover:underline">查看商品</LocaleLink>}
      />
      <Alert>
        <AlertTitle>库存已接库</AlertTitle>
        <AlertDescription>读 inventory_balances。建议：{item?.suggestion ?? '—'}。禁止 UI 直改余额。</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><LocaleLink href="/console/inventory-ledger">查看库存流水</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/warehouse">仓库与库位</LocaleLink></Button>
      </div>
      <DetailKpiRow items={[
        { label: '在库', value: String(totalOnHand) },
        { label: '预留', value: String(totalReserved) },
        { label: '可用', value: String(totalAvailable) },
        { label: '在途', value: String(item?.inTransit ?? 0) },
        { label: '清关', value: String(item?.customsClearing ?? 0) },
      ]} />
      <DetailSection title="仓库余额" description="按仓+库位">
        {balances.length === 0 ? <p className="text-sm text-muted-foreground">暂无余额行</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>仓库</TableHead><TableHead>库位</TableHead><TableHead>在库</TableHead><TableHead>预留</TableHead>
              <TableHead>可用</TableHead><TableHead>在途</TableHead><TableHead>清关</TableHead><TableHead>状态</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {balances.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>{b.warehouse}</TableCell>
                  <TableCell className="font-mono text-xs">{b.bin || '—'}</TableCell>
                  <TableCell className="tabular-nums">{b.onHand}</TableCell>
                  <TableCell className="tabular-nums">{b.reserved}</TableCell>
                  <TableCell className="tabular-nums">{b.available}</TableCell>
                  <TableCell className="tabular-nums">{b.inTransit}</TableCell>
                  <TableCell className="tabular-nums">{b.customsClearing}</TableCell>
                  <TableCell><Badge variant={b.status === '低库存' ? 'destructive' : 'secondary'}>{b.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>
    </div>
  )
}
