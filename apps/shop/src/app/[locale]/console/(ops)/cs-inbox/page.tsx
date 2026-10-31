'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { CS_INBOX_SEED } from '@/lib/crossborder/daraz-ops-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function CsInboxPage() {
  const rows = CS_INBOX_SEED
  const [notice, setNotice] = React.useState('')
  const unread = rows.filter((r) => r.status === '未读').length

  return (
    <UedWorkspace
      title="客服收件箱（只读）"
      description="F28 · 多店铺消息只读工作台。不可发送；每店独立 token/auth。发送与自动化属后续权限确认项。"
      rows={rows}
      searchKeys={['shop', 'customer', 'subject', 'preview']}
      searchPlaceholder="搜索店铺、客户或主题"
      filters={[{ label: '状态', options: ['未读', '已读'] }]}
      columns={[
        { key: 'shop', label: '店铺' },
        { key: 'platform', label: '平台' },
        { key: 'customer', label: '客户' },
        { key: 'subject', label: '主题' },
        { key: 'preview', label: '预览' },
        { key: 'receivedAt', label: '时间' },
        {
          key: 'status',
          label: '状态',
          render: (r) => <Badge variant={r.status === '未读' ? 'destructive' : 'secondary'}>{r.status}</Badge>,
        },
        { key: 'authNote', label: '授权说明' },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '消息', value: String(rows.length) },
          { label: '未读', value: String(unread) },
          { label: '店铺数', value: String(new Set(rows.map((r) => r.shop)).size) },
        ]}
      />
      <UedPrototypeNotice>
        只读壳：无 send API、无自动回复。每店 OAuth token 需独立授权；本原型仅展示 authNote。优惠券触达属 P2（Q38）。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled
          title="只读工作台禁止发送"
          onClick={() => setNotice('已拦截发送（只读）')}
        >
          回复（禁用）
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setNotice('已标记为已读（原型，无服务端）')}>
          标记已读（本地）
        </Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
