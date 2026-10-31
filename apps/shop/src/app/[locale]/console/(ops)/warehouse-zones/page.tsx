'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useBins, useWarehouses } from '@/lib/crossborder/wms-store'
import { Badge } from '@workspace/ui/components/badge'
import { addWarehouseZone, useWarehouseZones } from '@/lib/crossborder/warehouse-zone-store'

export default function WarehouseZonesPage() {
  const rows = useWarehouseZones()
  const warehouses = useWarehouses()
  const bins = useBins()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const warehouseOptions = warehouses
    .filter((item) => item.status === '启用')
    .map((item) => `${item.name} (${item.code})`)

  const kpiItems = React.useMemo(() => {
    const enabled = rows.filter((row) => row.status === '启用').length
    const disabled = rows.length - enabled
    const withBins = rows.filter((row) =>
      bins.some((bin) => bin.warehouseCode === row.warehouseCode && bin.zoneCode === row.code),
    ).length
    return [
      { label: '库区', value: String(rows.length) },
      { label: '启用', value: String(enabled) },
      { label: '停用', value: String(disabled) },
      { label: '已挂库位', value: String(withBins) },
    ]
  }, [rows, bins])

  const editor = open ? (
    <UedDialog
      title="新增库区"
      description="库区是独立主数据（schema §1.5）；新增库位时按仓库选择库区。编码同仓唯一。"
      fields={[
        {
          key: 'warehouse',
          label: '仓库',
          options: warehouseOptions.length
            ? warehouseOptions
            : ['厦门自营仓 (WH-CN-XMN-001)'],
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
        const code = (values.code || 'A').trim().toUpperCase()
        if (!code) {
          setNotice('库区编码必填')
          return
        }
        const dup = rows.some(
          (row) =>
            row.warehouseCode === (warehouse?.code ?? 'WH-CN-XMN-001') && row.code === code,
        )
        if (dup) {
          setNotice(`仓库 ${warehouse?.code ?? 'WH-CN-XMN-001'} 下已有库区 ${code}`)
          return
        }
        addWarehouseZone(rows, {
          warehouseCode: warehouse?.code ?? 'WH-CN-XMN-001',
          code,
          name: values.name || '未命名库区',
          purpose: values.purpose || '待补充',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
        setOpen(false)
        setNotice('库区已加入本次原型会话；新增库位时会读取启用的库区。')
      }}
      saveLabel="保存库区"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="库区管理"
        description="仓库下的独立库区主数据；库位归属库区，拣货和盘点按库区筛选。侧栏入口不变。"
        rows={rows}
        detailHref={(row) => `/console/warehouse-zones/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'warehouseCode', 'code', 'name', 'purpose', 'status', 'note']}
        searchPlaceholder="搜索仓库、库区编码或用途"
        filters={[{ label: '状态', options: ['启用', '停用'] }]}
        emptyText="暂无库区。请先新增库区，再建库位（一库位一启用 SKU）。"
        addLabel="新增库区"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '库区 ID' },
          { key: 'warehouseCode', label: '仓库' },
          { key: 'code', label: '库区编码' },
          { key: 'name', label: '库区名称' },
          { key: 'purpose', label: '用途' },
          {
            key: 'binCount',
            label: '库位数',
            render: (row) =>
              String(
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
        <UedPrototypeNotice>
          库区是独立主数据，不再用库位编码前缀代替。停用库区后，新建库位不再显示该库区，历史库位保留。与
          warehouse / inventory-balances 联动。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
