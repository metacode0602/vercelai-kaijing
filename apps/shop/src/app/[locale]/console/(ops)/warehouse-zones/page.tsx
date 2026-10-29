'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { INITIAL_WAREHOUSES } from '@/lib/crossborder/platform-basics-data'
import { Badge } from '@workspace/ui/components/badge'
import { addWarehouseZone, useWarehouseZones } from '@/lib/crossborder/warehouse-zone-store'

export default function WarehouseZonesPage() {
  const rows = useWarehouseZones()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const warehouseOptions = INITIAL_WAREHOUSES.map((warehouse) => `${warehouse.name} (${warehouse.code})`)

  const editor = open ? (
    <UedDialog
      title="新增库区"
      description="库区是独立主数据；新增库位时按仓库选择库区。"
      fields={[
        { key: 'warehouse', label: '仓库', options: warehouseOptions, required: true },
        { key: 'code', label: '库区编码', required: true, placeholder: '如 A / B / C' },
        { key: 'name', label: '库区名称', required: true, placeholder: '如 A 区' },
        { key: 'purpose', label: '用途', placeholder: '如 服装拣货区 / 退货暂存区' },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const warehouse = INITIAL_WAREHOUSES.find((item) => `${item.name} (${item.code})` === values.warehouse)
        addWarehouseZone(rows, {
          warehouseCode: warehouse?.code ?? INITIAL_WAREHOUSES[0]?.code ?? 'WH-CN-XMN-001',
          code: (values.code || 'A').toUpperCase(),
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
        description="仓库下的独立库区主数据；库位归属库区，拣货和盘点按库区筛选。"
        rows={rows}
        detailHref={(row) => `/console/warehouse-zones/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'warehouseCode', 'code', 'name', 'purpose', 'status']}
        searchPlaceholder="搜索仓库、库区编码或用途"
        addLabel="新增库区"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '库区 ID' },
          { key: 'warehouseCode', label: '仓库' },
          { key: 'code', label: '库区编码' },
          { key: 'name', label: '库区名称' },
          { key: 'purpose', label: '用途' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          库区是独立主数据，不再用库位编码前缀代替。停用库区后，新建库位不再显示该库区，历史库位保留。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
