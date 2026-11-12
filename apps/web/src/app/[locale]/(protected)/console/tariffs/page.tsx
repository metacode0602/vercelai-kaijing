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
import { PLATFORM_TARIFF_COUNTRIES, PLATFORM_TARIFF_FORMULAS } from '@/lib/console/platform-catalog-options'
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
  countryCode: string
  hsCode: string
  description: string
  formulaProfile: string
  currency: string
  effectiveFrom: string
  effectiveTo: string
  gdRate: string
  surchargeRate: string
  palRate: string
  cessRate: string
  exciseRate: string
  vatRate: string
  ssclRate: string
  notes: string
}

const emptyForm = (): FormState => ({
  countryCode: 'LK',
  hsCode: '',
  description: '',
  formulaProfile: 'lk_cascade_v1',
  currency: '',
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  gdRate: '',
  surchargeRate: '',
  palRate: '',
  cessRate: '',
  exciseRate: '',
  vatRate: '',
  ssclRate: '',
  notes: '',
})

function parseRate(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function statusLabel(status: string) {
  if (status === 'active') return '已发布'
  if (status === 'archived') return '已归档'
  return '草稿'
}

export default function PlatformTariffsPage() {
  const utils = trpc.useUtils()
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [countryCode, setCountryCode] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(emptyForm())

  const listQuery = trpc.platformHsTariffs.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    countryCode: countryCode || undefined,
    status: status === 'draft' || status === 'active' || status === 'archived' ? status : undefined,
  })

  const invalidate = async () => {
    await utils.platformHsTariffs.list.invalidate()
  }

  const createMutation = trpc.platformHsTariffs.create.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setNotice(`已新增税则草稿 ${row.hsCode} v${row.version}。发布后才会在审核通过时拷贝到新组织。`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformHsTariffs.update.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setEditingId(null)
      setNotice(`已更新税则 ${row.hsCode} v${row.version}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const statusMutation = trpc.platformHsTariffs.setStatus.useMutation({
    onSuccess: async (row) => {
      setNotice(`已将 ${row.hsCode} v${row.version} 设为${statusLabel(row.status)}`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformHsTariffs.remove.useMutation({
    onSuccess: async () => {
      setNotice('已从全局税则库删除；已拷贝到组织的草稿保留，不受影响。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const isPending = createMutation.isPending || updateMutation.isPending
  const colSpan = 8
  const formulaOptions = PLATFORM_TARIFF_FORMULAS.filter((item) =>
    form.countryCode ? item.countries.includes(form.countryCode as never) : true,
  )

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(row: (typeof rows)[number]) {
    setEditingId(row.id)
    setForm({
      countryCode: row.countryCode,
      hsCode: row.code || row.hsCode,
      description: row.description,
      formulaProfile: row.formulaProfile,
      currency: row.currency,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      gdRate: row.gdRate == null ? '' : String(row.gdRate),
      surchargeRate: row.surchargeRate == null ? '' : String(row.surchargeRate),
      palRate: row.palRate == null ? '' : String(row.palRate),
      cessRate: row.cessRate == null ? '' : String(row.cessRate),
      exciseRate: row.exciseRate == null ? '' : String(row.exciseRate),
      vatRate: row.vatRate == null ? '' : String(row.vatRate),
      ssclRate: row.ssclRate == null ? '' : String(row.ssclRate),
      notes: row.notes,
    })
    setDialogOpen(true)
  }

  function saveForm() {
    const payload = {
      countryCode: form.countryCode,
      hsCode: form.hsCode,
      code: form.hsCode,
      description: form.description,
      formulaProfile: form.formulaProfile,
      currency: form.currency || undefined,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || undefined,
      gdRate: parseRate(form.gdRate),
      surchargeRate: parseRate(form.surchargeRate),
      palRate: parseRate(form.palRate),
      cessRate: parseRate(form.cessRate),
      exciseRate: parseRate(form.exciseRate),
      vatRate: parseRate(form.vatRate),
      ssclRate: parseRate(form.ssclRate),
      notes: form.notes,
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
          <h2 className="text-lg font-medium">全局税则库</h2>
          <p className="text-sm text-muted-foreground">
            由平台运营维护 HS 税则结构与税率。新企业审核通过时只拷贝已发布项，并以组织草稿落地，不会自动发布，也不会推送到已有租户。不预置官方税率，税率由本页填写。
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          新增税则
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setPage(1)
          }}
          placeholder="搜索 HS 编码"
          className="h-8 w-56"
        />
        <NativeSelect
          value={countryCode}
          onChange={(event) => {
            setCountryCode(event.target.value)
            setPage(1)
          }}
        >
          <option value="">全部国家</option>
          {PLATFORM_TARIFF_COUNTRIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="active">已发布</option>
          <option value="archived">已归档</option>
        </NativeSelect>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>国家</TableHead>
            <TableHead>HS</TableHead>
            <TableHead>公式</TableHead>
            <TableHead>生效日</TableHead>
            <TableHead>版本</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>说明</TableHead>
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
                <TableCell>{row.countryCode}</TableCell>
                <TableCell className="font-mono text-xs">{row.code || row.hsCode}</TableCell>
                <TableCell className="text-xs">{row.formulaProfile || '—'}</TableCell>
                <TableCell className="text-xs">{row.effectiveFrom}</TableCell>
                <TableCell className="font-mono text-xs">v{row.version}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'active' ? 'secondary' : 'outline'}>
                    {statusLabel(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                  {row.description || row.notes || '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {row.status === 'draft' ? (
                      <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                        编辑
                      </Button>
                    ) : null}
                    {row.status !== 'active' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: row.id, status: 'active' })}
                      >
                        发布
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: row.id, status: 'archived' })}
                      >
                        归档
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removeMutation.isPending}
                      onClick={() => setDeleteTarget({ id: row.id, name: `${row.hsCode} v${row.version}` })}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={colSpan}>暂无数据。请新增税则并填写税率后发布，不会预置官方税率。</TableEmptyRow>
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
            <DialogTitle>{editingId ? '编辑税则草稿' : '新增税则'}</DialogTitle>
            <DialogDescription>
              写入全局 hs_codes / hs_tariff_versions（owner_key=global）。税率由运营填写，不会写入官方预设数字。新组织只会拷贝已发布版本，并生成待发布草稿。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tariff-country">目的国</Label>
              <NativeSelect
                id="tariff-country"
                value={form.countryCode}
                onChange={(event) => {
                  const next = event.target.value
                  const formula =
                    PLATFORM_TARIFF_FORMULAS.find((item) => item.countries.includes(next as never))?.id ?? ''
                  setForm((current) => ({ ...current, countryCode: next, formulaProfile: formula }))
                }}
              >
                {PLATFORM_TARIFF_COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tariff-hs">HS 编码</Label>
              <Input
                id="tariff-hs"
                value={form.hsCode}
                placeholder="6109.10"
                onChange={(event) => setForm((current) => ({ ...current, hsCode: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tariff-desc">描述</Label>
              <Input
                id="tariff-desc"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tariff-formula">计税公式</Label>
              <NativeSelect
                id="tariff-formula"
                value={form.formulaProfile}
                onChange={(event) => setForm((current) => ({ ...current, formulaProfile: event.target.value }))}
              >
                {formulaOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="tariff-from">生效日</Label>
                <Input
                  id="tariff-from"
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tariff-to">失效日（可空）</Label>
                <Input
                  id="tariff-to"
                  type="date"
                  value={form.effectiveTo}
                  onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['gdRate', '关税 / GD'],
                ['surchargeRate', '附加'],
                ['palRate', 'PAL'],
                ['cessRate', 'CESS'],
                ['exciseRate', '消费税'],
                ['vatRate', '增值税 VAT / SST / GST / PPN'],
                ['ssclRate', 'SSCL / 其他附加'],
              ] as const).map(([key, label]) => (
                <div className="grid gap-2" key={key}>
                  <Label htmlFor={`tariff-${key}`}>{label}</Label>
                  <Input
                    id={`tariff-${key}`}
                    inputMode="decimal"
                    placeholder="留空表示未填写，不预置官方税率"
                    value={form[key as keyof FormState]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tariff-notes">备注</Label>
              <Textarea
                id="tariff-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={isPending || !form.hsCode.trim() || !form.effectiveFrom} onClick={saveForm}>
              {isPending ? '保存中…' : editingId ? '保存' : '创建草稿'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="删除税则目录项"
        description={
          deleteTarget
            ? `确认从全局税则库删除「${deleteTarget.name}」？已有组织引用时无法删除，请改为归档。组织内已拷贝的草稿不受影响。`
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
