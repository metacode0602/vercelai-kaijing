'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_AUDIT_LOGS } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type LogRow = (typeof ERP_DEMO_AUDIT_LOGS)[number]

export default function SystemLogPage() {
  const [notice, setNotice] = React.useState('')
  const [rows, setRows] = React.useState<LogRow[]>(ERP_DEMO_AUDIT_LOGS)
  return <UedWorkspace title="接口与操作日志" description="同步失败可定位并重试；关键业务修改记录前后值。" rows={rows} searchKeys={['actor', 'action', 'object', 'result', 'detail']} searchPlaceholder="搜索店铺、任务、操作人或对象" columns={[
    { key: 'at', label: '时间' }, { key: 'actor', label: '操作人' }, { key: 'action', label: '动作 / 同步类型' }, { key: 'object', label: '对象' }, { key: 'result', label: '结果', render: (row) => <Badge variant={row.result === '未连接' ? 'outline' : 'secondary'}>{row.result}</Badge> }, { key: 'detail', label: '摘要' },
  ]}>
    <UedPrototypeNotice>敏感 token 不显示；详情应保留脱敏请求摘要、错误代码、重试状态、修改前后值、操作者与 request id。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{rows.filter((row) => row.result === '未连接' || row.result === '部分成功').map((row) => <Button key={row.object} variant="outline" size="sm" onClick={() => { setRows((current) => current.map((item) => item.object === row.object ? { ...item, result: '重试已排队', detail: '原型重试动作；未调用连接器' } : item)); setNotice(`${row.object} 重试已排队（示例），没有联系平台。`) }}>重试 · {row.object}</Button>)}</div>{notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace>
}
