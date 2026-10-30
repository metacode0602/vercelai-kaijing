'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  OUTBOUND_STATUSES,
  OUTBOUND_TYPES,
  SKU_OPTIONS,
  advanceStockOutbound,
  cancelStockOutbound,
  countOutboundsByStatus,
  createStockOutbound,
  toOutboundListRow,
  useBins,
  useStockOutbounds,
  useWarehouses,
} from '@/lib/crossborder/wms-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '已出库') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function StockOutboundsPage() {
  const outbounds = useStockOutbounds()
  const warehouses = useWarehouses()
  const bins = useBins()
  const rows = React.useMemo(() => outbounds.map(toOutboundListRow), [outbounds])
  const counts = React.useMemo(() => countOutboundsByStatus(outbounds), [outbounds])
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '出库单', value: String(rows.length) },
      { label: '待拣货', value: String(counts.待拣货) },
      { label: '作业中', value: String(counts.拣货中 + counts.已复核) },
      { label: '已出库', value: String(counts.已出库) },
    ],
    [rows.length, counts],
  )

  const activeBins = bins.filter((item) => item.status !== '停用').map((item) => item.code)
  const warehouseOptions = warehouses.filter((item) => item.status === '启用').map((item) => item.code)

  const editor = open ? (
    <UedDialog
      title="创建出库单"
      description="正常订单出库由履约任务生成；手工建单需选择出库类型并说明关联单据。头→行：仓库 + 明细 SKU/库位/数量。"
      fields={[
        { key: 'outboundType', label: '出库类型', options: [...OUTBOUND_TYPES], required: true },
        {
          key: 'warehouse',
          label: '仓库',
          options: warehouseOptions.length ? warehouseOptions : ['WH-CN-XMN-001'],
          required: true,
        },
        { key: 'order', label: '订单 / 关联单号', required: true, placeholder: '如 DZ-10021' },
        { key: 'packageId', label: '包裹 ID', placeholder: '可空，默认 PKG-{单号}' },
        { key: 'sku', label: '内部 SKU', options: [...SKU_OPTIONS], required: true },
        { key: 'quantity', label: '数量', type: 'number', required: true, defaultValue: '1' },
        {
          key: 'bin',
          label: '拣货库位',
          options: activeBins.length ? activeBins : ['A-01-01-01'],
          required: true,
        },
        { key: 'picker', label: '拣货人', required: true, defaultValue: '当前用户' },
        { key: 'reason', label: '手工建单原因', type: 'textarea', required: true, fullWidth: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = createStockOutbound({
          outboundType: (values.outboundType as (typeof OUTBOUND_TYPES)[number]) || '订单出库',
          warehouse: values.warehouse || 'WH-CN-XMN-001',
          order: values.order || '',
          packageId: values.packageId,
          picker: values.picker,
          reason: values.reason,
          remark: values.remark,
          lines: [
            {
              sku: values.sku || SKU_OPTIONS[0]!,
              quantity: Number(values.quantity || 1),
              bin: values.bin || 'A-01-01-01',
            },
          ],
        })
        setOpen(false)
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(`${result.outbound.outboundNo} 已创建（待拣货）。`)
        router.push(`/console/stock-outbounds/${encodeURIComponent(result.outbound.id)}`)
      }}
      saveLabel="创建出库单"
    />
  ) : null

  function advance(id: string) {
    const result = advanceStockOutbound(id)
    setNotice(result.ok ? `${result.outbound.outboundNo} → ${result.outbound.status}` : result.reason)
  }

  function cancel(id: string) {
    const result = cancelStockOutbound(id, '列表取消')
    setNotice(result.ok ? `${result.outbound.outboundNo} 已取消` : result.reason)
  }

  return (
    <>
      {editor}
      <UedWorkspace
        title="出库单"
        description="订单出库与手工出库统一登记：待拣货 → 拣货中 → 已复核 → 已出库；过账写 inventory_ledger（order_ship）并扣减余额。"
        rows={rows}
        detailHref={(row) => `/console/stock-outbounds/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'outboundNo', 'order', 'packageId', 'sku', 'picker', 'status', 'outboundType']}
        searchPlaceholder="搜索出库单号、订单或包裹"
        filters={[{ label: '状态', options: [...OUTBOUND_STATUSES] }]}
        emptyText="暂无出库单。未映射订单不占库、不生成出库——先在订单异常修复映射。"
        addLabel="创建出库单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'outboundNo', label: '出库单号' },
          { key: 'outboundType', label: '类型' },
          { key: 'order', label: '订单号' },
          { key: 'packageId', label: '包裹号' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'quantity', label: '数量', render: (row) => String(row.quantity) },
          { key: 'bin', label: '拣货库位' },
          { key: 'picker', label: '拣货人' },
          { key: 'createdAt', label: '创建时间' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <UedPrototypeNotice>
          出库扣减与库存流水同事务一致；同一出库单重复过账被幂等键拦截。已出库不可取消，冲正请走调整单。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.status !== '已出库' && row.status !== '已取消')
            .map((row) => (
              <React.Fragment key={row.id}>
                <Button size="sm" variant="outline" onClick={() => advance(row.id)}>
                  推进 · {row.outboundNo}（{row.status}）
                </Button>
                {row.status === '待拣货' ? (
                  <Button size="sm" variant="ghost" onClick={() => cancel(row.id)}>
                    取消
                  </Button>
                ) : null}
              </React.Fragment>
            ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
