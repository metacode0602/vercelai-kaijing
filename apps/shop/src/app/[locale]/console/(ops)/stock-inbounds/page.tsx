'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function statusVariant(status: string) {
  if (status === '已上架') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function StockInboundsPage() {
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.purchase.listInbounds.useQuery({ page: 1, pageSize: 100 })
  const rows = listQuery.data?.items ?? []
  const counts = React.useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1
      return acc
    }, {})
  }, [rows])

  const kpiItems = React.useMemo(
    () => [
      { label: '入库单', value: String(rows.length), hint: '含采购入库' },
      { label: '待上架', value: String(counts['待上架'] ?? 0), hint: '确认后写库存流水' },
      { label: '已上架', value: String(counts['已上架'] ?? 0) },
      {
        label: '采购入库待上架',
        value: String(
          rows.filter((row) => row.sourceType === '采购入库' && row.status === '待上架').length,
        ),
      },
    ],
    [rows, counts],
  )

  const shelveMutation = trpc.purchase.confirmShelve.useMutation({
    onSuccess: async (inbound) => {
      await utils.purchase.listInbounds.invalidate()
      await utils.purchase.listOrders.invalidate()
      setNotice(
        `${inbound.inboundNo} 已上架：库位 ${inbound.bin}；流水幂等键 ${inbound.idempotencyKey}。`,
      )
    },
    onError: (error) => setNotice(error.message),
  })

  return (
    <UedWorkspace
      title="入库单"
      description="采购收货质检合格后自动生成待上架入库单；确认上架触发库存流水并回写采购投影。数据经 tRPC 写入 PostgreSQL。"
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
      emptyText="暂无入库单。请先完成到货质检生成待上架单。"
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
      {listQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{listQuery.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        采购路径：收货质检合格 → 自动生成待上架入库单 → 确认上架记账库存流水（幂等防重复）。其它来源的手工入库暂未支持，请走采购质检主路径。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows
          .filter((row) => row.status === '待上架')
          .map((row) => (
            <Button
              key={row.id}
              size="sm"
              disabled={shelveMutation.isPending}
              onClick={() => shelveMutation.mutate({ id: row.id })}
            >
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
  )
}
