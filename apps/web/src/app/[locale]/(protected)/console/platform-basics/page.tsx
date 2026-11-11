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
import type { PlatformApiReadyState } from '@workspace/db/schema'
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

/**
 * 平台基础资料目录（平台 / 国家站点 / 币种）维护。
 * 本页写全局 `platform_basics_catalog`；企业审核通过时复制到组织副本，
 * 组织内用户在租户控制台维护自己的副本，两者互不影响。
 * @see docs/design/haoshiyun-platform-basics-ued.md §7
 */


const KINDS = [
  { value: 'platform', label: '平台' },
  { value: 'country', label: '国家 / 站点' },
  { value: 'currency', label: '币种' },
] as const

type Kind = (typeof KINDS)[number]['value']

const API_READY_OPTIONS = ['', 'Connected', 'Configuration required', 'Planned']

type FormState = {
  code: string
  name: string
  status: 'active' | 'inactive'
  description: string
  region: string
  timezone: string
  defaultCurrency: string
  symbol: string
  decimals: string
  countries: string
  apiReady: string
}

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  status: 'active',
  description: '',
  region: '',
  timezone: '',
  defaultCurrency: '',
  symbol: '',
  decimals: '2',
  countries: '',
  apiReady: '',
})

function toPayload(kind: Kind, form: FormState) {
  return {
    kind,
    code: form.code.trim(),
    name: form.name.trim(),
    status: form.status,
    description: form.description.trim(),
    region: form.region.trim() || null,
    timezone: form.timezone.trim() || null,
    defaultCurrency: form.defaultCurrency.trim() || null,
    symbol: form.symbol.trim() || null,
    decimals: form.decimals.trim() === '' ? null : Number(form.decimals),
    countries: form.countries
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    apiReady: (form.apiReady || null) as PlatformApiReadyState | null,
  }
}

