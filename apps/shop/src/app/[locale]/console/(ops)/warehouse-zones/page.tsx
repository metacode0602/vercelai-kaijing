'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function WarehouseZonesPage() {
  const utils = trpc.useUtils()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const zonesQuery = trpc.wms.listZones.useQuery({ page: 1, pageSize: 200 })
  const statsQuery = trpc.wms.zoneStats.useQuery()
  const warehousesQuery = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const binsQuery = trpc.wms.listBins.useQuery({ page: 1, pageSize: 200 })

  const createZone = trpc.wms.createZone.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.wms.listZones.invalidate(),
        utils.wms.zoneStats.invalidate(),
      ])
      setOpen(false)
      setNotice(`已创建库区 ${row.warehouseCode}:${row.code}`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = zonesQuery.data?.items ?? []
  const bins = binsQuery.data?.items ?? []
  const warehouses = warehousesQuery.data?.items ?? []
  const warehouseOptions = warehouses.map((item) => `${item.name} (${item.code})`)

  const kpiItems = [
    { label: '库区', value: String(statsQuery.data?.zones ?? 0) },
    { label: '启用', value: String(statsQuery.data?.activeZones ?? 0) },
    { label: '停用', value: String(statsQuery.data?.disabledZones ?? 0) },
    { label: '已挂库位', value: String(statsQuery.data?.withBins ?? 0) },
  ]

  const editor = open ? (
    <UedDialog
      title="新增库区"
      description="库区元数据写入 commerce_warehouses.raw.zones；库位通过 zone_code 归属。同仓编码唯一。"
      fields={[
        {
          key: 'warehouse',
          label: '仓库',
          options: warehouseOptions.length ? warehouseOptions : ['（请先创建仓库）'],
          required: true,
        },
        { key: 'code', label: '库区编码', required: true, placeholder: '如 A / B / C' },
        { key: 'name', label: '库区名称', required: true, placeholder: '如 A 区' },
        { key: 'purpose', label: '用途', placeholder: '如 服装拣货区 / 退货暂存区' },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true, defaultValue: '启用' },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const warehouse =
          warehouses.find((item) => `${item.name} (${item.code})` === values.warehouse) ||
          warehouses[0]
        if (!warehouse) {
          setNotice('请先创建启用仓库')
          return
        }
        const code = (values.code || '').trim().toUpperCase()
        if (!code) {
          setNotice('库区编码必填')
          return
        }
        createZone.mutate({
          warehouseCode: warehouse.code,
          code,
          name: values.name || `${code} 区`,
          purpose: values.purpose || '',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
      }}
      saveLabel="保存库区"
    />
  ) : null

  return (
    <>
      {editor}
      <Alert>
        <AlertTitle>库区已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          tRPC `wms.listZones` → dataaccess → `commerce_warehouses.raw.zones` + `commerce_bins.zone_code`（无独立库区表）。
          {notice ? ` ${notice}` : ''}
        </AlertDescription>
      </Alert>
      <UedWorkspace
        title="库区管理"
        description="仓库下的库区主数据；库位归属库区，拣货和盘点按库区筛选。侧栏入口不变。"
        rows={rows}
        detailHref={(row) => `/console/warehouse-zones/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'warehouseCode', 'code', 'name', 'purpose', 'status', 'note']}
        searchPlaceholder="搜索仓库、库区编码或用途"
        filters={[{ label: '状态', options: ['启用', '停用'] }]}
        emptyText={zonesQuery.isLoading ? '加载中…' : '暂无库区。请先新增库区，再建库位（一库位一启用 SKU）。'}
        addLabel="新增库区"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '库区 ID' },
          { key: 'warehouseCode', label: '仓库' },
          { key: 'code', label: '库区编码' },
          { key: 'name', label: '库区名称' },
          { key: 'purpose', label: '用途', render: (row) => row.purpose || '—' },
          {
            key: 'binCount',
            label: '库位数',
            render: (row) =>
              String(
                row.binCount ||
                  bins.filter(
                    (bin) => bin.warehouseCode === row.warehouseCode && bin.zoneCode === row.code,
                  ).length,
              ),
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
      </UedWorkspace>
    </>
  )
}
