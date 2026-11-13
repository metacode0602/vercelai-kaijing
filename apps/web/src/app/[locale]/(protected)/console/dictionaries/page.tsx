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
  key: string
  label: string
  status: 'active' | 'inactive'
  description: string
  values: string
  inactiveValues: string
  sortOrder: string
}

const emptyForm = (): FormState => ({
  key: '',
  label: '',
  status: 'active',
  description: '',
  values: '',
  inactiveValues: '',
  sortOrder: '',
})

function splitLines(value: string) {
  return value
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function PlatformDictionariesPage() {
  const utils = trpc.useUtils()
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(emptyForm())

  const listQuery = trpc.platformDictionaries.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  })

  const invalidate = async () => {
    await utils.platformDictionaries.list.invalidate()
  }

  const createMutation = trpc.platformDictionaries.create.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setNotice(`已新增字典 ${row.key}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformDictionaries.update.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setEditingId(null)
      setNotice(`已更新字典 ${row.key}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformDictionaries.remove.useMutation({
    onSuccess: async () => {
      setNotice('已从平台目录删除；已初始化到组织的副本保留，不受影响。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const ensureMutation = trpc.platformDictionaries.ensureDefaults.useMutation({
    onSuccess: async (result) => {
      setNotice(
        result.inserted > 0
          ? `已补齐 ${result.inserted} 条初始字典，未改动已维护行。`
          : '初始字典已齐全，无需补齐。',
      )
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isPending = createMutation.isPending || updateMutation.isPending
  const colSpan = 6

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(row: (typeof rows)[number]) {
    setEditingId(row.id)
    setForm({
      key: row.key,
      label: row.label,
      status: row.status,
      description: row.description,
      values: row.values.join('\n'),
      inactiveValues: row.inactiveValues.join('\n'),
      sortOrder: String(row.sortOrder),
    })
    setDialogOpen(true)
  }

  function saveForm() {
    const payload = {
      key: form.key.trim(),
      label: form.label.trim(),
      status: form.status,
      description: form.description.trim(),
      values: splitLines(form.values),
      inactiveValues: splitLines(form.inactiveValues),
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
          <h2 className="text-lg font-medium">平台字典目录</h2>
          <p className="text-sm text-muted-foreground">
            颜色、尺码、履约模式等下拉值的全局目录。企业入驻审核通过后只拷贝有效项到组织，组织改副本不会回写目录。
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
            新增字典
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
          placeholder="搜索 key 或名称"
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
            <TableHead>Key</TableHead>
            <TableHead>名称</TableHead>
            <TableHead>有效值</TableHead>
            <TableHead>说明</TableHead>
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
                <TableCell className="font-mono text-xs">{row.key}</TableCell>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="max-w-80 truncate text-xs">
                  {row.values.filter((value) => !row.inactiveValues.includes(value)).join('、') || '—'}
                </TableCell>
                <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                  {row.description || '—'}
                </TableCell>
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
                      onClick={() => setDeleteTarget({ id: row.id, name: row.label })}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={colSpan}>
              暂无数据。点「补齐初始目录」写入默认字典，或直接新增。
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
        <DialogContent className="min-w-[35vw] max-h-[85vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑字典' : '新增字典'}</DialogTitle>
            <DialogDescription>
              写入平台目录 platform_dictionaries_catalog。已停用的字典不会在审核通过时拷贝到新组织。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="dict-key">Key</Label>
              <Input
                id="dict-key"
                value={form.key}
                readOnly={Boolean(editingId)}
                placeholder="product_color"
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {editingId ? 'Key 是目录主键，不支持修改。' : '小写字母开头，可含数字和下划线。'}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dict-label">名称</Label>
              <Input
                id="dict-label"
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dict-status">状态</Label>
              <NativeSelect
                id="dict-status"
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
              <Label htmlFor="dict-values">标准值（每行一个，也可用逗号分隔）</Label>
              <Textarea
                id="dict-values"
                rows={6}
                value={form.values}
                onChange={(event) => setForm((current) => ({ ...current, values: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dict-inactive">停用值（须已在标准值中）</Label>
              <Textarea
                id="dict-inactive"
                rows={3}
                value={form.inactiveValues}
                onChange={(event) =>
                  setForm((current) => ({ ...current, inactiveValues: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dict-sort">排序</Label>
              <Input
                id="dict-sort"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dict-description">说明</Label>
              <Textarea
                id="dict-description"
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={isPending || !form.key.trim() || !form.label.trim()} onClick={saveForm}>
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
        title="删除字典目录项"
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
