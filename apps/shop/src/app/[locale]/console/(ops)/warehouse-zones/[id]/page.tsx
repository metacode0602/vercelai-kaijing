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
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import { useBins } from '@/lib/crossborder/wms-store'
import {
  updateWarehouseZone,
  useWarehouseZones,
} from '@/lib/crossborder/warehouse-zone-store'
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

export default function WarehouseZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useWarehouseZones()
  const bins = useBins()
  const row = rows.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse-zones"
          title={mounted ? '未找到库区' : '加载中…'}
          description={mounted ? `库区 ID ${id} 不存在或已被删除。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const zoneBins = bins.filter(
    (bin) => bin.warehouseCode === row.warehouseCode && bin.zoneCode === row.code,
  )
  const related = buildUedRelatedInfo('warehouse-zones', row as unknown as Record<string, unknown>)
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
        updateWarehouseZone(rows, row.id, {
          name: values.name || row.name,
          purpose: values.purpose || row.purpose,
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
        setEditOpen(false)
        setNotice('库区已更新')
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
        description={`${row.warehouseCode} · ${row.purpose}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
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
      <UedPrototypeNotice>
        停用后新建库位不再可选本库区；已挂库位保留，需单独迁出或停用库位。
      </UedPrototypeNotice>
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
        description="warehouse_zones"
        fields={[
          { label: '库区 ID', value: row.id, mono: true },
          ...parentFields,
          { label: '仓库', value: row.warehouseCode, mono: true },
          { label: '库区编码', value: row.code, mono: true },
          { label: '名称', value: row.name },
          { label: '用途', value: row.purpose },
          { label: '状态', value: row.status },
          { label: '备注', value: row.note || '—' },
        ]}
      />
      <DetailSection title="下属库位" description="来自 WMS 库位主数据；一库位一启用 SKU">
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
                      href={`/console/warehouse/${encodeURIComponent(bin.code)}`}
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
                    本库区暂无库位。请到「库位管理」新增并选择本库区。
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </DetailSection>
      <DetailRelatedTables sections={related.sections || []} />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
