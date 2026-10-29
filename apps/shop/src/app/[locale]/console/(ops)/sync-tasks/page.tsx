'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type SyncTaskRow = {
  id: string
  type: string
  target: string
  shop: string
  progress: string
  error: string
  retries: number
  lastRun: string
  status: string
}

export const DEMO_TASKS: SyncTaskRow[] = [
  { id: 'TASK-2026-10841', type: '库存同步', target: 'HSY000001001 × 6 刊登', shop: 'Lazada MY', progress: '6 / 6', error: '—', retries: 0, lastRun: '2026-10-28 10:02', status: '成功' },
  { id: 'TASK-2026-10842', type: '价格同步', target: 'TEE-001 等 3 刊登', shop: 'Daraz LK', progress: '2 / 3', error: 'ITEM_NOT_FOUND (404) · LK-ITEM-9011', retries: 1, lastRun: '2026-10-28 10:05', status: '部分失败' },
  { id: 'TASK-2026-10843', type: '发布刊登', target: '草稿 LIST-2026-0231', shop: 'Lazada PH', progress: '0 / 1', error: '类目属性缺失（示例）', retries: 0, lastRun: '2026-10-28 09:41', status: '失败' },
  { id: 'TASK-2026-10838', type: '状态同步', target: '28 个刊登上下架', shop: 'Lazada MY', progress: '28 / 28', error: '—', retries: 0, lastRun: '2026-10-27 22:00', status: '成功' },
]

export default function SyncTasksPage() {
  const [rows, setRows] = React.useState<SyncTaskRow[]>(DEMO_TASKS)
  const [notice, setNotice] = React.useState('')
  function retry(id: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, status: '排队重试', retries: row.retries + 1, error: '—', lastRun: '刚刚（原型）' } : row,
      ),
    )
    setNotice(`${id} 已排队重试（示例），不会真实调用平台接口。`)
  }
  return (
    <UedWorkspace
      title="发布与同步任务"
      description="发布 / 库存 / 价格 / 状态同步任务的执行进度、失败原因与重试；关联接口日志排查。"
      rows={rows} detailHref={(row) => `/console/sync-tasks/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'type', 'target', 'shop', 'error', 'status']}
      searchPlaceholder="搜索任务号、类型、刊登或错误码"
      filters={[{ label: '状态', options: ['成功', '部分失败', '失败', '排队重试'] }]}
      columns={[
        { key: 'id', label: '任务号' },
        { key: 'type', label: '任务类型' },
        { key: 'target', label: '目标' },
        { key: 'shop', label: '店铺' },
        { key: 'progress', label: '进度' },
        { key: 'error', label: '错误' },
        { key: 'retries', label: '重试次数', render: (row) => String(row.retries) },
        { key: 'lastRun', label: '最近执行' },
        { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '失败' ? 'destructive' : row.status === '部分失败' ? 'outline' : 'secondary'}>{row.status}</Badge> },
      ]}
    >
      <UedPrototypeNotice>
        本页是「任务视角」（按业务动作看进度与重试），设置·接口日志是「HTTP 流水视角」（按请求看错误码与耗时），两者通过 request id 关联。技术重试不改变业务审批状态；外部 IT 可排查与重试，不能代替业务审批。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows.filter((row) => row.status === '失败' || row.status === '部分失败').map((row) => (
          <React.Fragment key={row.id}>
            <Button size="sm" onClick={() => retry(row.id)}>重试 · {row.id}</Button>
            <Button variant="ghost" size="sm" onClick={() => setNotice(`${row.id} 关联接口日志：POST /lazada/price/update → 404 ITEM_NOT_FOUND（示例，去设置·接口日志可查同 request id）。`)}>查看接口日志</Button>
          </React.Fragment>
        ))}
        <Button variant="outline" size="sm" onClick={() => setNotice('按店铺暂停同步：暂停后新任务不再自动创建，已在跑的任务跑完（原型规则）。')}>暂停店铺同步</Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
