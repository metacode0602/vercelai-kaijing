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
import { UedDialog } from '@/components/console/erp-ued-workspace'
import {
  BALANCE_COLUMNS,
  BIN_COLUMNS,
  MOVEMENT_COLUMNS,
  buildUedRelatedInfo,
  mapBalanceRows,
  mapBinRows,
  mapMovementRows,
} from '@/lib/console/related-info'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function binVariant(status: string) {
  if (status === '占用') return 'secondary' as const
  if (status === '锁定' || status === '停用') return 'destructive' as const
  return 'outline' as const
}

export default function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [editOpen, setEditOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const warehousesQuery = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 100 })
  const binsQuery = trpc.wms.listBins.useQuery({ page: 1, pageSize: 200 })

  const allBins = binsQuery.data?.items ?? []
  const warehouse =
    (warehousesQuery.data?.items ?? []).find((item) => item.id === id || item.code === id) ||
    undefined
  const bin = !warehouse
    ? allBins.find((item) => item.id === id || item.code === id)
    : undefined
  const resolvedWarehouseCode = warehouse?.code || bin?.warehouseCode
  const warehouseBins = allBins.filter((item) => item.warehouseCode === resolvedWarehouseCode)

  const balancesQuery = trpc.wms.listBalances.useQuery(
    { page: 1, pageSize: 100, warehouse: resolvedWarehouseCode },
    { enabled: !!resolvedWarehouseCode },
  )
  const movementsQuery = trpc.wms.listMovements.useQuery(
    { page: 1, pageSize: 50, warehouse: resolvedWarehouseCode, sku: bin?.boundSku || undefined },
    { enabled: !!resolvedWarehouseCode },
  )

  const updateWarehouse = trpc.wms.updateWarehouse.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.wms.listWarehouses.invalidate(),
        utils.wms.getWarehouse.invalidate(),
      ])
      setEditOpen(false)
      setNotice('仓库已更新')
    },
    onError: (e) => setNotice(e.message),
  })
  const updateBin = trpc.wms.updateBin.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.wms.listBins.invalidate(), utils.wms.listWarehouses.invalidate()])
      setEditOpen(false)
      setNotice('库位已更新')
    },
    onError: (e) => setNotice(e.message),
  })

  if (warehousesQuery.isLoading || binsQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse"
          title="加载中…"
          description="正在从数据库读取仓库 / 库位…"
        />
      </div>
    )
  }

  // Warehouse view
  if (warehouse) {
    const balances = balancesQuery.data?.items ?? []
    const related = buildUedRelatedInfo(
      'warehouse',
      { id: warehouse.id, warehouse: warehouse.code, warehouseCode: warehouse.code },
      {
        bins: mapBinRows(warehouseBins),
        balances: mapBalanceRows(balances),
        movements: mapMovementRows(movementsQuery.data?.items ?? []),
      },
    )

    return (
      <div className="flex w-full flex-col gap-4">
        <ConsoleBreadcrumbRegistration
          items={[
            { label: '仓库与库位', href: '/console/warehouse' },
            { label: `${warehouse.code} · ${warehouse.name}` },
          ]}
        />
        <DetailPageHeader
          backHref="/console/warehouse"
          title={`${warehouse.code} · ${warehouse.name}`}
          description={`${warehouse.type} · ${warehouse.country} · ${warehouse.timezone}`}
          badges={
            <>
              <Badge variant="outline">commerce_warehouses</Badge>
              <Badge variant={warehouse.status === '启用' ? 'secondary' : 'outline'}>
                {warehouse.status}
              </Badge>
            </>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setEditOpen(true)}>
                编辑仓库
              </Button>
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href="/console/warehouse-zones">库区管理</LocaleLink>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href="/console/inventory-balances">库存余额</LocaleLink>
              </Button>
            </div>
          }
        />
        <DetailKpiRow
          items={[
            { label: '库位数', value: String(warehouseBins.length) },
            {
              label: '占用',
              value: String(warehouseBins.filter((item) => item.status === '占用').length),
            },
            { label: '余额行', value: String(balances.length) },
            { label: '币种', value: warehouse.currency },
          ]}
        />
        <DetailFieldGrid
          title="仓库主信息"
          description="commerce_warehouses"
          fields={[
            { label: '仓库 ID', value: warehouse.id, mono: true },
            { label: '仓库编码', value: warehouse.code, mono: true },
            { label: '名称', value: warehouse.name },
            { label: '类型', value: warehouse.type },
            { label: '国家', value: warehouse.country },
            { label: '时区', value: warehouse.timezone },
            { label: '运营币种', value: warehouse.currency },
            { label: '地址', value: warehouse.address || '—' },
            { label: '备注', value: warehouse.note || '—' },
          ]}
        />
        <DetailRelatedTables sections={related.sections || []} />
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        {editOpen ? (
          <UedDialog
            title="编辑仓库"
            description="编码不可改；变更写入 commerce_warehouses。"
            fields={[
              { key: 'name', label: '名称', required: true, defaultValue: warehouse.name },
              { key: 'address', label: '地址', defaultValue: warehouse.address },
              { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: warehouse.note },
              {
                key: 'status',
                label: '状态',
                options: ['启用', '停用'],
                required: true,
                defaultValue: warehouse.status,
              },
            ]}
            onClose={() => setEditOpen(false)}
            onSave={(values) => {
              updateWarehouse.mutate({
                id: warehouse.id,
                name: values.name || warehouse.name,
                address: values.address || '',
                note: values.note || '',
                status: values.status === '停用' ? '停用' : '启用',
              })
            }}
            saveLabel="保存"
          />
        ) : null}
      </div>
    )
  }

  // Bin view
  if (!bin) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/warehouse"
          title="未找到库位 / 仓库"
          description={
            `编码 ${id} 不存在于 commerce_warehouses / commerce_bins。`
          }
        />
      </div>
    )
  }

  const balances = (balancesQuery.data?.items ?? []).filter(
    (item) => item.bin === bin.code && (!bin.boundSku || item.sku === bin.boundSku),
  )
  const movements = (movementsQuery.data?.items ?? []).filter((item) => item.bin === bin.code)
  const siblingBins = warehouseBins.filter((item) => item.id !== bin.id)

  const related = buildUedRelatedInfo(
    'warehouse',
    {
      id: bin.id,
      code: bin.code,
      warehouse: bin.warehouseCode,
      warehouseCode: bin.warehouseCode,
      boundSku: bin.boundSku,
      sku: bin.boundSku,
      zoneCode: bin.zoneCode,
    },
    {
      balances: mapBalanceRows(balances),
      movements: mapMovementRows(movements),
      bins: mapBinRows(siblingBins),
    },
  )
  const parentFields = parentsToFields(related.parents)

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '仓库与库位', href: '/console/warehouse' },
          { label: `${bin.warehouseCode} / ${bin.code}` },
        ]}
      />
      <DetailPageHeader
        backHref="/console/warehouse"
        title={bin.code}
        description={`${bin.warehouseCode} · ${bin.name} · 库区 ${bin.zoneCode || '—'}`}
        badges={
          <>
            <Badge variant="outline">commerce_bins</Badge>
            <Badge variant={binVariant(bin.status)}>{bin.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              编辑库位
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/warehouse/${encodeURIComponent(bin.warehouseId)}`}>
                所属仓库
              </LocaleLink>
            </Button>
            {bin.boundSku ? (
              <Button size="sm" variant="secondary" asChild>
                <LocaleLink href={`/console/master-skus/${encodeURIComponent(bin.boundSku)}`}>
                  绑定 SKU
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />
      <Alert>
        <AlertTitle>一库位一启用 SKU</AlertTitle>
        <AlertDescription>
          库位绑定与余额投影来自 wms tRPC。关联子表不再读 ERP 演示样本。
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '状态', value: bin.status },
          { label: '绑定 SKU', value: bin.boundSku || '—' },
          { label: '余额行', value: String(balances.length) },
          { label: '近期流水', value: String(movements.length) },
        ]}
      />
      <DetailFieldGrid
        title="库位主信息"
        description="commerce_bins"
        fields={[
          { label: '库位 ID', value: bin.id, mono: true },
          ...parentFields,
          { label: '库位编码', value: bin.code, mono: true },
          { label: '名称', value: bin.name },
          { label: '库区', value: bin.zoneCode || '—' },
          { label: '仓库', value: bin.warehouseCode, mono: true },
          { label: '绑定 SKU', value: bin.boundSku || '—' },
          { label: '备注', value: bin.note || '—' },
          { label: '更新时间', value: bin.updatedAt },
        ]}
      />
      <DetailRelatedTables
        sections={
          related.sections?.length
            ? related.sections
            : [
                {
                  title: '库位库存',
                  description: 'wms.listBalances',
                  columns: BALANCE_COLUMNS,
                  rows: mapBalanceRows(balances),
                  emptyText: '暂无关联数据',
                },
                {
                  title: '库存流水',
                  description: 'wms.listMovements',
                  columns: MOVEMENT_COLUMNS,
                  rows: mapMovementRows(movements),
                  emptyText: '暂无关联数据',
                },
                {
                  title: '同仓库位',
                  description: 'wms.listBins',
                  columns: BIN_COLUMNS,
                  rows: mapBinRows(siblingBins),
                  emptyText: '暂无关联数据',
                },
              ]
        }
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {editOpen ? (
        <UedDialog
          title="编辑库位"
          description="换绑 SKU 前请确认无占用；停用后不可再用于入库/出库目标。"
          fields={[
            { key: 'name', label: '库位名称', defaultValue: bin.name, required: true },
            { key: 'zoneCode', label: '库区编码', defaultValue: bin.zoneCode },
            { key: 'boundSku', label: '绑定内部 SKU', defaultValue: bin.boundSku },
            {
              key: 'status',
              label: '状态',
              options: ['空闲', '占用', '锁定', '停用'],
              defaultValue: bin.status,
              required: true,
            },
            { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: bin.note },
          ]}
          onClose={() => setEditOpen(false)}
          onSave={(values) => {
            updateBin.mutate({
              id: bin.id,
              name: values.name || bin.name,
              zoneCode: values.zoneCode || '',
              boundSku: values.boundSku || '',
              status: values.status || bin.status,
              note: values.note || '',
            })
          }}
          saveLabel="保存"
        />
      ) : null}
    </div>
  )
}
