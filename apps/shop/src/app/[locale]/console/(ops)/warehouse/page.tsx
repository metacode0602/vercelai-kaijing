'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import {
  BIN_STATUSES,
  WAREHOUSE_TYPES,
  createBin,
  createWarehouse,
  useBins,
  useWarehouses,
} from '@/lib/crossborder/wms-store'
import { useWarehouseZones } from '@/lib/crossborder/warehouse-zone-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function binVariant(status: string) {
  if (status === '占用') return 'secondary' as const
  if (status === '锁定' || status === '停用') return 'destructive' as const
  return 'outline' as const
}

export default function WarehousePage() {
  const warehouses = useWarehouses()
  const bins = useBins()
  const zones = useWarehouseZones()
  const router = useLocaleRouter()
  const [whOpen, setWhOpen] = React.useState(false)
  const [binOpen, setBinOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [view, setView] = React.useState<'bins' | 'warehouses'>('bins')

  const activeWarehouses = warehouses.filter((item) => item.status === '启用')
  const zoneOptions = zones.filter((zone) => zone.status === '启用').map((zone) => zone.code)
  const kpiItems = React.useMemo(
    () => [
      { label: '仓库', value: String(warehouses.length), hint: `${activeWarehouses.length} 启用` },
      { label: '库位', value: String(bins.length), hint: 'commerce_bins' },
      { label: '占用库位', value: String(bins.filter((item) => item.status === '占用').length) },
      { label: '空闲库位', value: String(bins.filter((item) => item.status === '空闲').length) },
    ],
    [warehouses, bins, activeWarehouses.length],
  )

  const warehouseEditor = whOpen ? (
    <UedDialog
      title="新增仓库"
      description="对应 commerce_warehouses：公司仓库可被多店铺复用；编码组织内唯一。"
      fields={[
        { key: 'code', label: '仓库编码', required: true, placeholder: '如 WH-CN-XMN-002', helper: '建议 WH-{国}-{城市}-{序号}' },
        { key: 'name', label: '仓库名称', required: true },
        { key: 'type', label: '仓库类型', options: [...WAREHOUSE_TYPES], required: true },
        { key: 'country', label: '国家', defaultValue: 'CN', required: true },
        { key: 'timezone', label: '时区', defaultValue: 'Asia/Shanghai' },
        { key: 'currency', label: '运营币种', defaultValue: 'CNY' },
        { key: 'address', label: '地址', type: 'textarea', fullWidth: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setWhOpen(false)}
      onSave={(values) => {
        const result = createWarehouse({
          code: values.code || '',
          name: values.name || '',
          type: (values.type as (typeof WAREHOUSE_TYPES)[number]) || '自营仓',
          country: values.country,
          timezone: values.timezone,
          currency: values.currency,
          address: values.address,
          note: values.note,
        })
        setWhOpen(false)
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(`${result.warehouse.code} 已创建。`)
        setView('warehouses')
      }}
      saveLabel="创建仓库"
    />
  ) : null

  const binEditor = binOpen ? (
    <UedDialog
      title="新增库位"
      description="对应 commerce_bins：同仓库库位编码唯一；一个启用库位同一时刻最多绑定一个启用 SKU（R07）。"
      fields={[
        {
          key: 'warehouse',
          label: '仓库',
          options: activeWarehouses.map((item) => `${item.name} (${item.code})`),
          required: true,
        },
        { key: 'code', label: '库位编码', placeholder: '如 A-01-01-03', required: true },
        {
          key: 'zone',
          label: '库区编码',
          options: zoneOptions.length ? zoneOptions : ['A', 'B', 'C'],
          required: true,
        },
        { key: 'name', label: '库位名称', placeholder: '可空，默认用编码' },
        {
          key: 'sku',
          label: '绑定内部 SKU',
          options: ['不绑定', 'HSY000001001', 'HSY000001002', 'HSY000002001'],
          required: true,
        },
        { key: 'status', label: '库位状态', options: [...BIN_STATUSES], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setBinOpen(false)}
      onSave={(values) => {
        const warehouse = activeWarehouses.find(
          (item) => `${item.name} (${item.code})` === values.warehouse,
        )
        const result = createBin({
          warehouseCode: warehouse?.code || activeWarehouses[0]?.code || 'WH-CN-XMN-001',
          code: values.code || '',
          zoneCode: values.zone,
          name: values.name,
          boundSku: values.sku,
          status: (values.status as (typeof BIN_STATUSES)[number]) || '空闲',
          note: values.note,
        })
        setBinOpen(false)
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(`库位 ${result.bin.code} 已创建。`)
        setView('bins')
      }}
      saveLabel="创建库位"
    />
  ) : null

  if (view === 'warehouses') {
    return (
      <>
        {warehouseEditor}
        {binEditor}
        <UedWorkspace
          title="仓库主档"
          description="公司仓库（commerce_warehouses）多店复用；侧栏入口仍为「仓库与库位」。"
          rows={warehouses}
          detailHref={(row) => `/console/warehouse/${encodeURIComponent(row.code)}`}
          searchKeys={['code', 'name', 'type', 'country', 'status']}
          searchPlaceholder="搜索仓库编码、名称或类型"
          filters={[{ label: '状态', options: ['启用', '停用'] }]}
          emptyText="暂无仓库。请先创建公司仓库。"
          addLabel="新增仓库"
          onAdd={() => setWhOpen(true)}
          columns={[
            { key: 'code', label: '仓库编码' },
            { key: 'name', label: '名称' },
            { key: 'type', label: '类型' },
            { key: 'country', label: '国家' },
            { key: 'timezone', label: '时区' },
            { key: 'currency', label: '币种' },
            {
              key: 'shops',
              label: '关联店铺',
              render: (row) => (row.shops.length ? row.shops.join('、') : '—'),
            },
            {
              key: 'status',
              label: '状态',
              render: (row) => (
                <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
              ),
            },
          ]}
        >
          <DetailKpiRow items={kpiItems} />
          <UedPrototypeNotice>
            库存归属组织 + 仓库 + 库位 + SKU，不归属店铺。店铺通过 shop_warehouses 关联仓库并指定默认出库仓。
          </UedPrototypeNotice>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setView('bins')}>
              查看库位
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBinOpen(true)}>
              新增库位
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <LocaleLink href="/console/warehouse-zones">管理库区</LocaleLink>
            </Button>
          </div>
          {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        </UedWorkspace>
      </>
    )
  }

  return (
    <>
      {warehouseEditor}
      {binEditor}
      <UedWorkspace
        title="仓库与库位"
        description="库位（commerce_bins）归属仓库与库区；一库位一启用 SKU。解绑/换绑保留历史占用痕迹。"
        rows={bins}
        detailHref={(row) => `/console/warehouse/${encodeURIComponent(row.code)}`}
        searchKeys={['warehouseCode', 'code', 'zoneCode', 'boundSku', 'status', 'name']}
        searchPlaceholder="搜索仓库、库位、SKU 或库区"
        filters={[{ label: '状态', options: [...BIN_STATUSES] }]}
        emptyText="暂无库位。请先确保仓库启用，再新增库位。"
        addLabel="新增库位"
        onAdd={() => setBinOpen(true)}
        columns={[
          { key: 'warehouseCode', label: '仓库' },
          { key: 'zoneCode', label: '库区' },
          { key: 'code', label: '库位编码' },
          { key: 'name', label: '名称' },
          {
            key: 'boundSku',
            label: '绑定 SKU',
            render: (row) => row.boundSku || '—',
          },
          {
            key: 'status',
            label: '库位状态',
            render: (row) => <Badge variant={binVariant(row.status)}>{row.status}</Badge>,
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <UedPrototypeNotice>
          数据库强校验：同一仓库库位编码唯一；有实物占用时一个启用库位只能绑定一个启用 SKU。停用库区后新建库位不可再选该库区。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setView('warehouses')}>
            查看仓库主档
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWhOpen(true)}>
            新增仓库
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <LocaleLink href="/console/warehouse-zones">管理库区</LocaleLink>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.push('/console/inventory-balances')}>
            库存余额
          </Button>
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
