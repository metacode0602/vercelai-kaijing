'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { SyncConfirmDialog } from '@/components/console/sync-confirm-dialog'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'

const eventOptions = ['LGS 揽收', '出境干线', '清关中', '清关完成', '官方尾程派送', '已签收', '物流异常']
const siteOptions = ['MY', 'PH', 'SG', 'VN', 'LK']

export default function LogisticsLgsPage() {
  const utils = trpc.useUtils()
  const [selected, setSelected] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [submitConfirmOpen, setSubmitConfirmOpen] = React.useState(false)
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.logistics.listBatches.useQuery({ page: 1, pageSize: 100, channel: 'lgs' })
  const carriersQuery = trpc.carriers.list.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const carrierOptions = (carriersQuery.data?.items ?? []).map((c) => ({
    value: c.id,
    title: `${c.code} · ${c.name}`,
  }))
  const detailQuery = trpc.logistics.getBatch.useQuery(
    { id: selected },
    { enabled: Boolean(selected) },
  )

  const createMutation = trpc.logistics.createBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.listBatches.invalidate()
      setSelected(row.id)
      setNotice(`已创建 LGS 批次 ${row.batchNo}`)
      setCreateOpen(false)
    },
    onError: (e) => setNotice(e.message),
  })
  const appendMutation = trpc.logistics.appendBatchEvent.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.listBatches.invalidate()
      await utils.logistics.getBatch.invalidate({ id: row.id })
      setSelected(row.id)
      setNotice(`已追加事件到 ${row.batchNo}`)
      setOpen(false)
    },
    onError: (e) => setNotice(e.message),
  })
  const submitMutation = trpc.logistics.submitBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.listBatches.invalidate()
      setNotice(`批次 ${row.batchNo} 已提交交运（apps/api → 平台 OpenAPI）`)
    },
    onError: (e) => setNotice(e.message),
  })
  const closeMutation = trpc.logistics.closeBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.listBatches.invalidate()
      setNotice(`批次 ${row.batchNo} 已关闭`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = (listQuery.data?.items ?? []).map((row) => ({
    ...row,
    id: row.batchNo,
    batchId: row.id,
    handedOver: row.handedOver,
    tracking: row.tracking,
    packages: row.packages,
    status: row.statusLabel,
  }))

  React.useEffect(() => {
    if (!selected && listQuery.data?.items[0]) setSelected(listQuery.data.items[0].id)
  }, [selected, listQuery.data])

  const current = detailQuery.data

  const editor = open ? (
    <UedDialog
      title="追加 LGS 履约事件"
      description="事件写入批次 raw.events；可同步标记状态。不会调用真实平台接口。"
      fields={[
        { key: 'event', label: '履约事件', options: eventOptions, required: true },
        { key: 'eventAt', label: '事件时间', type: 'datetime-local', required: true },
        { key: 'tracking', label: '运单号', placeholder: '可填写单个运单或批次号' },
        {
          key: 'carrierId',
          label: '承运商',
          options: carrierOptions.length
            ? carrierOptions
            : [{ value: '', title: '暂无启用承运商' }],
          required: true,
        },
        { key: 'operator', label: '操作人', required: true },
        { key: 'exception', label: '异常说明', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        if (!selected) return
        const status =
          values.event === '已签收'
            ? 'delivered'
            : values.event === '物流异常'
              ? 'exception'
              : values.event.includes('清关') || values.event.includes('揽收') || values.event.includes('干线')
                ? 'in_transit'
                : undefined
        appendMutation.mutate({
          batchId: selected,
          event: values.event,
          eventAt: values.eventAt,
          tracking: values.tracking,
          carrierId: values.carrierId || null,
          operator: values.operator,
          exception: values.exception,
          status,
        })
      }}
    />
  ) : null

  const creator = createOpen ? (
    <UedDialog
      title="新建 LGS 交接批次"
      description="providerType/channel=lgs；包裹通过 junction 加入批次。"
      fields={[
        { key: 'batchNo', label: '批次号', placeholder: '留空自动生成' },
        { key: 'site', label: '站点', options: siteOptions, required: true },
        {
          key: 'carrierId',
          label: '承运商',
          options: carrierOptions.length
            ? carrierOptions
            : [{ value: '', title: '暂无启用承运商，请先在仓储中心维护' }],
          required: true,
        },
        { key: 'warehouse', label: '发货仓', options: ['WH-CN-XMN-001'], required: true },
        { key: 'trackingSummary', label: '运单摘要', placeholder: '如 LGS-MY-77120 等 5 单' },
      ]}
      onClose={() => setCreateOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          batchNo: values.batchNo || undefined,
          channel: 'lgs',
          site: values.site,
          country: values.site,
          carrierId: values.carrierId || null,
          warehouseCode: values.warehouse,
          trackingSummary: values.trackingSummary,
        })
      }}
    />
  ) : null

  return (
    <>
      {editor}
      {creator}
      <UedWorkspace
        title="LGS 物流"
        description="MY / PH / SG / VN 等站点的 LGS 交接批次、轨迹与签收（已接 PostgreSQL）。"
        rows={rows}
        detailHref={(row) => `/console/logistics-lgs/${encodeURIComponent(row.batchId)}`}
        searchKeys={['id', 'site', 'carrier', 'tracking', 'status']}
        searchPlaceholder="搜索批次号、站点或运单号"
        filters={[{ label: '状态', options: ['开放中', '已提交', '运输中', '已签收', '物流异常'] }]}
        addLabel="新建交接批次"
        onAdd={() => setCreateOpen(true)}
        columns={[
          { key: 'id', label: '交接批次' },
          { key: 'site', label: '站点' },
          { key: 'packages', label: '包裹数', render: (row) => String(row.packages) },
          {
            key: 'carrier',
            label: '承运商',
            render: (row) => {
              const c = (carriersQuery.data?.items ?? []).find((x) => x.id === row.carrierId)
              return c ? c.code : row.carrier || '—'
            },
          },
          { key: 'handedOver', label: '交接时间' },
          { key: 'tracking', label: '运单号' },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '物流异常' ? 'destructive' : 'secondary'}>{row.status}</Badge>
            ),
          },
        ]}
      >
        <UedPrototypeNotice>
          提交交接会走平台真实交运；没有交运凭证时会如实报错，不会标记成功。
        </UedPrototypeNotice>
        {listQuery.isLoading ? <p className="text-sm text-muted-foreground">加载中…</p> : null}
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <Button
              key={row.batchId}
              variant={selected === row.batchId ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSelected(row.batchId)}
            >
              {row.site} · {row.status}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!selected}>
            录入履约事件
          </Button>
        </div>
        {current ? (
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">{current.batchNo}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {current.carrier} · {current.packageCount} 个包裹 · {current.trackingSummary || '—'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{current.statusLabel}</Badge>
                <Button size="sm" variant="outline" disabled={submitMutation.isPending} onClick={() => setSubmitConfirmOpen(true)}>
                  提交交接
                </Button>
                <Button size="sm" variant="ghost" disabled={closeMutation.isPending} onClick={() => setCloseConfirmOpen(true)}>
                  关闭批次
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <LocaleLink href={`/console/logistics-lgs/${encodeURIComponent(current.id)}`}>详情</LocaleLink>
                </Button>
              </div>
            </div>
            <ol className="mt-4 flex flex-col gap-2 border-l pl-4">
              {current.events.length > 0 ? (
                current.events.map((event, index) => (
                  <li key={`${event}-${index}`} className="text-sm">
                    {event}
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">暂无批次事件</li>
              )}
            </ol>
            {current.packages.length > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                包裹：{current.packages.map((p) => p.externalPackageId).join('、')}
              </p>
            ) : null}
          </div>
        ) : null}
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
      {current ? (
        <>
          <SyncConfirmDialog
            open={submitConfirmOpen}
            onOpenChange={setSubmitConfirmOpen}
            title="提交 LGS 交运"
            description="将批次内所有包裹提交到平台，标记为已发货。"
            scope={{
              label: '作用批次',
              value: `批次 ${current.batchNo} · ${current.packageCount} 个包裹 · ${current.carrier}`,
            }}
            impacts={[
              '提交后平台侧会标记这些订单为已发货，不可撤销',
              '成功包裹的 shipment 状态会推进为 shipped',
              '全部成功 → 批次状态 accepted；部分失败 → rejected（可修正后重提）',
            ]}
            platformCall={{
              label: '将调用平台 OpenAPI',
              detail: 'Lazop /order/fulfill/pack + /order/package/rts',
            }}
            confirmLabel="确认提交交运"
            destructive
            pending={submitMutation.isPending}
            onConfirm={() => {
              setSubmitConfirmOpen(false)
              submitMutation.mutate({ id: current.id })
            }}
          />
          <SyncConfirmDialog
            open={closeConfirmOpen}
            onOpenChange={setCloseConfirmOpen}
            title="关闭批次"
            description="关闭该批次，后续不可再追加包裹或提交交运。"
            scope={{
              label: '作用批次',
              value: `批次 ${current.batchNo} · ${current.packageCount} 个包裹`,
            }}
            impacts={[
              '批次状态变更为 closed，不可逆',
              '已关联的 shipment 不受影响',
            ]}
            confirmLabel="确认关闭"
            destructive
            pending={closeMutation.isPending}
            onConfirm={() => {
              setCloseConfirmOpen(false)
              closeMutation.mutate({ id: current.id })
            }}
          />
        </>
      ) : null}
    </>
  )
}
