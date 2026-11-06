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
import { UedDialog } from '@/components/console/erp-ued-workspace'
import {
  buildUedRelatedInfo,
  mapBalanceRows,
  mapBinRows,
} from '@/lib/console/related-info'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
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

export default function WarehouseZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [editOpen, setEditOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const zoneQuery = trpc.wms.getZone.useQuery({ id }, { retry: false })
  const row = zoneQuery.data
  const binsQuery = trpc.wms.listBins.useQuery(
    { page: 1, pageSize: 200, warehouse: row?.warehouseCode },
    { enabled: !!row?.warehouseCode },
  )
  const balancesQuery = trpc.wms.listBalances.useQuery(
    { page: 1, pageSize: 100, warehouse: row?.warehouseCode },
    { enabled: !!row?.warehouseCode },
  )

  const updateZone = trpc.wms.updateZone.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.wms.getZone.invalidate({ id }),
        utils.wms.listZones.invalidate(),
        utils.wms.zoneStats.invalidate(),
      ])
      setEditOpen(false)
      setNotice('库区已更新')
    },
    onError: (e) => setNotice(e.message),
  })

  if (zoneQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse-zones"
          title="加载中…"
          description="正在读取库区…"
        />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse-zones"
          title="未找到库区"
          description={`库区 ID ${id} 不存在或已被删除。`}
        />
      </div>
    )
  }

  const zoneBins = (binsQuery.data?.items ?? []).filter(
    (bin) => bin.warehouseCode === row.warehouseCode && bin.zoneCode === row.code,
  )
  const zoneBinCodes = new Set(zoneBins.map((bin) => bin.code))
  const zoneBalances = (balancesQuery.data?.items ?? []).filter((item) => zoneBinCodes.has(item.bin))
  const related = buildUedRelatedInfo(
    'warehouse-zones',
    row as unknown as Record<string, unknown>,
    {
      bins: mapBinRows(zoneBins),
      balances: mapBalanceRows(zoneBalances),
    },
  )
  const parentFields = parentsToFields(related.parents)

  const editor = editOpen ? (
    <UedDialog
      title="编辑库区"
      description="可改名称、用途、状态与备注；编码与所属仓不可改（防历史库位断裂）。"
      fields={[
        { key: 'name', label: '库区名称', required: true, defaultValue: row.name },
        { key: 'purpose', label: '用途', defaultValue: row.purpose },
        {
          key: 'status',
          label: '状态',
          options: ['启用', '停用'],
          required: true,
          defaultValue: row.status,
        },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: row.note },
      ]}
      onClose={() => setEditOpen(false)}
      onSave={(values) => {
        updateZone.mutate({
          id: row.id,
          name: values.name || row.name,
          purpose: values.purpose || '',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
      }}
      saveLabel="保存"
    />
  ) : null

  return (
    <div className="flex w-full flex-col gap-4">
      {editor}
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '库区管理', href: '/console/warehouse-zones' },
          { label: `${row.code} · ${row.name}` },
        ]}
      />
      <DetailPageHeader
        backHref="/console/warehouse-zones"
        title={`${row.code} · ${row.name}`}
        description={`${row.warehouseCode} · ${row.purpose || '未填写用途'}`}
        badges={
          <>
            <Badge variant="outline">wms.zones</Badge>
            <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              编辑库区
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/warehouse">库位管理</LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/inventory-balances">库存余额</LocaleLink>
            </Button>
          </div>
        }
      />
      <DetailKpiRow
        items={[
          { label: '库位数', value: String(zoneBins.length) },
          {
            label: '占用',
            value: String(zoneBins.filter((bin) => bin.status === '占用').length),
          },
          {
            label: '空闲',
            value: String(zoneBins.filter((bin) => bin.status === '空闲').length),
          },
          { label: '状态', value: row.status },
        ]}
      />
      <DetailFieldGrid
        title="库区主信息"
        description="commerce_warehouses.raw.zones + commerce_bins.zone_code"
        fields={[
          { label: '库区 ID', value: row.id, mono: true },
          ...parentFields,
          { label: '仓库', value: row.warehouseCode, mono: true },
          { label: '库区编码', value: row.code, mono: true },
          { label: '名称', value: row.name },
          { label: '用途', value: row.purpose || '—' },
          { label: '状态', value: row.status },
          { label: '备注', value: row.note || '—' },
        ]}
      />
      <DetailSection title="下属库位" description="来自 wms.listBins；一库位一启用 SKU">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>库位</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>绑定 SKU</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zoneBins.map((bin) => (
                <TableRow key={bin.id}>
                  <TableCell className="font-mono text-sm">
                    <LocaleLink
                      className="underline-offset-2 hover:underline"
                      href={`/console/warehouse/${encodeURIComponent(bin.warehouseId)}`}
                    >
                      {bin.code}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{bin.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {bin.boundSku ? (
                      <LocaleLink
                        className="underline-offset-2 hover:underline"
                        href={`/console/master-skus/${encodeURIComponent(bin.boundSku)}`}
                      >
                        {bin.boundSku}
                      </LocaleLink>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{bin.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {zoneBins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    {binsQuery.isLoading
                      ? '加载库位中…'
                      : '本库区暂无库位。请到「库位管理」新增并选择本库区。'}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </DetailSection>
      <DetailRelatedTables
        sections={(related.sections || []).filter((section) => section.title !== '下属库位')}
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
