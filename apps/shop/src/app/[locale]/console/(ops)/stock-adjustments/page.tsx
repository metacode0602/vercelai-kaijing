'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  ADJUSTMENT_KINDS,
  ADJUSTMENT_STATUSES,
  SKU_OPTIONS,
  approveStockAdjustment,
  countAdjustmentsByStatus,
  createStockAdjustment,
  postStockAdjustment,
  rejectStockAdjustment,
  toAdjustmentListRow,
  useBins,
  useStockAdjustments,
  useWarehouses,
} from '@/lib/crossborder/wms-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '待审批' || status === '草稿') return 'outline' as const
  if (status === '已过账') return 'secondary' as const
  return 'outline' as const
}

export default function StockAdjustmentsPage() {
  const adjustments = useStockAdjustments()
  const warehouses = useWarehouses()
  const bins = useBins()
  const rows = React.useMemo(() => adjustments.map(toAdjustmentListRow), [adjustments])
  const counts = React.useMemo(() => countAdjustmentsByStatus(adjustments), [adjustments])
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '调整单', value: String(rows.length) },
      { label: '待审批', value: String(counts.待审批) },
      { label: '已通过待过账', value: String(counts.已通过) },
      { label: '已过账', value: String(counts.已过账) },
    ],
    [rows.length, counts],
  )

  const warehouseOptions = warehouses.filter((item) => item.status === '启用').map((item) => item.code)
  const binOptions = bins.filter((item) => item.status !== '停用').map((item) => item.code)

  const editor = open ? (
    <UedDialog
      title="发起盘点 / 调整"
      description="对应 stock_adjustments：不直接改余额。草稿 → 待审批 → 已通过 → 已过账写流水。原因必填。"
      fields={[
        { key: 'kind', label: '调整类型', options: [...ADJUSTMENT_KINDS], required: true },
        {
          key: 'warehouse',
          label: '仓库',
          options: warehouseOptions.length ? warehouseOptions : ['WH-CN-XMN-001'],
          required: true,
        },
        { key: 'sku', label: '内部 SKU', options: [...SKU_OPTIONS], required: true },
        {
          key: 'bin',
          label: '库位',
          options: binOptions.length ? binOptions : ['A-01-01-01'],
          required: true,
        },
        {
          key: 'qtyCounted',
          label: '实盘数量',
          type: 'number',
          required: true,
          helper: '系统将按账面自动算差异；报损可填小于账面的数',
        },
        { key: 'reason', label: '原因 / 证据单号', type: 'textarea', required: true, fullWidth: true },
        { key: 'applicant', label: '申请人', required: true, defaultValue: '当前用户' },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
        {
          key: 'submit',
          label: '提交方式',
          options: ['保存草稿', '直接提交审批'],
          required: true,
          defaultValue: '直接提交审批',
        },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = createStockAdjustment({
          kind: (values.kind as (typeof ADJUSTMENT_KINDS)[number]) || '盘点',
          warehouse: values.warehouse || 'WH-CN-XMN-001',
          reason: values.reason || '',
          applicant: values.applicant,
          remark: values.remark,
          submit: values.submit !== '保存草稿',
          lines: [
            {
              sku: values.sku || SKU_OPTIONS[0]!,
              bin: values.bin || 'A-01-01-01',
              qtyCounted: Number(values.qtyCounted || 0),
            },
          ],
        })
        setOpen(false)
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(
          `${result.adjustment.adjustmentNo} 已${result.adjustment.status === '草稿' ? '保存草稿' : '提交审批'}。`,
        )
        router.push(`/console/stock-adjustments/${encodeURIComponent(result.adjustment.id)}`)
      }}
      saveLabel="创建调整单"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="盘点与调整"
        description="stock_adjustments：盘点、报损、手工入出库。审批通过后过账写 inventory_ledger（stocktake_diff / manual_adjust）。"
        rows={rows}
        detailHref={(row) => `/console/stock-adjustments/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'adjustmentNo', 'kind', 'sku', 'bin', 'applicant', 'status', 'reason']}
        searchPlaceholder="搜索调整单号、类型或 SKU"
        filters={[{ label: '状态', options: [...ADJUSTMENT_STATUSES] }]}
        emptyText="暂无调整单。余额异常时请发起盘点或报损，禁止直改余额。"
        addLabel="发起盘点 / 调整"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'adjustmentNo', label: '调整单号' },
          { key: 'kind', label: '类型' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'warehouse', label: '仓库' },
          { key: 'bin', label: '库位' },
          { key: 'before', label: '账面', render: (row) => String(row.before) },
          {
            key: 'delta',
            label: '差异',
            render: (row) => (
              <span className={row.delta < 0 ? 'text-destructive' : undefined}>
                {row.delta > 0 ? `+${row.delta}` : row.delta}
              </span>
            ),
          },
          { key: 'after', label: '实盘投影', render: (row) => String(row.after) },
          { key: 'reason', label: '原因' },
          { key: 'applicant', label: '申请人' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <UedPrototypeNotice>
          状态机：草稿 → 待审批 → 已通过 → 已过账；可驳回 / 取消。审批门槛（数量/金额）待 Q11。更正历史一律反向流水。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.status === '待审批')
            .map((row) => (
              <React.Fragment key={row.id}>
                <Button
                  size="sm"
                  onClick={() => {
                    const result = approveStockAdjustment(row.id)
                    setNotice(result.ok ? `${row.adjustmentNo} 已通过` : result.reason)
                  }}
                >
                  通过 · {row.adjustmentNo}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const result = rejectStockAdjustment(row.id, '列表驳回：请补充证据')
                    setNotice(result.ok ? `${row.adjustmentNo} 已驳回` : result.reason)
                  }}
                >
                  驳回
                </Button>
              </React.Fragment>
            ))}
          {rows
            .filter((row) => row.status === '已通过')
            .map((row) => (
              <Button
                key={`post-${row.id}`}
                size="sm"
                variant="secondary"
                onClick={() => {
                  const result = postStockAdjustment(row.id)
                  setNotice(result.ok ? `${row.adjustmentNo} 已过账写流水` : result.reason)
                }}
              >
                过账 · {row.adjustmentNo}
              </Button>
            ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