export default function PlatformBasicsPage() {
  const utils = trpc.useUtils()
  const [kind, setKind] = React.useState<Kind>('platform')
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(emptyForm())

  const listQuery = trpc.platformBasics.list.useQuery({
    kind,
    page,
    pageSize,
    q: q.trim() || undefined,
    status: status === 'active' || status === 'inactive' ? status : undefined,
  })

  const invalidate = async () => {
    await utils.platformBasics.list.invalidate()
  }

  const createMutation = trpc.platformBasics.create.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setNotice(`已新增 ${row.code}（平台目录）`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformBasics.update.useMutation({
    onSuccess: async (row) => {
      setDialogOpen(false)
      setEditingId(null)
      setNotice(`已更新 ${row.code}（平台目录）`)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformBasics.remove.useMutation({
    onSuccess: async () => {
      setNotice('已从平台目录删除；已初始化到组织的副本保留，不受影响。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const ensureMutation = trpc.platformBasics.ensureDefaults.useMutation({
    onSuccess: async (result) => {
      setNotice(
        result.inserted > 0
          ? `已补齐 ${result.inserted} 条初始资料，未改动已维护行。`
          : '初始资料已齐全，无需补齐。',
      )
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

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
      status: row.status,
      description: row.description,
      region: row.region ?? '',
      timezone: row.timezone ?? '',
      defaultCurrency: row.defaultCurrency ?? '',
      symbol: row.symbol ?? '',
      decimals: row.decimals == null ? '' : String(row.decimals),
      countries: (row.countries ?? []).join(', '),
      apiReady: row.apiReady ?? '',
    })
    setDialogOpen(true)
  }

  function saveForm() {
    const payload = toPayload(kind, form)
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload })
      return
    }
    createMutation.mutate(payload)
  }

  function removeRow(row: (typeof rows)[number]) {
    setDeleteTarget({ id: row.id, name: row.name })
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const isPlatform = kind === 'platform'
  const isCountry = kind === 'country'
  const isCurrency = kind === 'currency'
  const colSpan = 5 + (isPlatform ? 2 : 0) + (isCountry ? 3 : 0) + (isCurrency ? 2 : 0)

  function switchKind(next: Kind) {
    setKind(next)
    setPage(1)
    setDialogOpen(false)
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">平台基础资料目录</h2>
          <p className="text-sm text-muted-foreground">
            平台 / 国家站点 / 币种的全局目录，是初始化数据的真源；企业入驻审核通过后按目录初始化到组织，组织内可自行增删改。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={ensureMutation.isPending}
            onClick={() => ensureMutation.mutate()}
          >
            {ensureMutation.isPending ? '补齐中…' : '补齐初始资料'}
          </Button>
          <Button size="sm" onClick={openCreate}>
            新增{KINDS.find((item) => item.value === kind)?.label}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        {KINDS.map((item) => (
          <Button
            key={item.value}
            size="sm"
            variant={kind === item.value ? 'default' : 'ghost'}
            onClick={() => switchKind(item.value)}
          >
            {item.label}
          </Button>
        ))}
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setPage(1)
          }}
          placeholder="搜索代码或名称"
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
            <TableHead>代码</TableHead>
            <TableHead>名称</TableHead>
            {isPlatform ? <TableHead>覆盖站点</TableHead> : null}
            {isPlatform ? <TableHead>接入状态</TableHead> : null}
            {isCountry ? <TableHead>区域</TableHead> : null}
            {isCountry ? <TableHead>时区</TableHead> : null}
            {isCountry ? <TableHead>默认币种</TableHead> : null}
            {isCurrency ? <TableHead>符号</TableHead> : null}
            {isCurrency ? <TableHead>小数位</TableHead> : null}
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
                {isPlatform ? (
                  <TableCell className="text-xs">
                    {(row.countries ?? []).length ? (row.countries ?? []).join(', ') : '—'}
                  </TableCell>
                ) : null}
                {isPlatform ? <TableCell className="text-xs">{row.apiReady ?? '—'}</TableCell> : null}
                {isCountry ? <TableCell className="text-xs">{row.region ?? '—'}</TableCell> : null}
                {isCountry ? (
                  <TableCell className="font-mono text-xs">{row.timezone ?? '—'}</TableCell>
                ) : null}
                {isCountry ? <TableCell>{row.defaultCurrency ?? '—'}</TableCell> : null}
                {isCurrency ? <TableCell>{row.symbol ?? '—'}</TableCell> : null}
                {isCurrency ? <TableCell>{row.decimals ?? '—'}</TableCell> : null}
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
                      onClick={() => removeRow(row)}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={colSpan}>
              暂无数据。点「补齐初始资料」写入平台默认目录，或直接新增。
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
            <DialogTitle>
              {editingId ? '编辑' : '新增'}
              {KINDS.find((item) => item.value === kind)?.label}
            </DialogTitle>
            <DialogDescription>
              写入平台目录 platform_basics_catalog；组织副本按此目录初始化。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pb-code">代码</Label>
              <Input
                id="pb-code"
                value={form.code}
                readOnly={Boolean(editingId)}
                placeholder={
                  isPlatform ? 'daraz' : isCountry ? 'LK（2 位字母）' : 'LKR（3 位字母）'
                }
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {editingId ? '代码是目录主键，不支持修改。' : '平台用小写标识，国家 2 位、币种 3 位字母。'}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pb-name">名称</Label>
              <Input
                id="pb-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pb-status">状态</Label>
              <NativeSelect
                id="pb-status"
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

            {isPlatform ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pb-countries">覆盖站点（国家代码，逗号分隔）</Label>
                  <Input
                    id="pb-countries"
                    value={form.countries}
                    placeholder="LK, MY, PH"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, countries: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pb-api-ready">接入状态</Label>
                  <NativeSelect
                    id="pb-api-ready"
                    value={form.apiReady}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, apiReady: event.target.value }))
                    }
                  >
                    {API_READY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option || '未设置'}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </>
            ) : null}

            {isCountry ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pb-region">区域</Label>
                  <Input
                    id="pb-region"
                    value={form.region}
                    placeholder="南亚"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, region: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pb-timezone">时区（IANA）</Label>
                  <Input
                    id="pb-timezone"
                    value={form.timezone}
                    placeholder="Asia/Colombo"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, timezone: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pb-default-currency">默认币种</Label>
                  <Input
                    id="pb-default-currency"
                    value={form.defaultCurrency}
                    placeholder="LKR"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, defaultCurrency: event.target.value }))
                    }
                  />
                </div>
              </>
            ) : null}

            {isCurrency ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pb-symbol">符号</Label>
                  <Input
                    id="pb-symbol"
                    value={form.symbol}
                    placeholder="Rs"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, symbol: event.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pb-decimals">小数位（0–4）</Label>
                  <Input
                    id="pb-decimals"
                    inputMode="numeric"
                    value={form.decimals}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, decimals: event.target.value }))
                    }
                  />
                </div>
              </>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="pb-description">说明</Label>
              <Textarea
                id="pb-description"
                value={form.description}
                rows={3}
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
            <Button
              disabled={isPending || !form.code.trim() || !form.name.trim()}
              onClick={saveForm}
            >
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
        title="删除目录项"
        description={
          deleteTarget
            ? `确认从平台目录删除「${deleteTarget.name}」？组织内已初始化的副本不受影响。`
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
