'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function OceanContainersPage() {
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const listQuery = trpc.ocean.list.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.ocean.stats.useQuery()
  const bucketsQuery = trpc.ocean.inventoryBuckets.useQuery({})

  const createMutation = trpc.ocean.create.useMutation({
    onSuccess: async (row) => {
      await Promise.all([utils.ocean.list.invalidate(), utils.ocean.stats.invalidate()])
      setOpen(false)
      setNotice(`已创建柜次 ${row.lotCode}（PostgreSQL）`)
    },
    onError: (e) => setNotice(e.message),
  })

  const advanceMutation = trpc.ocean.advance.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.ocean.list.invalidate(),
        utils.ocean.stats.invalidate(),
        utils.ocean.inventoryBuckets.invalidate(),
      ])
      setNotice(`已推进 ${row.lotCode} → ${row.status}`)
    },
    onError: (e) => setNotice(e.message),
  })

  const lots = listQuery.data?.items ?? []
  const kpi = statsQuery.data
  const buckets = bucketsQuery.data ?? []

  const editor = open ? (
    <UedDialog
      title="新建海运柜次"
      description="Daraz LK：厦门港 → 科伦坡本地仓。草稿创建后按 订舱→开船→到港→清关→到仓 推进；开船后写入在途库存桶。"
      fields={[
        { key: 'lotCode', label: '柜次号', placeholder: '空则自动生成 LOT-CMB-…' },
        { key: 'containerNo', label: '柜号', placeholder: '如 MSKU7834219' },
        { key: 'containerType', label: '柜型', options: ['40HQ', '40GP', '20GP'], required: true },
        { key: 'freightMode', label: '装载形态', options: ['FCL40', 'FCL20', 'FCL', 'LCL'], required: true },
        { key: 'platform', label: '平台', options: ['daraz', 'lazada'], required: true },
        { key: 'originPort', label: '起运港', required: true },
        { key: 'destPort', label: '目的港', required: true },
        { key: 'warehouse', label: '目的仓', required: true },
        { key: 'etd', label: 'ETD', placeholder: 'YYYY-MM-DD' },
        { key: 'etaPort', label: 'ETA 港', placeholder: 'YYYY-MM-DD' },
        { key: 'etaWarehouse', label: 'ETA 仓', placeholder: 'YYYY-MM-DD' },
        { key: 'sku', label: '首行 SKU', placeholder: '依赖商品种子，如 HSY000001001', required: true },
        { key: 'qtyShipped', label: '首行发运量', required: true },
        { key: 'notes', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const qty = Number(values.qtyShipped || 0)
        createMutation.mutate({
          lotCode: values.lotCode || undefined,
          containerNo: values.containerNo || undefined,
          containerType: values.containerType || '40HQ',
          freightMode: values.freightMode || 'FCL40',
          platform: values.platform || 'daraz',
          originPort: values.originPort || 'CNXMN',
          destPort: values.destPort || 'LKCMB',
          warehouse: values.warehouse || 'WH-LK-CMB-001',
          etd: values.etd || undefined,
          etaPort: values.etaPort || undefined,
          etaWarehouse: values.etaWarehouse || undefined,
          notes: values.notes || undefined,
          lines: values.sku
            ? [{ sku: values.sku, qtyShipped: Number.isFinite(qty) && qty > 0 ? qty : 1 }]
            : [],
        })
      }}
    />
  ) : null

  return (
    <UedWorkspace
      title="海运柜次"
      description="F22 · Daraz LK 海运柜次（45–60 天 → Colombo）。不共享厦门现货池。状态：草稿→订舱→在途→到港→清关→已入本地仓。"
      rows={lots}
      detailHref={(row) => `/console/ocean-containers/${encodeURIComponent(row.id)}`}
      searchKeys={['lotCode', 'containerNo', 'status', 'warehouse']}
      searchPlaceholder="搜索柜次号、柜号或状态"
      filters={[
        {
          label: '状态',
          options: ['草稿', '已订舱', '在途', '已到港', '清关中', '已入本地仓', '已取消'],
        },
      ]}
      onAdd={() => setOpen(true)}
      addLabel="新建柜次"
      columns={[
        { key: 'lotCode', label: '柜次' },
        { key: 'containerNo', label: '柜号' },
        { key: 'containerType', label: '柜型' },
        { key: 'freightMode', label: '装载' },
        { key: 'originPort', label: '起运港' },
        { key: 'destPort', label: '目的港' },
        { key: 'etaPort', label: 'ETA 港' },
        { key: 'etaWarehouse', label: 'ETA 仓' },
        {
          key: 'status',
          label: '状态',
          render: (row) => (
            <Badge
              variant={
                row.status === '清关中' ? 'destructive' : row.status === '在途' || row.status === '已到港' ? 'secondary' : 'default'
              }
            >
              {row.status}
            </Badge>
          ),
        },
        { key: 'lineCount', label: 'SKU 行', render: (row) => String(row.lineCount) },
        { key: 'boxCount', label: '箱数', render: (row) => String(row.boxCount) },
      ]}
    >
      {editor}
      <DetailKpiRow
        items={[
          { label: '柜次数', value: String(kpi?.total ?? '—') },
          { label: '在途', value: String(kpi?.inTransit ?? '—') },
          { label: '已到港', value: String(kpi?.arrived ?? '—') },
          { label: '清关中', value: String(kpi?.clearing ?? '—') },
          { label: '已入本地仓', value: String(kpi?.received ?? '—') },
          { label: 'SKU 行合计', value: String(kpi?.skuLines ?? '—') },
        ]}
      />
      <UedPrototypeNotice>
        主路径已接 PostgreSQL（tRPC ocean.*）。开船写 in_transit，清关转入 customs_clearing，到仓转 on_hand/damaged；幂等键
        ledger:ocean_*。不共享 WH-CN-XMN。审批相关：杨洁 / 黄发聪。
      </UedPrototypeNotice>
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-medium">库存桶（inventory_balances）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">SKU</th>
                <th className="py-1 pr-3">仓</th>
                <th className="py-1 pr-3">在途</th>
                <th className="py-1 pr-3">清关中</th>
                <th className="py-1 pr-3">可用</th>
                <th className="py-1 pr-3">残次</th>
              </tr>
            </thead>
            <tbody>
              {buckets.length === 0 ? (
                <tr>
                  <td className="py-2 text-muted-foreground" colSpan={6}>
                    暂无余额；推进柜次开船后出现在途数量。
                  </td>
                </tr>
              ) : (
                buckets.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="py-1 pr-3">{b.sku}</td>
                    <td className="py-1 pr-3">{b.warehouse}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.inTransit}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.customsClearing}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.available}</td>
                    <td className="py-1 pr-3 tabular-nums">{b.damaged}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {lots
          .filter((l) => !['已入本地仓', '已取消'].includes(l.status))
          .slice(0, 4)
          .map((lot) => (
            <Button
              key={lot.id}
              size="sm"
              variant="outline"
              disabled={advanceMutation.isPending}
              onClick={() => advanceMutation.mutate({ id: lot.id })}
            >
              推进 {lot.lotCode}
            </Button>
          ))}
      </div>
      {listQuery.isLoading ? <p className="text-sm text-muted-foreground">加载柜次中…</p> : null}
      {listQuery.error ? <p className="text-sm text-destructive">{listQuery.error.message}</p> : null}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
