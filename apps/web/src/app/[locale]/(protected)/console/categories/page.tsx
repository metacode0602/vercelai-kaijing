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
  code: string
  name: string
  parentId: string
  status: 'active' | 'inactive'
  sort: string
  note: string
}

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  parentId: '',
  status: 'active',
  sort: '10',
  note: '',
})

export default function PlatformCategoriesPage() {
  const utils = trpc.useUtils()
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(emptyForm())

  const listQuery = trpc.platformCategories.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  })

  const invalidate = async () => {
    await utils.platformCategories.list.invalidate()
  }

  const createMutation = trpc.platformCategories.create.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setNotice(`已新增品类 ${row.code}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformCategories.update.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setEditingId(null)
      setNotice(`已更新品类 ${row.code}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformCategories.remove.useMutation({
    onSuccess: async () => {
      setNotice('已从平台目录删除；已初始化到组织的副本保留，不受影响。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const ensureMutation = trpc.platformCategories.ensureDefaults.useMutation({
    onSuccess: async (result) => {
      setNotice(
        result.inserted > 0
          ? `已补齐 ${result.inserted} 个初始品类节点，未改动已维护行。`
          : '初始品类树已齐全，无需补齐。',
      )
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const parentOptions = listQuery.data?.all ?? []
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
      code: row.code,
      name: row.name,
      parentId: row.parentId ?? '',
      status: row.status,
      sort: String(row.sort),
      note: row.note,
    })
    setDialogOpen(true)
  }

  function saveForm() {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      parentId: form.parentId || null,
      status: form.status,
      sort: form.sort.trim() === '' ? undefined : Number(form.sort),
      note: form.note.trim(),
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
          <h2 className="text-lg font-medium">平台内部品类树目录</h2>
          <p className="text-sm text-muted-foreground">
            组织内部经营分类，不是店铺授权后缓存的平台类目。审核通过时只拷贝自身及祖先都有效的节点，父子关系映射到本组织新节点。
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
            新增品类
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
          placeholder="搜索编码或名称"
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
            <TableHead>名称</TableHead>
            <TableHead>编码</TableHead>
            <TableHead>路径</TableHead>
            <TableHead>排序</TableHead>
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
                <TableCell className="font-medium" style={{ paddingLeft: 12 + row.depth * 16 }}>
                  {row.name}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{row.path}</TableCell>
                <TableCell className="tabular-nums">{row.sort}</TableCell>
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
                      onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={colSpan}>
              暂无数据。点「补齐初始目录」写入默认内部品类树，或直接新增。
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
            <DialogTitle>{editingId ? '编辑品类' : '新增品类'}</DialogTitle>
            <DialogDescription>
              写入平台目录 platform_category_trees_catalog，不要与店铺平台类目缓存混淆。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cat-code">编码</Label>
              <Input
                id="cat-code"
                value={form.code}
                readOnly={Boolean(editingId)}
                placeholder="APPAREL-TOPS"
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {editingId ? '编码是目录主键，不支持修改。' : '大写字母开头，可含数字和连字符。'}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-name">名称</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-parent">上级品类</Label>
              <NativeSelect
                id="cat-parent"
                value={form.parentId}
                onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}
              >
                <option value="">无（一级品类）</option>
                {parentOptions
                  .filter((item) => item.id !== editingId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}（{item.code}）
                    </option>
                  ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-status">状态</Label>
              <NativeSelect
                id="cat-status"
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
              <Label htmlFor="cat-sort">排序</Label>
              <Input
                id="cat-sort"
                inputMode="numeric"
                value={form.sort}
                onChange={(event) => setForm((current) => ({ ...current, sort: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-note">备注</Label>
              <Textarea
                id="cat-note"
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
            <Button disabled={isPending || !form.code.trim() || !form.name.trim()} onClick={saveForm}>
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
        title="删除品类目录项"
        description={
          deleteTarget
            ? `确认从平台目录删除「${deleteTarget.name}」？有子节点或已被组织引用时无法删除，请改为停用。组织内已初始化的副本不受影响。`
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
