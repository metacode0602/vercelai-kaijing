'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function statusVariant(status: string) {
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '待审批' || status === '草稿') return 'outline' as const
  if (status === '已过账') return 'secondary' as const
  return 'outline' as const
}

export default function StockAdjustmentsPage() {
  const utils = trpc.useUtils()
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.wms.listAdjustments.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.wms.adjustmentStats.useQuery()
  const metaQuery = trpc.wms.meta.useQuery()
  const warehousesQuery = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 50, status: '启用' })
  const binsQuery = trpc.wms.listBins.useQuery({ page: 1, pageSize: 100 })

  const createMut = trpc.wms.createAdjustment.useMutation({
    onSuccess: async (row) => {
      await Promise.all([utils.wms.listAdjustments.invalidate(), utils.wms.adjustmentStats.invalidate()])
      setOpen(false)
      setNotice(`已创建 ${row.adjustmentNo}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const approveMut = trpc.wms.approveAdjustment.useMutation({
    onSuccess: async () => {
      await utils.wms.listAdjustments.invalidate()
      await utils.wms.adjustmentStats.invalidate()
      setNotice('已通过')
    },
    onError: (e) => setNotice(e.message),
  })
  const postMut = trpc.wms.postAdjustment.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.wms.listAdjustments.invalidate(),
        utils.wms.adjustmentStats.invalidate(),
        utils.wms.listBalances.invalidate(),
        utils.wms.listMovements.invalidate(),
      ])
      setNotice(`${row.adjustmentNo} 已过账`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = listQuery.data?.items ?? []
  const counts = statsQuery.data?.byStatus ?? {}
  const warehouseOptions = (warehousesQuery.data?.items ?? []).map((w) => w.code)
  const binOptions = (binsQuery.data?.items ?? []).map((b) => b.code)

  const editor = open ? (
    <UedDialog
      title="发起盘点 / 调整"
      description="stock_adjustments：不直接改余额。待审批 → 已通过 → 已过账写 stock_adjust 流水。原因必填。"
      fields={[
        { key: 'kind', label: '调整类型', options: metaQuery.data?.adjustmentKinds ?? ['盘点'], required: true },
        {
          key: 'warehouse',
          label: '仓库',
          options: warehouseOptions.length ? warehouseOptions : ['WH-CN-XMN-001'],
          required: true,
        },
        { key: 'sku', label: 'SKU', required: true, placeholder: 'HSY000001001' },
        {
          key: 'bin',
          label: '库位',
          options: binOptions.length ? binOptions : ['A-01-01-01'],
          required: true,
        },
        { key: 'qtySystem', label: '账面数量', required: true },
        { key: 'qtyCounted', label: '实盘数量', required: true },
        { key: 'reason', label: '原因', required: true, type: 'textarea', fullWidth: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) =>
        createMut.mutate({
          kind: values.kind,
          warehouse: values.warehouse,
          reason: values.reason,
          remark: values.remark,
          lines: [
            {
              sku: values.sku,
              bin: values.bin,
              qtySystem: Number(values.qtySystem || 0),
              qtyCounted: Number(values.qtyCounted || 0),
            },
          ],
        })
      }
    />
  ) : null

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>库存调整已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          过账写 ledger:stock_adjust:*；不得把 on_hand 减到低于 reserved。{notice ? ` ${notice}` : ''}
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '调整单', value: String(statsQuery.data?.total ?? rows.length) },
          { label: '待审批', value: String(counts['待审批'] ?? 0) },
          { label: '已通过待过账', value: String(counts['已通过'] ?? 0) },
          { label: '已过账', value: String(counts['已过账'] ?? 0) },
        ]}
      />
      {editor}
      <UedWorkspace
        title="盘点与调整"
        description="stock_adjustments · tRPC → Postgres"
        rows={rows}
        detailHref={(row) => `/console/stock-adjustments/${encodeURIComponent(row.id)}`}
        searchKeys={['adjustmentNo', 'kind', 'warehouse', 'firstSku', 'status', 'reason']}
        searchPlaceholder="调整单号 / SKU / 原因"
        filters={[
          { label: '状态', options: ['草稿', '待审批', '已通过', '已过账', '已驳回', '已取消'] },
        ]}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无调整单'}
        onAdd={() => setOpen(true)}
        addLabel="发起调整"
        columns={[
          { key: 'adjustmentNo', label: '单号' },
          { key: 'kind', label: '类型' },
          { key: 'warehouse', label: '仓库' },
          { key: 'firstSku', label: '首行 SKU' },
          { key: 'totalDiff', label: '差异合计', render: (r) => String(r.totalDiff) },
          {
            key: 'status',
            label: '状态',
            render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
          },
          {
            key: 'id',
            label: '操作',
            render: (row) => (
              <div className="flex gap-1">
                {row.status === '待审批' ? (
                  <Button size="sm" variant="outline" onClick={() => approveMut.mutate({ id: row.id })}>
                    通过
                  </Button>
                ) : null}
                {row.status === '已通过' || row.status === '待审批' ? (
                  <Button size="sm" onClick={() => postMut.mutate({ id: row.id })}>
                    过账
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => router.push(`/console/stock-adjustments/${row.id}`)}>
                  详情
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
