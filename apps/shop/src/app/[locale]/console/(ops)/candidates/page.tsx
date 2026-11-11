'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  useConsolePagination,
} from '@/components/console/list'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

export default function CandidatesPage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [source, setSource] = React.useState('all')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [categoryHint, setCategoryHint] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [createSource, setCreateSource] = React.useState('手工录入')
  const [notice, setNotice] = React.useState('')

  const utils = trpc.useUtils()
  const meta = trpc.candidates.meta.useQuery()
  const listQuery = trpc.candidates.list.useQuery({
    page: 1,
    pageSize: 100,
    q: keyword || undefined,
    status: status === 'all' ? undefined : status,
    source: source === 'all' ? undefined : source,
  })
  const createMutation = trpc.candidates.create.useMutation({
    onSuccess: async () => {
      setCreateOpen(false)
      setTitle('')
      setCategoryHint('')
      setUrl('')
      setNotice('已落库（手工/导入）。未调用市场爬虫。')
      await utils.candidates.list.invalidate()
      await utils.candidates.stats.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = listQuery.data?.items ?? []
  const { pagedRows, pagination } = useConsolePagination(rows)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">AI 选品</h2>
          <p className="text-sm text-muted-foreground">
            候选列表 · 手工录入 / 导入落库 · 审核通过转 SPU 草稿
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          新建候选
        </Button>
      </div>

      <Alert>
        <AlertTitle>数据来源说明</AlertTitle>
        <AlertDescription>
          列表读取 product_candidates / pending_actions。支持手工录入与导入落库；
          <strong>不提供假市场爬虫成功</strong>。审核通过可创建 SPU 草稿或关联已有商品，并自动生成「刊登提交」待审单。
        </AlertDescription>
      </Alert>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="产品 / ID / 类目"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: '全部状态' },
              ...(meta.data?.statuses ?? []).map((s) => ({ value: s, label: s })),
            ],
          },
          {
            id: 'source',
            label: '来源',
            value: source,
            onChange: setSource,
            options: [
              { value: 'all', label: '全部来源' },
              ...(meta.data?.sources ?? []).map((s) => ({ value: s, label: s })),
            ],
          },
        ]}
      />

      <ConsoleListSection
        title="候选列表"
        description={listQuery.isLoading ? '加载中…' : `共 ${listQuery.data?.total ?? 0} 条`}
        pagination={pagination}
      >
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>产品</TableHead>
                <TableHead>类目</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>到仓成本</TableHead>
                <TableHead>建议售价</TableHead>
                <TableHead>净利率</TableHead>
                <TableHead>证据</TableHead>
                <TableHead>评分</TableHead>
                <TableHead>决策</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <LocaleLink
                      href={`/console/candidates/${row.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{row.categoryHint || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.source}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.landedCost ? `${row.landedCost} ${row.currency}` : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.suggestPrice ? `${row.suggestPrice} ${row.currency}` : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.marginPct ? `${row.marginPct}%` : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.evidenceLabel}</TableCell>
                  <TableCell className="tabular-nums">{row.score.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.goNoGo}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.dbStatus === 'new' ? 'secondary' : 'default'}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建候选（落库）</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>标题</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="商品标题" />
            </div>
            <div className="space-y-1">
              <Label>类目提示</Label>
              <Input value={categoryHint} onChange={(e) => setCategoryHint(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>参考链接（可选）</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1">
              <Label>来源</Label>
              <Select value={createSource} onValueChange={setCreateSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="手工录入">手工录入</SelectItem>
                  <SelectItem value="导入">导入</SelectItem>
                  <SelectItem value="寻源">寻源备注</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={!title.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  title: title.trim(),
                  categoryHint: categoryHint.trim() || undefined,
                  url: url.trim() || undefined,
                  source: createSource,
                })
              }
            >
              保存到库
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
