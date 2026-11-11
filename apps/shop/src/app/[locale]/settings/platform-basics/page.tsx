'use client'

import * as React from 'react'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  UedDialog,
  UedWorkspace,
  type UedColumn,
  type UedDialogField,
} from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import type { PlatformBasicsItem } from '@/lib/server/dataaccess/platform-basics'
import type { PlatformApiReadyState, PlatformBasicKind } from '@workspace/db/schema'

/**
 * 平台基础资料（组织副本）。数据由平台目录在入驻审核通过时初始化到本组织，
 * 组织内的增删改只写 commerce_platform_basics，不影响其他组织与平台目录。
 * @see docs/design/haoshiyun-platform-basics-ued.md §7
 */

const KINDS: Array<{ value: PlatformBasicKind; label: string }> = [
  { value: 'platform', label: '平台' },
  { value: 'country', label: '国家 / 站点' },
  { value: 'currency', label: '币种' },
]

const STATUS_OPTIONS = [
  { value: 'active', title: '启用' },
  { value: 'inactive', title: '停用' },
]

const API_READY_OPTIONS = [
  { value: '', title: '未设置' },
  { value: 'Connected', title: '已接入' },
  { value: 'Configuration required', title: '待配置' },
  { value: 'Planned', title: '计划中' },
]

const PAGE_SIZE = 20

function kindLabel(kind: PlatformBasicKind) {
  return KINDS.find((item) => item.value === kind)?.label ?? kind
}

function fieldsFor(kind: PlatformBasicKind): UedDialogField[] {
  const fields: UedDialogField[] = [
    {
      key: 'code',
      label: '代码',
      required: true,
      placeholder: kind === 'platform' ? 'daraz' : kind === 'country' ? 'LK' : 'LKR',
      helper:
        kind === 'platform'
          ? '小写字母开头的标识'
          : kind === 'country'
            ? '2 位国家代码'
            : '3 位币种代码',
    },
    { key: 'name', label: '名称', required: true },
    { key: 'status', label: '状态', options: STATUS_OPTIONS },
  ]
  if (kind === 'platform') {
    fields.push(
      {
        key: 'countries',
        label: '覆盖站点',
        placeholder: 'LK, MY',
        helper: '国家代码，逗号分隔',
      },
      { key: 'apiReady', label: '接入状态', options: API_READY_OPTIONS },
    )
  } else if (kind === 'country') {
    fields.push(
      { key: 'region', label: '区域', placeholder: '南亚' },
      {
        key: 'timezone',
        label: '时区',
        required: true,
        placeholder: 'Asia/Colombo',
        helper: '格式 Area/City',
      },
      { key: 'defaultCurrency', label: '默认币种', required: true, placeholder: 'LKR' },
    )
  } else {
    fields.push(
      { key: 'symbol', label: '符号', required: true, placeholder: 'Rs' },
      { key: 'decimals', label: '小数位', type: 'number', required: true, placeholder: '2', helper: '0–4' },
    )
  }
  fields.push({ key: 'description', label: '说明', type: 'textarea', fullWidth: true })
  return fields
}

function emptyInitial(kind: PlatformBasicKind): Record<string, string> {
  return {
    code: '',
    name: '',
    status: 'active',
    description: '',
    ...(kind === 'platform'
      ? { countries: '', apiReady: '' }
      : kind === 'country'
        ? { region: '', timezone: '', defaultCurrency: '' }
        : { symbol: '', decimals: '' }),
  }
}

function rowInitial(row: PlatformBasicsItem): Record<string, string> {
  return {
    code: row.code,
    name: row.name,
    status: row.status,
    description: row.description ?? '',
    countries: row.countries.join(', '),
    apiReady: row.apiReady ?? '',
    region: row.region ?? '',
    timezone: row.timezone ?? '',
    defaultCurrency: row.defaultCurrency ?? '',
    symbol: row.symbol ?? '',
    decimals: row.decimals == null ? '' : String(row.decimals),
  }
}

function buildPayload(kind: PlatformBasicKind, values: Record<string, string>) {
  const decimals = (values.decimals ?? '').trim()
  const apiReady = (values.apiReady ?? '') as PlatformApiReadyState | ''
  return {
    kind,
    code: values.code ?? '',
    name: values.name ?? '',
    status: values.status === 'inactive' ? ('inactive' as const) : ('active' as const),
    description: values.description ?? '',
    region: values.region?.trim() || null,
    timezone: values.timezone?.trim() || null,
    defaultCurrency: values.defaultCurrency?.trim() || null,
    symbol: values.symbol?.trim() || null,
    decimals: decimals === '' ? null : Number(decimals),
    countries: (values.countries ?? '')
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    apiReady: apiReady || null,
  }
}

