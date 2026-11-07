'use client'

import * as React from 'react'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function PickingPage() {
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const [pickerFilter, setPickerFilter] = React.useState('all')
  const [assigningId, setAssigningId] = React.useState<string | null>(null)
  const [assignName, setAssignName] = React.useState('')

  const listQuery = trpc.order.listOutbounds.useQuery({ page: 1, pageSize: 100 })
  const pickersQuery = trpc.order.listPickers.useQuery()

  const advanceMutation = trpc.order.advanceOutbound.useMutation({
    onSuccess: async (row) => {
      await utils.order.listOutbounds.invalidate()
      setNotice(
        row.status === '已出库'
          ? `${row.packageId || row.outboundNo} 已出库过账，写入 order_ship 流水`
          : `${row.packageId || row.outboundNo} 已推进至「${row.status}」`,
      )
    },
    onError: (e) => setNotice(e.message),
  })

  const assignMutation = trpc.order.assignPicker.useMutation({
    onSuccess: async (row) => {
      await utils.order.listOutbounds.invalidate()
      await utils.order.listPickers.invalidate()
      setNotice(`${row.outboundNo} 已分配拣货人 ${row.picker}`)
      setAssigningId(null)
      setAssignName('')
    },
    onError: (e) => setNotice(e.message),
  })

  const allRows = (listQuery.data?.items ?? []).map((ob) => ({
    id: ob.id,
    packageId: ob.packageId || ob.outboundNo,
    outboundNo: ob.outboundNo,
    order: ob.externalOrderId,
    orderId: ob.orderId,
    status: ob.status,
    picker: ob.picker || '—',
    warehouse: ob.warehouse,
    skus: ob.firstSku,
    items: ob.totalQty,
    createdAt: ob.createdAt,
  }))

  const rows = React.useMemo(() => {
    if (pickerFilter === 'all') return allRows
    if (pickerFilter === 'unassigned') return allRows.filter((r) => r.picker === '—')
    return allRows.filter((r) => r.picker === pickerFilter)
  }, [allRows, pickerFilter])

  const pickers = pickersQuery.data ?? []

  return (
    <>
      <Alert className="mb-4">
        <AlertTitle>拣货打包 = 出库单作业视图</AlertTitle>
        <AlertDescription>
          主路径已切 tRPC / PostgreSQL（stock_outbounds）。请先在订单详情「确认占库」后「创建出库 / 拣货单」。
          推进至「已出库」会过账扣减 on_hand / reserved。可按拣货人筛选并分配。
        </AlertDescription>
      </Alert>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">拣货人：</span>
        <Button
          size="sm"
          variant={pickerFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setPickerFilter('all')}
        >
          全部
        </Button>
        <Button
          size="sm"
          variant={pickerFilter === 'unassigned' ? 'default' : 'outline'}
          onClick={() => setPickerFilter('unassigned')}
        >
          未分配
        </Button>
        {pickers.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={pickerFilter === p ? 'default' : 'outline'}
            onClick={() => setPickerFilter(p)}
          >
            {p}
          </Button>
        ))}
      </div>
      <UedWorkspace
        title="拣货打包"
        description="出库单状态机：待拣货 → 拣货中 → 已复核 → 已出库（过账）。数据来自 PostgreSQL。"
        rows={rows}
        detailHref={(row) => `/console/picking/${encodeURIComponent(row.id)}`}
        searchKeys={['packageId', 'outboundNo', 'order', 'picker', 'skus', 'status']}
        searchPlaceholder="搜索包裹 / 出库单 / 订单"
        filters={[{ label: '状态', options: ['待拣货', '拣货中', '已复核', '已出库', '已取消'] }]}
        emptyText={
          listQuery.isLoading
            ? '加载中…'
            : '暂无拣货任务。请到订单详情创建出库单，或查看出库单列表。'
        }
        columns={[
          { key: 'packageId', label: '包裹 / 拣货单' },
          { key: 'outboundNo', label: '出库单号' },
          {
            key: 'order',
            label: '订单',
            render: (row) => (
              <LocaleLink
                href={`/console/orders/${encodeURIComponent(row.orderId || row.order)}`}
                className="underline-offset-2 hover:underline"
              >
                {row.order || '—'}
              </LocaleLink>
            ),
          },
          { key: 'skus', label: '首行 SKU' },
          {
            key: 'items',
            label: '件数',
            render: (row) => String(row.items),
          },
          { key: 'warehouse', label: '仓库' },
          {
            key: 'picker',
            label: '拣货人',
            render: (row) =>
              assigningId === row.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={assignName}
                    onChange={(e) => setAssignName(e.target.value)}
                    placeholder="输入拣货人"
                    className="h-7 w-24 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && assignName.trim()) {
                        assignMutation.mutate({ id: row.id, picker: assignName.trim() })
                      }
                      if (e.key === 'Escape') {
                        setAssigningId(null)
                        setAssignName('')
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="default"
                    disabled={!assignName.trim() || assignMutation.isPending}
                    onClick={() =>
                      assignName.trim() &&
                      assignMutation.mutate({ id: row.id, picker: assignName.trim() })
                    }
                  >
                    确定
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAssigningId(null)
                      setAssignName('')
                    }}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                <span>{row.picker}</span>
              ),
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '已出库' ? 'secondary' : row.status === '已取消' ? 'destructive' : 'outline'}>
                {row.status}
              </Badge>
            ),
          },
          {
            key: 'id',
            label: '操作',
            render: (row) => {
              if (row.status === '已出库' || row.status === '已取消') {
                return (
                  <LocaleLink
                    href={`/console/stock-outbounds/${encodeURIComponent(row.id)}`}
                    className="text-xs underline-offset-2 hover:underline"
                  >
                    查看出库
                  </LocaleLink>
                )
              }
              return (
                <div className="flex gap-1">
                  {assigningId !== row.id && row.picker === '—' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAssigningId(row.id)
                        setAssignName('')
                      }}
                    >
                      分配拣货人
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={advanceMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault()
                      advanceMutation.mutate({ id: row.id })
                    }}
                  >
                    推进
                  </Button>
                </div>
              )
            },
          },
        ]}
      />
      <div className="mt-3 flex gap-2">
        <Button variant="outline" asChild>
          <LocaleLink href="/console/orders">返回订单</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href="/console/stock-outbounds">出库单列表</LocaleLink>
        </Button>
      </div>
      {notice ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </>
  )
}
