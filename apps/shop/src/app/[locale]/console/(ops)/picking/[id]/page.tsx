'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  advancePackage,
  toRelatedPackageShape,
  usePackages,
} from '@/lib/crossborder/order-store'
import { LocaleLink } from '@/lib/i18n/navigation'
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

export default function PickingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const packages = usePackages()
  const pkg = packages.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!pkg) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/picking"
          title={mounted ? '未找到拣货单' : '加载中…'}
          description={mounted ? `拣货单 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo(
    'picking',
    toRelatedPackageShape(pkg) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const canAdvance = pkg.status !== '已出库' && pkg.status !== '已取消'

  function onAdvance() {
    const result = advancePackage(pkg!.id)
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    if (result.package.status === '已出库' && result.outbound) {
      setNotice(
        `已出库 · ${result.outbound.outboundNo} 已过账写流水`,
      )
      return
    }
    setNotice(`已推进至「${result.package.status}」`)
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '拣货打包发货', href: '/console/picking' }, { label: pkg.id }]}
      />
      <DetailPageHeader
        backHref="/console/picking"
        title={pkg.id}
        description={`${pkg.shop} · ${pkg.site} · 订单 ${pkg.order}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={pkg.status === '已出库' ? 'secondary' : 'outline'}>{pkg.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canAdvance ? (
              <Button size="sm" onClick={onAdvance}>
                推进状态
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/orders/${encodeURIComponent(pkg.orderId || pkg.order)}`}>
                查看订单
              </LocaleLink>
            </Button>
            {pkg.outboundId ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/stock-outbounds/${encodeURIComponent(pkg.outboundId)}`}>
                  查看出库单
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />

      <UedPrototypeNotice>
        终态「已出库」调用 wms-store createStockOutbound / postStockOutbound 写「订单出库」流水，禁止直改余额。
      </UedPrototypeNotice>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      <DetailKpiRow
        items={[
          { label: '件数', value: String(pkg.items) },
          { label: '称重', value: pkg.weight },
          { label: '运单号', value: pkg.tracking },
          { label: '拣货人', value: pkg.picker },
        ]}
      />

      <DetailFieldGrid
        title="拣货信息"
        fields={[
          { label: '包裹号', value: pkg.id, mono: true },
          {
            label: '订单',
            mono: true,
            value: (
              <LocaleLink
                href={`/console/orders/${encodeURIComponent(pkg.orderId || pkg.order)}`}
                className="underline-offset-2 hover:underline"
              >
                {pkg.order}
              </LocaleLink>
            ),
          },
          { label: '店铺 / 站点', value: `${pkg.shop} · ${pkg.site}` },
          { label: '仓库', value: pkg.warehouse, mono: true },
          {
            label: '出库单',
            mono: true,
            value: pkg.outboundId ? (
              <LocaleLink
                href={`/console/stock-outbounds/${encodeURIComponent(pkg.outboundId)}`}
                className="underline-offset-2 hover:underline"
              >
                {pkg.outboundId}
              </LocaleLink>
            ) : (
              '—'
            ),
          },
          { label: '备注', value: pkg.remark || '—' },
        ]}
      />

      {parentFields.length ? <DetailFieldGrid title="关联主数据" fields={parentFields} /> : null}

      <DetailSection title="拣货明细" description="SKU / 数量 / 库位">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>内部 SKU</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>库位</TableHead>
              <TableHead>仓库</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pkg.lines.map((line) => (
              <TableRow key={`${line.sku}-${line.bin}`}>
                <TableCell>
                  <LocaleLink
                    href={`/console/master-skus/${line.sku}`}
                    className="font-mono text-xs underline-offset-2 hover:underline"
                  >
                    {line.sku}
                  </LocaleLink>
                </TableCell>
                <TableCell className="tabular-nums">{line.qty}</TableCell>
                <TableCell className="font-mono text-xs">{line.bin}</TableCell>
                <TableCell className="font-mono text-xs">{line.warehouse}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>

      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
