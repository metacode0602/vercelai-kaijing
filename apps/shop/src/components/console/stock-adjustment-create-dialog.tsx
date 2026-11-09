'use client'

import * as React from 'react'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'

/**
 * 发起盘点/调整的共享对话框。
 *
 * 多入口复用：库存汇总列表行、库存汇总详情、库存流水列表顶部、入库单详情（质检残次）、
 * 海运柜次详情（到仓残次）。调用方传入 `context` 字段时，对应字段以只读形式代入，
 * 用户只需填写调整类型、实盘数量、原因等必填项即可提交。
 *
 * 提交后调用 `wms.createAdjustment`，单据进入 `pending_approval` 状态，
 * 由审批人在 `/console/stock-adjustments/[id]` 详情页审批 → 过账写 `stock_adjust` 流水。
 */

export type StockAdjustmentContext = {
  sku?: string
  warehouse?: string
  bin?: string
  /** 账面数量；通常来自 inventory_balances.on_hand 或 stock_inbounds.quantity */
  qtySystem?: number
}

export type StockAdjustmentCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  context?: StockAdjustmentContext
  /** 创建成功后的回调，参数为调整单号 */
  onCreated?: (adjustmentNo: string) => void
}

export function StockAdjustmentCreateDialog({
  open,
  onOpenChange,
  context,
  onCreated,
}: StockAdjustmentCreateDialogProps) {
  const utils = trpc.useUtils()
  const metaQuery = trpc.wms.meta.useQuery(undefined, { enabled: open })
  const warehousesQuery = trpc.wms.listWarehouses.useQuery(
    { page: 1, pageSize: 50, status: '启用' },
    { enabled: open },
  )
  const binsQuery = trpc.wms.listBins.useQuery(
    {
      page: 1,
      pageSize: 100,
      warehouse: context?.warehouse,
      status: '启用',
    },
    { enabled: open },
  )

  const createMut = trpc.wms.createAdjustment.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.wms.listAdjustments.invalidate(),
        utils.wms.adjustmentStats.invalidate(),
        utils.wms.listBalances.invalidate(),
        utils.wms.listMovements.invalidate(),
      ])
      onOpenChange(false)
      onCreated?.(row.adjustmentNo)
    },
  })

  const kindOptions = metaQuery.data?.adjustmentKinds ?? ['盘点', '报损', '手工入库', '手工出库', '复盘']
  const warehouseOptions = (warehousesQuery.data?.items ?? []).map((w) => w.code)
  const binOptions = (binsQuery.data?.items ?? []).map((b) => b.code)

  // 上下文代入：来自具体余额/入库单/柜次行时，sku/仓/库位/账面 锁定只读，
  // 用户只填类型、实盘、原因、备注。
  const hasContext = Boolean(context && (context.sku || context.warehouse || context.bin))

  if (!open) return null

  return (
    <UedDialog
      title="发起盘点 / 调整"
      description={
        hasContext
          ? '已代入上下文（只读）。填写调整类型、实盘数量与原因后保存，单据进入待审批。审批通过后过账写 stock_adjust 流水。'
          : 'stock_adjustments：不直接改余额。待审批 → 已通过 → 已过账写 stock_adjust 流水。原因必填。'
      }
      fields={[
        { key: 'kind', label: '调整类型', options: kindOptions, required: true },
        {
          key: 'warehouse',
          label: '仓库',
          options: warehouseOptions.length ? warehouseOptions : ['WH-CN-XMN-001'],
          defaultValue: context?.warehouse,
          required: true,
          readOnly: Boolean(context?.warehouse),
        },
        {
          key: 'sku',
          label: 'SKU',
          placeholder: '如 HSY000001001',
          defaultValue: context?.sku,
          required: true,
          readOnly: Boolean(context?.sku),
        },
        {
          key: 'bin',
          label: '库位',
          options: binOptions.length ? binOptions : context?.bin ? [context.bin] : ['A-01-01-01'],
          defaultValue: context?.bin,
          required: true,
          readOnly: Boolean(context?.bin),
        },
        {
          key: 'qtySystem',
          label: '账面数量',
          placeholder: '系统余额',
          defaultValue: context?.qtySystem !== undefined ? String(context.qtySystem) : '',
          required: true,
          readOnly: context?.qtySystem !== undefined,
          helper: hasContext ? '来自上下文，不可改' : '填写当前账面数量',
        },
        { key: 'qtyCounted', label: '实盘数量', required: true, placeholder: '实盘或目标数量' },
        { key: 'reason', label: '原因', required: true, type: 'textarea', fullWidth: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => onOpenChange(false)}
      onSave={(values) => {
        const qtySystem = Number(values.qtySystem || 0)
        const qtyCounted = Number(values.qtyCounted || 0)
        createMut.mutate({
          kind: values.kind,
          warehouse: values.warehouse,
          reason: values.reason,
          remark: values.remark || undefined,
          lines: [
            {
              sku: values.sku,
              bin: values.bin,
              qtySystem: Number.isFinite(qtySystem) ? qtySystem : 0,
              qtyCounted: Number.isFinite(qtyCounted) ? qtyCounted : 0,
            },
          ],
        })
      }}
    />
  )
}

/** 便捷 hook：管理对话框开关状态，避免每个入口重复 useState。 */
export function useStockAdjustmentDialog() {
  const [open, setOpen] = React.useState(false)
  const [context, setContext] = React.useState<StockAdjustmentContext | undefined>(undefined)
  const [notice, setNotice] = React.useState('')

  const openWith = React.useCallback((ctx?: StockAdjustmentContext) => {
    setContext(ctx)
    setNotice('')
    setOpen(true)
  }, [])

  const dialog = (
    <StockAdjustmentCreateDialog
      open={open}
      onOpenChange={setOpen}
      context={context}
      onCreated={(adjustmentNo) => setNotice(`已创建调整单 ${adjustmentNo}，待审批`)}
    />
  )

  return { openWith, dialog, notice, setNotice }
}
