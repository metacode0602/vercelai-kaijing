'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'

const eventOptions = ['自营仓出库', '交接 JSB', '清关资料提交', '清关中', '清关完成', '官方尾程派送', '已签收', '物流异常']

export default function LogisticsJsbPage() {
  const utils = trpc.useUtils()
  const [selected, setSelected] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.logistics.listBatches.useQuery({ page: 1, pageSize: 100, channel: 'jsb' })
  const detailQuery = trpc.logistics.getBatch.useQuery(
    { id: selected },
    { enabled: Boolean(selected) },
  )

  const createMutation = trpc.logistics.createBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.listBatches.invalidate()
      setSelected(row.id)
      setNotice(`已创建 JSB 批次 ${row.batchNo}`)
      setCreateOpen(false)
    },
    onError: (e) => setNotice(e.message),
  })
  const appendMutation = trpc.logistics.appendBatchEvent.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.listBatches.invalidate()
      await utils.logistics.getBatch.invalidate({ id: row.id })
      setSelected(row.id)
      setNotice(`TH 链路节点已写入 ${row.batchNo}`)
      setOpen(false)
    },
    onError: (e) => setNotice(e.message),
  })
  const submitMutation = trpc.logistics.submitBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.listBatches.invalidate()
      setNotice(`批次 ${row.batchNo} 已提交交接`)
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
    packages: row.packages,
    departedAt: row.departedAt || row.createdAt || '—',
    jsbHandover: row.jsbHandover || row.handedOver || '—',
    customs: row.customs || '—',
    lastMile: row.lastMile || '—',
    signedAt: row.signedAt || '—',
    fee: row.fee || '—',
    status: row.statusLabel,
  }))

  React.useEffect(() => {
    if (!selected && listQuery.data?.items[0]) setSelected(listQuery.data.items[0].id)
  }, [selected, listQuery.data])

  const current = detailQuery.data

  const editor = open ? (
    <UedDialog
      title="补录 TH 链路节点"
      description="JSB 无可靠 API（Q17）：节点以 source=import/manual 写入；本页写入批次事件。"
      fields={[
        { key: 'event', label: '链路节点', options: eventOptions, required: true },
        { key: 'eventAt', label: '节点时间', type: 'datetime-local', required: true },
        { key: 'fee', label: '费用（含币种）', placeholder: '如 THB 1,240' },
        { key: 'operator', label: '操作人', options: ['杨洁', '黄发聪'], required: true },
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
              : values.event.includes('清关') || values.event.includes('尾程') || values.event.includes('交接')
                ? 'in_transit'
                : undefined
        appendMutation.mutate({
          batchId: selected,
          event: values.event,
          eventAt: values.eventAt,
          operator: values.operator,
          exception: values.exception,
          status,
        })
      }}
    />
  ) : null

  const creator = createOpen ? (
    <UedDialog
      title="新建 JSB 灰清批次"
      description="channel=jsb_th；支持人工批量导入轨迹。"
      fields={[
        { key: 'batchNo', label: '批次号', placeholder: '留空自动生成' },
        { key: 'carrier', label: '承运商', options: ['JSB'], required: true },
        { key: 'warehouse', label: '发货仓', options: ['WH-CN-XMN-001'], required: true },
        { key: 'fee', label: '费用提示', placeholder: '如 THB 1,240' },
        { key: 'trackingSummary', label: '运单摘要' },
      ]}
      onClose={() => setCreateOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          batchNo: values.batchNo || undefined,
          channel: 'jsb_th',
          site: 'TH',
          country: 'TH',
          carrier: values.carrier || 'JSB',
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
        title="JSB 与 TH 物流"
        description="TH 站点自营仓发货全链路：出库 → 交接 JSB → 清关 → 官方尾程 → 签收（已接 PostgreSQL）。"
        rows={rows}
        detailHref={(row) => `/console/logistics-jsb/${encodeURIComponent(row.batchId)}`}
        searchKeys={['id', 'status', 'customs', 'lastMile', 'signedAt', 'fee']}
        searchPlaceholder="搜索批次号、清关状态或费用"
        filters={[{ label: '状态', options: ['开放中', '清关中', '运输中', '已签收', '物流异常'] }]}
        addLabel="新建灰清批次"
        onAdd={() => setCreateOpen(true)}
        columns={[
          { key: 'id', label: '交接批次' },
          { key: 'packages', label: '包裹数', render: (row) => String(row.packages) },
          { key: 'departedAt', label: '出库' },
          { key: 'jsbHandover', label: 'JSB 交接' },
          { key: 'customs', label: '清关' },
          { key: 'lastMile', label: '官方尾程' },
          { key: 'signedAt', label: '签收' },
          { key: 'fee', label: '费用' },
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
          已接 DB：fulfillment_batches（channel=jsb_th）。Q17 JSB 无可靠 API，轨迹支持 import；平台 OpenAPI 仍 stub。
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
              {row.id} · {row.status}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={!selected}>
            补录链路节点
          </Button>
        </div>
        {current ? (
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">{current.batchNo}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {current.packageCount} 个包裹 · 费用 {current.fee || '—'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">TH 链路</Badge>
                <Button size="sm" variant="outline" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate({ id: current.id })}>
                  提交交接
                </Button>
                <Button size="sm" variant="ghost" disabled={closeMutation.isPending} onClick={() => closeMutation.mutate({ id: current.id })}>
                  关闭批次
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <LocaleLink href={`/console/logistics-jsb/${encodeURIComponent(current.id)}`}>详情</LocaleLink>
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
                <li className="text-sm text-muted-foreground">暂无链路事件</li>
              )}
            </ol>
          </div>
        ) : null}
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