export default function PlatformBasicsSettingsPage() {
  const utils = trpc.useUtils()
  const [kind, setKind] = React.useState<PlatformBasicKind>('platform')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [dialog, setDialog] = React.useState<'create' | 'edit' | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [initial, setInitial] = React.useState<Record<string, string>>(() =>
    emptyInitial('platform'),
  )
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.platformBasics.list.useQuery({
    kind,
    page,
    pageSize: PAGE_SIZE,
    q: q.trim() || undefined,
    status:
      statusFilter === 'active' || statusFilter === 'inactive' ? statusFilter : undefined,
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

  const createMutation = trpc.platformBasics.create.useMutation({
    onSuccess: async (row) => {
      setDialog(null)
      setNotice(`已新增 ${kindLabel(row.kind)}「${row.code} ${row.name}」`)
      await utils.platformBasics.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.platformBasics.update.useMutation({
    onSuccess: async (row) => {
      setDialog(null)
      setEditingId(null)
      setNotice(`已更新 ${kindLabel(row.kind)}「${row.code} ${row.name}」`)
      await utils.platformBasics.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeMutation = trpc.platformBasics.remove.useMutation({
    onSuccess: async () => {
      setNotice('已删除')
      await utils.platformBasics.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const initMutation = trpc.platformBasics.initFromCatalog.useMutation({
    onSuccess: async ({ inserted }) => {
      setNotice(
        inserted > 0
          ? `已从平台目录补齐 ${inserted} 条（只补缺失，不覆盖已有）`
          : '平台目录与本组织资料一致，无需补齐',
      )
      await utils.platformBasics.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  function closeDialog() {
    setDialog(null)
    setEditingId(null)
  }

  function switchKind(next: PlatformBasicKind) {
    if (next === kind) return
    closeDialog()
    setKind(next)
    setPage(1)
    setQ('')
    setStatusFilter('')
  }

  function openCreate() {
    setEditingId(null)
    setInitial(emptyInitial(kind))
    setNotice('')
    setDialog('create')
  }

  function openEdit(row: PlatformBasicsItem) {
    setEditingId(row.id)
    setInitial(rowInitial(row))
    setNotice('')
    setDialog('edit')
  }

  function saveForm(values: Record<string, string>) {
    const payload = buildPayload(kind, values)
    if (dialog === 'edit' && editingId) {
      updateMutation.mutate({ id: editingId, ...payload })
      return
    }
    createMutation.mutate(payload)
  }

  function confirmRemove(row: PlatformBasicsItem) {
    if (!window.confirm(`确认删除 ${kindLabel(row.kind)}「${row.code} ${row.name}」？只影响本组织。`)) {
      return
    }
    setNotice('')
    removeMutation.mutate({ id: row.id })
  }

  const columns: UedColumn<PlatformBasicsItem>[] = [
    { key: 'code', label: '代码' },
    { key: 'name', label: '名称' },
  ]
  if (kind === 'platform') {
    columns.push(
      {
        key: 'countries',
        label: '覆盖站点',
        render: (row) => (row.countries.length ? row.countries.join(', ') : '—'),
      },
      {
        key: 'apiReady',
        label: '接入状态',
        render: (row) => (
          <Badge variant={row.apiReady === 'Connected' ? 'secondary' : 'outline'}>
            {row.apiReady ?? '未设置'}
          </Badge>
        ),
      },
    )
  } else if (kind === 'country') {
    columns.push(
      { key: 'region', label: '区域', render: (row) => row.region || '—' },
      { key: 'timezone', label: '时区', render: (row) => row.timezone || '—' },
      { key: 'defaultCurrency', label: '默认币种' },
    )
  } else {
    columns.push(
      { key: 'symbol', label: '符号' },
      {
        key: 'decimals',
        label: '小数位',
        render: (row) => (row.decimals == null ? '—' : String(row.decimals)),
      },
    )
  }
  columns.push(
    {
      key: 'description',
      label: '说明',
      className: 'hidden lg:table-cell',
      render: (row) => row.description || '—',
    },
    {
      key: 'origin',
      label: '来源',
      render: (row) => (
        <Badge variant={row.origin === 'platform' ? 'secondary' : 'outline'}>
          {row.origin === 'platform' ? '平台初始化' : '自建'}
        </Badge>
      ),
    },
    { key: 'updatedAt', label: '更新时间' },
    {
      key: 'status',
      label: '状态',
      render: (row) => (
        <Badge variant={row.status === 'active' ? 'secondary' : 'outline'}>
          {row.status === 'active' ? '启用' : '停用'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: '操作',
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={removeMutation.isPending}
            onClick={() => confirmRemove(row)}
          >
            删除
          </Button>
        </div>
      ),
    },
  )

  const editor =
    dialog === null ? null : (
      <UedDialog
        title={`${dialog === 'create' ? '新增' : '编辑'}${kindLabel(kind)}`}
        description="写入本组织 commerce_platform_basics；平台目录不受影响。"
        fields={fieldsFor(kind)}
        initialValues={initial}
        onClose={closeDialog}
        onSave={saveForm}
        saveLabel={
          createMutation.isPending || updateMutation.isPending
            ? '保存中…'
            : dialog === 'create'
              ? '创建'
              : '保存'
        }
      />
    )

  return (
    <>
      {editor}
      <UedWorkspace
        title="平台基础资料"
        description="平台 / 国家站点 / 币种：入驻审核通过时由平台目录初始化，组织内可自行增删改。"
        rows={rows}
        columns={columns}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="搜索代码、名称或说明"
        filters={[{ label: '状态', key: 'status', options: ['启用', '停用'] }]}
        onStatusFilterChange={(value) => {
          setStatusFilter(value === '启用' ? 'active' : value === '停用' ? 'inactive' : '')
          setPage(1)
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
        }}
        emptyText={
          listQuery.isLoading
            ? '加载中…'
            : `暂无${kindLabel(kind)}。点「从平台目录补齐」初始化，或点「新增」手工添加。`
        }
        addLabel="新增"
        onAdd={openCreate}
      >
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="资料类型">
          {KINDS.map((item) => (
            <Button
              key={item.value}
              type="button"
              role="tab"
              size="sm"
              aria-selected={kind === item.value}
              variant={kind === item.value ? 'default' : 'outline'}
              onClick={() => switchKind(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <Alert>
          <AlertTitle>仓库（WMS）主数据不在本页</AlertTitle>
          <AlertDescription>
            仓库在 WMS 中单独维护，
            <LocaleLink href="/console/warehouse" className="underline">
              打开 WMS 仓库
            </LocaleLink>
            。
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={initMutation.isPending}
            onClick={() => {
              setNotice('')
              initMutation.mutate()
            }}
          >
            {initMutation.isPending ? '补齐中…' : '从平台目录补齐'}
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
