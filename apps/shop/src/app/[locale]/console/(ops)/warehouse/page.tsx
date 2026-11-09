'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function WarehousePage() {
  const utils = trpc.useUtils()
  const [whOpen, setWhOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const warehousesQuery = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.wms.warehouseStats.useQuery()
  const metaQuery = trpc.wms.meta.useQuery()

  const createWh = trpc.wms.createWarehouse.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.wms.listWarehouses.invalidate(),
        utils.wms.warehouseStats.invalidate(),
      ])
      setWhOpen(false)
      setNotice(`已创建仓库 ${row.code}`)
    },
    onError: (e) => setNotice(e.message),
  })

  const warehouses = warehousesQuery.data?.items ?? []

  const kpiItems = [
    {
      label: '仓库',
      value: String(statsQuery.data?.warehouses ?? 0),
      hint: `${statsQuery.data?.activeWarehouses ?? 0} 启用`,
    },
    { label: '启用', value: String(statsQuery.data?.activeWarehouses ?? 0) },
    {
      label: '停用',
      value: String(
        (statsQuery.data?.warehouses ?? 0) - (statsQuery.data?.activeWarehouses ?? 0),
      ),
    },
    { label: '库位总数', value: String(statsQuery.data?.bins ?? 0), hint: 'commerce_bins' },
  ]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>仓库已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          tRPC `wms.listWarehouses` → dataaccess → commerce_warehouses。仓库下的库区 / 库位管理见仓库详情页。{notice ? ` ${notice}` : ''}
        </AlertDescription>
      </Alert>
      <DetailKpiRow items={kpiItems} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setWhOpen(true)}>
          新增仓库
        </Button>
      </div>
      {whOpen ? (
        <UedDialog
          title="新增仓库"
          description="commerce_warehouses：公司仓库可被多店铺复用；编码组织内唯一。"
          fields={[
            { key: 'code', label: '仓库编码', required: true, placeholder: '如 WH-CN-XMN-002' },
            { key: 'name', label: '仓库名称', required: true },
            {
              key: 'type',
              label: '仓库类型',
              options: metaQuery.data?.warehouseTypes ?? ['自营仓'],
              required: true,
            },
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
      ) : null}
      <UedWorkspace
        title="仓库"
        description="commerce_warehouses · 组织内唯一编码；点击进入管理库区与库位"
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
            render: (r) => (
              <Badge variant={r.status === '启用' ? 'secondary' : 'outline'}>{r.status}</Badge>
            ),
          },
        ]}
      />
    </div>
  )
}
