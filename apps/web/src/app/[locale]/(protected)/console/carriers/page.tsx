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
import { PLATFORM_CARRIER_TYPES } from '@/lib/console/platform-catalog-options'
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

type CarrierType = (typeof PLATFORM_CARRIER_TYPES)[number]['value']

type FormState = {
  code: string
  name: string
  type: CarrierType
  coverage: string
  note: string
  status: 'active' | 'inactive'
  sortOrder: string
}

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  type: 'platform',
  coverage: '',
  note: '',
  status: 'active',
  sortOrder: '',
})

function typeLabel(type: string) {
  return PLATFORM_CARRIER_TYPES.find((item) => item.value === type)?.label ?? type
}

export default function PlatformCarriersPage() {
  const utils = trpc.useUtils()
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(emptyForm())

  const listQuery = trpc.platformCarriers.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  })

  const invalidate = async () => {
    await utils.platformCarriers.list.invalidate()
  }

  const createMutation = trpc.platformCarriers.create.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setNotice(`已新增承运商 ${row.code}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformCarriers.update.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setEditingId(null)
      setNotice(`已更新承运商 ${row.code}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformCarriers.remove.useMutation({
    onSuccess: async () => {
      setNotice('已从平台目录删除；已初始化到组织的副本保留，不受影响。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const ensureMutation = trpc.platformCarriers.ensureDefaults.useMutation({
    onSuccess: async (result) => {
      setNotice(
        result.inserted > 0
          ? `已补齐 ${result.inserted} 条初始承运商名称，未改动已维护行。`
          : '初始承运商目录已齐全，无需补齐。',
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
      code: row.code,
      name: row.name,
      type: row.type,
      coverage: row.coverage,
      note: row.note,
      status: row.status,
      sortOrder: String(row.sortOrder),
    })
    setDialogOpen(true)
  }

  function saveForm() {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      type: form.type,
      coverage: form.coverage.trim(),
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
          <h2 className="text-lg font-medium">平台承运商名称目录</h2>
          <p className="text-sm text-muted-foreground">
            只维护承运商名称、类型和覆盖范围，不含联系人与报价。企业入驻审核通过后只拷贝有效项到组织，组织改副本不会回写目录。
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
            新增承运商
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
          placeholder="搜索编码、名称或覆盖范围"
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
            <TableHead>编码</TableHead>
            <TableHead>名称</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>覆盖范围</TableHead>
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
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>{typeLabel(row.type)}</TableCell>
                <TableCell className="max-w-48 truncate text-xs">{row.coverage || '—'}</TableCell>
                <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                  {row.note || '—'}
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
              暂无数据。点「补齐初始目录」写入 LGS / Daraz Express 名称模板，或直接新增。
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
            <DialogTitle>{editingId ? '编辑承运商' : '新增承运商'}</DialogTitle>
            <DialogDescription>
              写入平台目录 platform_carriers_catalog。只保存名称型模板，不会写入联系人或报价。已停用项不会在审核通过时拷贝到新组织。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="carrier-code">编码</Label>
              <Input
                id="carrier-code"
                value={form.code}
                readOnly={Boolean(editingId)}
                placeholder="CAR-LGS"
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {editingId ? '编码是目录主键，不支持修改。' : '大写字母开头，可含数字、连字符或下划线。'}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="carrier-name">名称</Label>
              <Input
                id="carrier-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="carrier-type">类型</Label>
              <NativeSelect
                id="carrier-type"
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as CarrierType,
                  }))
                }
              >
                {PLATFORM_CARRIER_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="carrier-coverage">覆盖范围</Label>
              <Input
                id="carrier-coverage"
                value={form.coverage}
                placeholder="LK 或 MY / TH / VN"
                onChange={(event) => setForm((current) => ({ ...current, coverage: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="carrier-status">状态</Label>
              <NativeSelect
                id="carrier-status"
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
              <Label htmlFor="carrier-sort">排序</Label>
              <Input
                id="carrier-sort"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="carrier-note">说明</Label>
              <Textarea
                id="carrier-note"
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
        title="删除承运商目录项"
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
