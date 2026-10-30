'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  BIN_OPTIONS,
  STOCK_INBOUND_SOURCE_TYPES,
  confirmStockInboundShelve,
  countInboundsByStatus,
  createManualStockInbound,
  useStockInbounds,
} from '@/lib/crossborder/purchase-receipt-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const SKU_OPTIONS = ['HSY000001001', 'HSY000001002', 'HSY000002001']

function statusVariant(status: string) {
  if (status === '已上架') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function StockInboundsPage() {
  const inbounds = useStockInbounds()
  const rows = inbounds
  const counts = React.useMemo(() => countInboundsByStatus(inbounds), [inbounds])
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '入库单', value: String(rows.length), hint: '含采购/售后等来源' },
      { label: '待上架', value: String(counts.待上架), hint: '确认后写库存流水' },
      { label: '已上架', value: String(counts.已上架) },
      {
        label: '采购入库待上架',
        value: String(
          rows.filter((row) => row.sourceType === '采购入库' && row.status === '待上架').length,
        ),
      },
    ],
    [rows, counts],
  )

  function shelve(id: string) {
    const result = confirmStockInboundShelve(inbounds, id)
    setNotice(
      result.ok
        ? `${result.inbound.inboundNo} 已上架：库位 ${result.inbound.bin} 可用库存增加；流水幂等键 ${result.inbound.idempotencyKey}（原型）。`
        : result.reason,
    )
  }

  const editor = open ? (
    <UedDialog
      title="手工创建入库单"
      description="入库必须关联来源单据；采购入库请优先从「到货质检入库」完成质检自动生成。无来源的盘盈须选原因（原型简化为备注）。"
      fields={[
        {
          key: 'sourceType',
          label: '入库类型',
          options: [...STOCK_INBOUND_SOURCE_TYPES],
          required: true,
        },
        {
          key: 'sourceDoc',
          label: '来源单号',
          required: true,
          placeholder: '如 RCV-2026-0044 / AS-2026-0081',
          helper: '来源单不可为草稿（正式环境校验）',
        },
        { key: 'sku', label: '内部 SKU', options: SKU_OPTIONS, required: true },
        { key: 'quantity', label: '数量', type: 'number', required: true, defaultValue: '1' },
        { key: 'bin', label: '目标库位', options: [...BIN_OPTIONS], required: true },
        {
          key: 'qcResult',
          label: '质检结果',
          placeholder: '如 合格 98 / 残次 2',
        },
        { key: 'operator', label: '操作人', required: true, defaultValue: '当前用户' },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = createManualStockInbound(inbounds, {
          sourceType: (values.sourceType as (typeof STOCK_INBOUND_SOURCE_TYPES)[number]) || '采购入库',
          sourceDoc: values.sourceDoc || '',
          sku: values.sku || SKU_OPTIONS[0]!,
          quantity: Number(values.quantity || 1),
          bin: values.bin || BIN_OPTIONS[0]!,
          operator: values.operator,
          qcResult: values.qcResult,
          remark: values.remark,
        })
        setOpen(false)
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(`${result.inbound.inboundNo} 已创建（待上架）。`)
        router.push(`/console/stock-inbounds/${encodeURIComponent(result.inbound.id)}`)
      }}
      saveLabel="创建入库单"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="入库单"
        description="采购收货质检合格、售后回库、盘盈与调拨的统一入库入口；确认上架触发库存流水并回写采购投影。"
        rows={rows}
        detailHref={(row) => `/console/stock-inbounds/${encodeURIComponent(row.id)}`}
        searchKeys={[
          'id',
          'inboundNo',
          'sourceDoc',
          'sourceType',
          'sku',
          'bin',
          'operator',
          'status',
          'purchaseOrderId',
        ]}
        searchPlaceholder="搜索入库单号、来源单或 SKU"
        filters={[{ label: '状态', options: ['待上架', '已上架', '已取消'] }]}
        emptyText="暂无入库单。请先完成到货质检，或手工创建并关联来源单据。"
        addLabel="创建入库单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'inboundNo', label: '入库单号' },
          { key: 'sourceType', label: '入库类型' },
          { key: 'sourceDoc', label: '来源单据' },
          { key: 'sku', label: '内部 SKU' },
          {
            key: 'quantity',
            label: '数量',
            render: (row) => String(row.quantity),
          },
          { key: 'qcResult', label: '质检结果' },
          { key: 'bin', label: '目标库位' },
          { key: 'operator', label: '操作人' },
          { key: 'at', label: '时间' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <UedPrototypeNotice>
          每张入库单必须关联来源单据。采购路径：收货质检合格 → 自动生成待上架入库单 →
          确认上架写 inventory_ledger（幂等键）。重复提交被拦截。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.status === '待上架')
            .map((row) => (
              <Button key={row.id} size="sm" onClick={() => shelve(row.id)}>
                确认上架 · {row.inboundNo}
              </Button>
            ))}
          <Button size="sm" variant="ghost" onClick={() => router.push('/console/purchase-receipts')}>
            打开到货质检
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
