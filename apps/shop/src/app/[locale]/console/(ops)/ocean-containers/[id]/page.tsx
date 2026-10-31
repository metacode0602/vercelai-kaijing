'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { advanceOceanLotStatus, useOceanLots } from '@/lib/crossborder/ocean-container-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'

export default function OceanContainerDetailPage() {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params.id)
  const lots = useOceanLots()
  const lot = lots.find((item) => item.id === id)
  const [notice, setNotice] = React.useState('')

  if (!lot) {
    return (
      <div className="space-y-3">
        <p>未找到柜次 {id}</p>
        <Button asChild variant="outline">
          <LocaleLink href="/console/ocean-containers">返回列表</LocaleLink>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{lot.lotCode}</h1>
          <p className="text-sm text-muted-foreground">
            {lot.containerType} · {lot.containerNo} · {lot.originPort} → {lot.destPort} → {lot.warehouse}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{lot.status}</Badge>
          <Button asChild variant="outline" size="sm">
            <LocaleLink href="/console/ocean-containers">返回</LocaleLink>
          </Button>
          <Button
            size="sm"
            disabled={lot.status === '已入本地仓' || lot.status === '已取消'}
            onClick={() => {
              advanceOceanLotStatus(lot.id)
              setNotice('状态已推进（原型）')
            }}
          >
            推进状态
          </Button>
        </div>
      </div>
      <DetailKpiRow
        items={[
          { label: 'ETA 港', value: lot.etaPort },
          { label: 'ETA 仓', value: lot.etaWarehouse },
          { label: '平台', value: lot.platform },
          { label: '行数', value: String(lot.lines.length) },
        ]}
      />
      <UedPrototypeNotice>
        柜次行驱动库存桶：在途→清关中→本地仓可用/残次。关联 F32 成本版本可在成本页按柜次保存。
      </UedPrototypeNotice>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>发运</TableHead>
              <TableHead>实收</TableHead>
              <TableHead>残次</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lot.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.sku}</TableCell>
                <TableCell>{line.name}</TableCell>
                <TableCell className="tabular-nums">{line.qtyShipped}</TableCell>
                <TableCell className="tabular-nums">{line.qtyReceived}</TableCell>
                <TableCell className="tabular-nums">{line.qtyDamaged}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">{lot.notes}</p>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
