'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type LgsBatchRow = {
  id: string
  site: string
  packages: number
  carrier: string
  handedOver: string
  tracking: string
  status: string
  events: string[]
}

export const DEMO_LGS: LgsBatchRow[] = [
  { id: 'BATCH-LGS-2026-0141', site: 'LK', packages: 3, carrier: 'Daraz Express', handedOver: '2026-10-20 14:10', tracking: 'DZLK9981 等 3 单', status: '运输中', events: ['仓库出库 · 2026-10-20 10:20', '承运商揽收 · 2026-10-20 14:10', '出境干线 · 2026-10-21 08:00'] },
  { id: 'BATCH-LGS-2026-0142', site: 'MY', packages: 5, carrier: 'LGS', handedOver: '2026-10-27 16:45', tracking: 'LGS-MY-77120 等 5 单', status: '已揽收', events: ['仓库出库 · 2026-10-27 13:30', 'LGS 揽收 · 2026-10-27 16:45'] },
  { id: 'BATCH-LGS-2026-0138', site: 'PH', packages: 2, carrier: 'LGS', handedOver: '2026-10-18 09:20', tracking: 'LGS-PH-30118 等 2 单', status: '已签收', events: ['仓库出库 · 2026-10-18 08:00', 'LGS 揽收 · 2026-10-18 09:20', '清关完成 · 2026-10-20 15:10', '官方尾程派送 · 2026-10-21 10:05', '已签收 · 2026-10-21 17:40'] },
]

const eventOptions = ['LGS 揽收', '出境干线', '清关中', '清关完成', '官方尾程派送', '已签收', '物流异常']

export default function LogisticsLgsPage() {
  const [rows, setRows] = React.useState<LgsBatchRow[]>(DEMO_LGS)
  const [selected, setSelected] = React.useState(DEMO_LGS[0]?.id ?? '')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const current = rows.find((row) => row.id === selected)
  const editor = open ? (
    <UedDialog
      title="追加 LGS 履约事件"
      description="接口能力未确认时事件可人工录入并标记来源；不会调用平台接口。"
      fields={[
        { key: 'batch', label: '交接批次', options: rows.map((row) => row.id), required: true },
        { key: 'event', label: '履约事件', options: eventOptions, required: true },
        { key: 'eventAt', label: '事件时间', type: 'datetime-local', required: true },
        { key: 'tracking', label: '运单号', placeholder: '可填写单个运单或批次号' },
        { key: 'carrier', label: '承运商', options: ['LGS', 'Daraz Express', '平台官方尾程'], required: true },
        { key: 'operator', label: '操作人', required: true },
        { key: 'exception', label: '异常说明', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((currentRows) =>
          currentRows.map((row) =>
            row.id === selected ? { ...row, status: '人工更新', events: [...row.events, `人工更新 · 刚刚（示例）`] } : row,
          ),
        )
        setOpen(false)
        setNotice('履约事件已追加（本地示例）；正式接入后以接口事件为准并保留人工补录标记。')
      }}
    />
  ) : null
  return (
    <>
      {editor}
      <UedWorkspace
        title="LGS 物流"
        description="MY / PH / SG / VN 四国站点的 LGS 交接批次、轨迹与签收；按站点过滤查看。"
        rows={rows} detailHref={(row) => `/console/logistics-lgs/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'site', 'carrier', 'tracking', 'status']}
        searchPlaceholder="搜索批次号、站点或运单号"
        filters={[{ label: '状态', options: ['已揽收', '清关中', '运输中', '已签收', '物流异常'] }]}
        addLabel="录入履约事件"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '交接批次' },
          { key: 'site', label: '站点' },
          { key: 'packages', label: '包裹数', render: (row) => String(row.packages) },
          { key: 'carrier', label: '承运商' },
          { key: 'handedOver', label: '交接时间' },
          { key: 'tracking', label: '运单号' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '物流异常' ? 'destructive' : 'secondary'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          LGS 为 Lazada MY/PH/SG/VN 的平台物流；轨迹事件来源分「接口 / 人工补录」两类并保留来源标记。异常批次需运营确认后发起平台工单（原型）。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <Button key={row.id} variant={selected === row.id ? 'secondary' : 'outline'} size="sm" onClick={() => setSelected(row.id)}>{row.site} · {row.status}</Button>
          ))}
        </div>
        {current ? (
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">{current.id}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{current.carrier} · {current.packages} 个包裹 · {current.tracking}</p>
              </div>
              <Badge variant="outline">事件来源：接口 / 人工示例</Badge>
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
