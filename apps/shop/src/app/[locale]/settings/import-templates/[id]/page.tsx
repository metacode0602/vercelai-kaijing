'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailPageHeader } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { IMPORT_TEMPLATE_KINDS } from '@/lib/settings/import-template-rules'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

export default function ImportTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.importTemplates.get.useQuery({ id })
  const row = query.data
  const [notice, setNotice] = React.useState('')
  const [form, setForm] = React.useState({
    kind: '',
    version: '',
    fields: '',
    duplicateStrategy: '',
    rollbackStrategy: '',
    status: '启用',
    note: '',
  })

  React.useEffect(() => {
    if (!row) return
    setForm({
      kind: row.kind,
      version: row.version,
      fields: row.fields,
      duplicateStrategy: row.duplicateStrategy,
      rollbackStrategy: row.rollbackStrategy,
      status: row.status,
      note: row.note,
    })
  }, [row])

  const updateMutation = trpc.importTemplates.update.useMutation({
    onSuccess: async () => {
      setNotice('模板已更新并写审计。')
      await utils.importTemplates.get.invalidate({ id })
      await utils.importTemplates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return <DetailPageHeader backHref="/settings/import-templates" title="加载中…" description="读取模板…" />
  }
  if (!row) {
    return (
      <DetailPageHeader
        backHref="/settings/import-templates"
        title="未找到模板"
        description={`模板 ${id} 不存在。`}
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '导入模板', href: '/settings/import-templates' }, { label: row.kind }]}
      />
      <DetailPageHeader
        backHref="/settings/import-templates"
        title={row.kind}
        description={`${row.version} · ${row.status}`}
        badges={<Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  id,
                  status: row.status === '启用' ? '停用' : '启用',
                })
              }
            >
              {row.status === '启用' ? '停用模板' : '启用模板'}
            </Button>
            <Button
              size="sm"
              disabled={updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  id,
                  kind: form.kind,
                  version: form.version,
                  fields: form.fields,
                  duplicateStrategy: form.duplicateStrategy,
                  rollbackStrategy: form.rollbackStrategy,
                  status: form.status,
                  note: form.note,
                })
              }
            >
              保存修改
            </Button>
          </div>
        }
      />
      <UedPrototypeNotice>
        模板配置已保存；字段列名不允许重复；批量执行暂未开放。
      </UedPrototypeNotice>
      <DetailFieldGrid
        title="当前落库值"
        fields={[
          { label: 'ID', value: row.id, mono: true },
          { label: '更新', value: row.updatedAt },
        ]}
      />
      <div className="grid max-w-3xl gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>导入类型</Label>
          <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPORT_TEMPLATE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>版本</Label>
          <Input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>状态</Label>
          <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="启用">启用</SelectItem>
              <SelectItem value="停用">停用</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>字段清单（逗号/换行分隔，不可重复）</Label>
          <Textarea
            value={form.fields}
            onChange={(e) => setForm((f) => ({ ...f, fields: e.target.value }))}
            rows={4}
          />
        </div>
        <div className="space-y-1">
          <Label>重复策略</Label>
          <Input
            value={form.duplicateStrategy}
            onChange={(e) => setForm((f) => ({ ...f, duplicateStrategy: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label>回滚策略</Label>
          <Input
            value={form.rollbackStrategy}
            onChange={(e) => setForm((f) => ({ ...f, rollbackStrategy: e.target.value }))}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>备注</Label>
          <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} />
        </div>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
