'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function binVariant(status: string) {
  if (status === '占用') return 'secondary' as const
  if (status === '锁定' || status === '停用') return 'destructive' as const
  return 'outline' as const
}

export default function WarehousePage() {
  const utils = trpc.useUtils()
  const [whOpen, setWhOpen] = React.useState(false)
  const [binOpen, setBinOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [view, setView] = React.useState<'bins' | 'warehouses'>('bins')

  const warehousesQuery = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 100 })
  const binsQuery = trpc.wms.listBins.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.wms.warehouseStats.useQuery()
  const metaQuery = trpc.wms.meta.useQuery()

  const createWh = trpc.wms.createWarehouse.useMutation({
    onSuccess: async (row) => {
      await Promise.all([utils.wms.listWarehouses.invalidate(), utils.wms.warehouseStats.invalidate()])
      setWhOpen(false)
      setNotice(`已创建仓库 ${row.code}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const createBinMut = trpc.wms.createBin.useMutation({
    onSuccess: async (row) => {
      await Promise.all([utils.wms.listBins.invalidate(), utils.wms.warehouseStats.invalidate()])
      setBinOpen(false)
      setNotice(`已创建库位 ${row.code}`)
    },
    onError: (e) => setNotice(e.message),
  })

  const warehouses = warehousesQuery.data?.items ?? []
  const bins = binsQuery.data?.items ?? []
  const warehouseOptions = warehouses.filter((w) => w.status === '启用').map((w) => w.code)

  const kpiItems = [
    { label: '仓库', value: String(statsQuery.data?.warehouses ?? 0), hint: `${statsQuery.data?.activeWarehouses ?? 0} 启用` },
    { label: '库位', value: String(statsQuery.data?.bins ?? 0), hint: 'commerce_bins' },
    { label: '占用库位', value: String(statsQuery.data?.occupiedBins ?? 0) },
    { label: '空闲库位', value: String(statsQuery.data?.emptyBins ?? 0) },
  ]

  const warehouseEditor = whOpen ? (
    <UedDialog
      title="新增仓库"
      description="commerce_warehouses：公司仓库可被多店铺复用；编码组织内唯一。"
      fields={[
        { key: 'code', label: '仓库编码', required: true, placeholder: '如 WH-CN-XMN-002' },
        { key: 'name', label: '仓库名称', required: true },
        { key: 'type', label: '仓库类型', options: metaQuery.data?.warehouseTypes ?? ['自营仓'], required: true },
        { key: 'country', label: '国家', defaultValue: 'CN', required: true },
        { key: 'timezone', label: '时区', defaultValue: 'Asia/Shanghai' },
        { key: 'currency', label: '运营币种', defaultValue: 'CNY' },
        { key: 'address', label: '地址', type: 'textarea', fullWidth: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setWhOpen(false)}
      onSave={(values) =>
        createWh.mutate({
          code: values.code,
          name: values.name,
          type: values.type,
          country: values.country,
          timezone: values.timezone,
          currency: values.currency,
          address: values.address,
          note: values.note,
        })
      }
    />
  ) : null

  const binEditor = binOpen ? (
    <UedDialog
      title="新增库位"
      description="commerce_bins：同仓编码唯一；一库位一启用 SKU。"
      fields={[
        { key: 'warehouseCode', label: '仓库', options: warehouseOptions, required: true },
        { key: 'zoneCode', label: '库区', placeholder: '如 A' },
        { key: 'code', label: '库位编码', required: true, placeholder: '如 A-01-02-01' },
        { key: 'name', label: '名称' },
        { key: 'boundSku', label: '绑定 SKU', placeholder: '空=空闲' },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setBinOpen(false)}
      onSave={(values) =>
        createBinMut.mutate({
          warehouseCode: values.warehouseCode,
          zoneCode: values.zoneCode,
          code: values.code,
          name: values.name,
          boundSku: values.boundSku,
          note: values.note,
        })
      }
    />
  ) : null

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>仓库 / 库位已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          tRPC `wms.*` → dataaccess → commerce_warehouses / commerce_bins；库区见 warehouse-zones（raw.zones）。{notice ? ` ${notice}` : ''}
        </AlertDescription>
      </Alert>
      <DetailKpiRow items={kpiItems} />
      <div className="flex gap-2">
        <Button variant={view === 'bins' ? 'default' : 'outline'} size="sm" onClick={() => setView('bins')}>
          库位
        </Button>
        <Button
          variant={view === 'warehouses' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setView('warehouses')}
        >
          仓库
        </Button>
        <Button size="sm" onClick={() => setWhOpen(true)}>
          新增仓库
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setBinOpen(true)}>
          新增库位
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <LocaleLink href="/console/warehouse-zones">库区管理</LocaleLink>
        </Button>
      </div>
      {warehouseEditor}
      {binEditor}
      {view === 'warehouses' ? (
        <UedWorkspace
          title="仓库"
          description="commerce_warehouses · 组织内唯一编码"
          rows={warehouses}
          detailHref={(row) => `/console/warehouse/${encodeURIComponent(row.id)}`}
          searchKeys={['code', 'name', 'type', 'country', 'status']}
          searchPlaceholder="搜索仓库编码或名称"
          filters={[{ label: '状态', options: ['启用', '停用'] }]}
          emptyText={warehousesQuery.isLoading ? '加载中…' : '暂无仓库'}
          columns={[
            { key: 'code', label: '编码' },
            { key: 'name', label: '名称' },
            { key: 'type', label: '类型' },
            { key: 'country', label: '国家' },
            { key: 'binCount', label: '库位数', render: (r) => String(r.binCount) },
            {
              key: 'status',
              label: '状态',
              render: (r) => <Badge variant={r.status === '启用' ? 'secondary' : 'outline'}>{r.status}</Badge>,
            },
          ]}
        />
      ) : (
        <UedWorkspace
          title="库位"
          description="commerce_bins · 一库位一启用 SKU"
          rows={bins}
          detailHref={(row) => `/console/warehouse/${encodeURIComponent(row.warehouseId)}`}
          searchKeys={['code', 'warehouseCode', 'zoneCode', 'boundSku', 'status']}
          searchPlaceholder="搜索库位 / 仓库 / SKU"
          filters={[{ label: '状态', options: ['空闲', '占用', '锁定', '停用'] }]}
          emptyText={binsQuery.isLoading ? '加载中…' : '暂无库位'}
          columns={[
            { key: 'warehouseCode', label: '仓库' },
            { key: 'zoneCode', label: '库区' },
            { key: 'code', label: '库位' },
            { key: 'boundSku', label: '绑定 SKU', render: (r) => r.boundSku || '—' },
            {
              key: 'status',
              label: '状态',
              render: (r) => <Badge variant={binVariant(r.status)}>{r.status}</Badge>,
            },
          ]}
        />
      )}
    </div>
  )
}
