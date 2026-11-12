'use client'

import * as React from 'react'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect } from '@workspace/ui/components/native-select'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

type FormState = {
  kind: string
  version: string
  fields: string
  duplicateStrategy: string
  rollbackStrategy: string
  note: string
  status: 'active' | 'inactive'
  sortOrder: string
}

const emptyForm = (): FormState => ({
  kind: '',
  version: 'v1',
  fields: '',
  duplicateStrategy: '',
  rollbackStrategy: '',
  note: '',
  status: 'active',
  sortOrder: '',
})

export default function PlatformImportTemplatesPage() {
  const utils = trpc.useUtils()
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(emptyForm())

  const listQuery = trpc.platformImportTemplates.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  })

  const invalidate = async () => {
    await utils.platformImportTemplates.list.invalidate()
  }

  const createMutation = trpc.platformImportTemplates.create.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setNotice(`已新增导入模板 ${row.kind} ${row.version}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformImportTemplates.update.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setEditingId(null)
      setNotice(`已更新导入模板 ${row.kind} ${row.version}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformImportTemplates.remove.useMutation({
    onSuccess: async () => {
      setNotice('已从平台目录删除；已初始化到组织的副本保留，不受影响。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const ensureMutation = trpc.platformImportTemplates.ensureDefaults.useMutation({
    onSuccess: async (result) => {
      setNotice(
        result.inserted > 0
          ? `已补齐 ${result.inserted} 条初始导入模板，未改动已维护行。`
          : '初始导入模板已齐全，无需补齐。',
      )
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isPending = createMutation.isPending || updateMutation.isPending
  const colSpan = 7

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(row: (typeof rows)[number]) {
    setEditingId(row.id)
    setForm({
      kind: row.kind,
      version: row.version,
      fields: row.fields,
      duplicateStrategy: row.duplicateStrategy,
      rollbackStrategy: row.rollbackStrategy,
      note: row.note,
      status: row.status,
      sortOrder: String(row.sortOrder),
    })
    setDialogOpen(true)
  }

  function saveForm() {
    const payload = {
      kind: form.kind.trim(),
      version: form.version.trim() || 'v1',
      fields: form.fields.trim(),
      duplicateStrategy: form.duplicateStrategy.trim(),
      rollbackStrategy: form.rollbackStrategy.trim(),
      note: form.note.trim(),
      status: form.status,
      sortOrder: form.sortOrder.trim() === '' ? undefined : Number(form.sortOrder),
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload })
      return
    }
    createMutation.mutate(payload)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">平台导入模板目录</h2>
          <p className="text-sm text-muted-foreground">
            只维护字段说明、重复策略和回滚策略，不含商品或库存数据行。企业入驻审核通过后只拷贝有效项到组织，组织改副本不会回写目录。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={ensureMutation.isPending}
            onClick={() => ensureMutation.mutate()}
          >
            {ensureMutation.isPending ? '补齐中…' : '补齐初始目录'}
          </Button>
          <Button size="sm" onClick={openCreate}>
            新增模板
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setPage(1)
          }}
          placeholder="搜索类型、版本或字段"
          className="h-8 w-56"
        />
        <NativeSelect
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">全部状态</option>
          <option value="active">启用</option>
          <option value="inactive">停用</option>
        </NativeSelect>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>类型</TableHead>
            <TableHead>版本</TableHead>
            <TableHead>字段说明</TableHead>
            <TableHead>重复策略</TableHead>
            <TableHead>回滚策略</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listQuery.isLoading ? (
            <TableLoadingRow colSpan={colSpan} />
          ) : listQuery.isError ? (
            <TableErrorRow
              colSpan={colSpan}
              message={listQuery.error.message}
              onRetry={() => listQuery.refetch()}
            />
          ) : rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.kind}</TableCell>
                <TableCell className="font-mono text-xs">{row.version}</TableCell>
                <TableCell className="max-w-64 truncate text-xs">{row.fields || '—'}</TableCell>
                <TableCell className="max-w-40 truncate text-xs">{row.duplicateStrategy || '—'}</TableCell>
                <TableCell className="max-w-40 truncate text-xs">{row.rollbackStrategy || '—'}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'active' ? 'secondary' : 'outline'}>
                    {row.status === 'active' ? '启用' : '停用'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removeMutation.isPending}
                      onClick={() => setDeleteTarget({ id: row.id, name: `${row.kind} ${row.version}` })}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={colSpan}>
              暂无数据。点「补齐初始目录」写入商品 / SKU 字段说明模板，或直接新增。
            </TableEmptyRow>
          )}
        </TableBody>
      </Table>

      <ListPagination
        page={page}
        totalPages={pageCount}
        totalItems={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingId(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑导入模板' : '新增导入模板'}</DialogTitle>
            <DialogDescription>
              写入平台目录 platform_import_templates_catalog。只保存字段与策略说明，不会写入业务数据行。已停用项不会在审核通过时拷贝到新组织。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tpl-kind">类型</Label>
              <Input
                id="tpl-kind"
                value={form.kind}
                placeholder="商品 / SKU"
                onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-version">版本</Label>
              <Input
                id="tpl-version"
                value={form.version}
                placeholder="v1"
                onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">类型与版本共同唯一。可用字母、数字、点、连字符或下划线。</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-fields">字段说明</Label>
              <Textarea
                id="tpl-fields"
                rows={4}
                value={form.fields}
                placeholder="SPU, SKU, 颜色, 尺码, 包装, 重量"
                onChange={(event) => setForm((current) => ({ ...current, fields: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-dup">重复策略</Label>
              <Input
                id="tpl-dup"
                value={form.duplicateStrategy}
                placeholder="仅更新允许字段"
                onChange={(event) => setForm((current) => ({ ...current, duplicateStrategy: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-rollback">回滚策略</Label>
              <Input
                id="tpl-rollback"
                value={form.rollbackStrategy}
                placeholder="允许回滚"
                onChange={(event) => setForm((current) => ({ ...current, rollbackStrategy: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-status">状态</Label>
              <NativeSelect
                id="tpl-status"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value === 'inactive' ? 'inactive' : 'active',
                  }))
                }
              >
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-sort">排序</Label>
              <Input
                id="tpl-sort"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-note">说明</Label>
              <Textarea
                id="tpl-note"
                rows={3}
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={isPending || !form.kind.trim()} onClick={saveForm}>
              {isPending ? '保存中…' : editingId ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="删除导入模板目录项"
        description={
          deleteTarget
            ? `确认从平台目录删除「${deleteTarget.name}」？已有组织引用时无法删除，请改为停用。组织内已初始化的副本不受影响。`
            : ''
        }
        confirmLabel="确认删除"
        confirmVariant="destructive"
        pending={removeMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            removeMutation.mutate({ id: deleteTarget.id })
            setDeleteTarget(null)
          }
        }}
      />
    </div>
  )
}
