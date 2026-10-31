'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type JsbBatchRow = {
  id: string
  packages: number
  departedAt: string
  jsbHandover: string
  customs: string
  lastMile: string
  signedAt: string
  fee: string
  status: string
  events: string[]
}

export const DEMO_JSB: JsbBatchRow[] = [
  {
    id: 'BATCH-TH-2026-0062',
    packages: 4,
    departedAt: '2026-10-28 08:40',
    jsbHandover: '2026-10-28 15:20',
    customs: '清关中',
    lastMile: '—',
    signedAt: '—',
    fee: 'THB 1,240',
    status: '清关中',
    events: [
      '自营仓出库 · 2026-10-28 08:40',
      '交接 JSB · 2026-10-28 15:20',
      '清关资料提交 · 2026-10-29 09:15',
    ],
  },
  {
    id: 'BATCH-TH-2026-0061',
    packages: 6,
    departedAt: '2026-10-24 09:10',
    jsbHandover: '2026-10-24 16:00',
    customs: '清关完成 2026-10-26',
    lastMile: '官方尾程派送中',
    signedAt: '—',
    fee: 'THB 1,860',
    status: '尾程派送',
    events: [
      '自营仓出库 · 2026-10-24 09:10',
      '交接 JSB · 2026-10-24 16:00',
      '清关完成 · 2026-10-26 11:30',
      '官方尾程派送 · 2026-10-27 08:00',
    ],
  },
  {
    id: 'BATCH-TH-2026-0059',
    packages: 3,
    departedAt: '2026-10-15 10:00',
    jsbHandover: '2026-10-15 17:30',
    customs: '清关完成 2026-10-17',
    lastMile: '已签收 2026-10-19',
    signedAt: '2026-10-19 12:45',
    fee: 'THB 920',
    status: '已签收',
    events: [
      '自营仓出库 · 2026-10-15 10:00',
      '交接 JSB · 2026-10-15 17:30',
      '清关完成 · 2026-10-17 14:20',
      '官方尾程派送 · 2026-10-18 09:00',
      '已签收 · 2026-10-19 12:45',
    ],
  },
]

const eventOptions = ['自营仓出库', '交接 JSB', '清关资料提交', '清关中', '清关完成', '官方尾程派送', '已签收', '物流异常']

export default function LogisticsJsbPage() {
  const [rows, setRows] = React.useState<JsbBatchRow[]>(DEMO_JSB)
  const [selected, setSelected] = React.useState(DEMO_JSB[0]?.id ?? '')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const current = rows.find((row) => row.id === selected)
  const editor = open ? (
    <UedDialog
      title="补录 TH 链路节点"
      description="TH 走自营仓 → JSB → 清关 → 官方尾程；每个节点记录时间、操作者与来源。"
      fields={[
        { key: 'batch', label: '交接批次', options: rows.map((row) => row.id), required: true },
        { key: 'event', label: '链路节点', options: eventOptions, required: true },
        { key: 'eventAt', label: '节点时间', type: 'datetime-local', required: true },
        { key: 'packages', label: '本批包裹数', type: 'number', helper: '按实际交接清单填写' },
        { key: 'fee', label: '费用（含币种）', placeholder: '如 THB 1,240' },
        { key: 'signedAt', label: '签收时间', type: 'datetime-local', helper: '已签收时填写' },
        { key: 'operator', label: '操作人', options: ['杨洁', '黄发聪'], required: true },
        { key: 'exception', label: '异常说明', type: 'textarea', fullWidth: true, placeholder: '选填：清关资料缺失、破损等' },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const eventLabel = values.event || '人工补录'
        const at = values.eventAt || '刚刚'
        const signed = values.signedAt || ''
        setRows((currentRows) =>
          currentRows.map((row) => {
            if (row.id !== (values.batch || selected)) return row
            const nextStatus =
              eventLabel === '已签收' ? '已签收' : eventLabel === '物流异常' ? '物流异常' : eventLabel === '官方尾程派送' ? '尾程派送' : eventLabel.includes('清关') ? '清关中' : row.status
            return {
              ...row,
              status: nextStatus,
              signedAt: eventLabel === '已签收' ? signed || at : row.signedAt,
              lastMile: eventLabel === '官方尾程派送' || eventLabel === '已签收' ? eventLabel : row.lastMile,
              customs: eventLabel.includes('清关') ? eventLabel : row.customs,
              jsbHandover: eventLabel === '交接 JSB' ? at : row.jsbHandover,
              events: [...row.events, `${eventLabel} · ${at}${values.operator ? ` · ${values.operator}` : ''}`],
            }
          }),
        )
        setOpen(false)
        setNotice('TH 链路节点已补录（本地会话）；正式接入后与接口事件合并去重。')
      }}
    />
  ) : null
  return (
    <>
      {editor}
      <UedWorkspace
        title="JSB 与 TH 物流"
        description="TH 站点自营仓发货全链路：出库 → 交接 JSB → 清关 → 官方尾程 → 签收，节点时间线完整留痕。"
        rows={rows} detailHref={(row) => `/console/logistics-jsb/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'status', 'customs', 'lastMile', 'signedAt', 'fee']}
        searchPlaceholder="搜索批次号、清关状态或费用"
        filters={[{ label: '状态', options: ['清关中', '尾程派送', '已签收', '物流异常'] }]}
        addLabel="补录链路节点"
        onAdd={() => setOpen(true)}
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
          TH 链路字段：交接批次 · JSB 交接 · 清关 · 官方尾程 · 签收。每节点记录时间、操作者与来源（接口/人工）；费用与异常挂批次，结算时与平台账单对账。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <Button key={row.id} variant={selected === row.id ? 'secondary' : 'outline'} size="sm" onClick={() => setSelected(row.id)}>{row.id} · {row.status}</Button>
          ))}
        </div>
        {current ? (
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">{current.id}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{current.packages} 个包裹 · 费用 {current.fee}</p>
              </div>
              <Badge variant="outline">TH 链路</Badge>
            </div>
            <ol className="mt-4 flex flex-col gap-2 border-l pl-4">
              {current.events.map((event, index) => (
                <li key={`${event}-${index}`} className="text-sm">{event}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
