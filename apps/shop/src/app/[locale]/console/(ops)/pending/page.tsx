'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'

const PAGE_SIZE = 20

export default function PendingPage() {
  const [keyword, setKeyword] = React.useState('')
  const [kind, setKind] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [notice, setNotice] = React.useState('')
  const utils = trpc.useUtils()
  const statsQuery = trpc.pending.stats.useQuery()
  const listQuery = trpc.pending.list.useQuery({
    page, pageSize: PAGE_SIZE, q: keyword || undefined,
    kind: kind === 'all' ? undefined : kind,
    status: status === 'all' ? undefined : status,
  })
  const confirmMutation = trpc.pending.confirm.useMutation({
    onSuccess: async (row) => {
      await utils.pending.list.invalidate()
      await utils.pending.stats.invalidate()
      await utils.dashboard.navBadges.invalidate()
      setNotice(`已确认：${row.title}（站内状态；平台执行仍待 OpenAPI）`)
    },
    onError: (e) => setNotice(e.message),
  })
  const rejectMutation = trpc.pending.reject.useMutation({
    onSuccess: async (row) => {
      await utils.pending.list.invalidate()
      await utils.pending.stats.invalidate()
      await utils.dashboard.navBadges.invalidate()
      setNotice(`已拒绝：${row.title}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const kindOptions = (statsQuery.data?.kinds ?? []).map((k) => ({ value: k, label: statsQuery.data?.kindLabels?.[k] ?? k }))
  const statusOptions = (statsQuery.data?.statuses ?? []).map((s) => ({ value: s, label: statsQuery.data?.statusLabels?.[s] ?? s }))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">待审队列</h2>
        <p className="text-sm text-muted-foreground">人工确认 / 拒绝 · pending_actions</p>
      </div>
      <Alert>
        <AlertTitle>主路径已接库</AlertTitle>
        <AlertDescription>读 pending_actions。确认只改站内状态；平台执行仍需 OpenAPI 联调。</AlertDescription>
      </Alert>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(v) => { setKeyword(v); setPage(1) }}
        keywordPlaceholder="标题 / 类型 / 创建者"
        filters={[
          { id: 'kind', label: '类型', value: kind, onChange: (v) => { setKind(v); setPage(1) }, options: kindOptions },
          { id: 'status', label: '状态', value: status, onChange: (v) => { setStatus(v); setPage(1) }, options: statusOptions },
        ]}
      />
      <ConsoleListSection title="待审列表" description={`共 ${total} 条 · 待审 ${statsQuery.data?.pending ?? 0}`} pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}>
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">加载待审…</p>
        ) : rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead><TableHead>标题</TableHead><TableHead>店铺</TableHead>
                <TableHead>创建者</TableHead><TableHead>过期</TableHead><TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{row.kindLabel}</TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell>{row.shop}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.createdBy}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.expiresAt}</TableCell>
                  <TableCell><Badge variant="secondary">{row.statusLabel}</Badge></TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" disabled={row.status !== 'pending' || confirmMutation.isPending} onClick={() => confirmMutation.mutate({ id: row.id })}>确认</Button>
                    <Button size="sm" variant="outline" disabled={row.status !== 'pending' || rejectMutation.isPending} onClick={() => rejectMutation.mutate({ id: row.id, reason: '人工拒绝' })}>拒绝</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
