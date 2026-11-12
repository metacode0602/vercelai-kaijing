'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
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
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'

function ShipmentPricingSuggestionList() {
  const searchParams = useSearchParams()
  const shipmentId = searchParams.get('shipmentId') || ''
  const platform = (searchParams.get('platform') || 'daraz').toLowerCase()
  const country = (searchParams.get('country') || 'LK').toUpperCase()
  const query = trpc.pricing.listByShipment.useQuery(
    { shipmentId, platform, country },
    { enabled: Boolean(shipmentId), retry: false },
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">柜次 SKU 定价建议</h2>
          <p className="text-sm text-muted-foreground">
            仅列出本柜次已写入 sku_costs 的 SKU。点击一行打开定价计算器查看明细；本页不会一键改写刊登售价。
            费用来自本组织费用模板，不是平台实时同步。
          </p>
        </div>
        <Button variant="outline" asChild>
          <LocaleLink href={shipmentId ? `/console/ocean-containers/${encodeURIComponent(shipmentId)}` : '/console/ocean-containers'}>
            返回柜次
          </LocaleLink>
        </Button>
      </div>

      {!shipmentId ? (
        <p className="text-sm text-muted-foreground">请从柜次成本保存成功后的「查看这些 SKU 的定价建议」进入。</p>
      ) : query.isLoading ? (
        <p className="text-sm text-muted-foreground">正在测算本柜次 SKU 建议价…</p>
      ) : query.error ? (
        <p className="text-sm text-destructive">{query.error.message}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            柜次 {query.data?.lotCode || shipmentId} · {query.data?.platform} {query.data?.country} · {query.data?.items.length ?? 0} 个 SKU
          </p>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>本平台建议价</TableHead>
                  <TableHead>缺项</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.items ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      本柜次还没有写入 sku_costs 的 SKU。
                    </TableCell>
                  </TableRow>
                ) : (
                  (query.data?.items ?? []).map((item) => (
                    <TableRow key={item.sku} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <LocaleLink
                          href={`/console/costs/calculator?sku=${encodeURIComponent(item.sku)}&platform=${encodeURIComponent(platform)}&country=${encodeURIComponent(country)}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {item.sku}
                        </LocaleLink>
                      </TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {item.suggestedRetail == null ? '—' : `${item.suggestedRetail.toFixed(2)} ${item.currency}`}
                        {item.isEstimate ? (
                          <Badge variant="secondary" className="ml-2">
                            估算
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-amber-800">
                        {item.gaps.length
                          ? item.gaps.map((gap) => gap.labelZh).join('、')
                          : item.error || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ShipmentPricingSuggestionsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">加载柜次定价建议…</p>}>
      <ShipmentPricingSuggestionList />
    </Suspense>
  )
}
