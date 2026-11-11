'use client'

import * as React from 'react'
import {
  DetailKpiRow,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import {
  UedDialog,
  UedPrototypeNotice,
  UedWorkspace,
} from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type AlertStatus = 'critical' | 'open' | 'muted' | 'resolved' | 'disabled'

const STATUS_LABEL: Record<AlertStatus, string> = {
  critical: '紧急补货',
  open: '低于阈值',
  muted: '已静音',
  resolved: '正常',
  disabled: '已停用',
}

function statusVariant(status: AlertStatus) {
  if (status === 'critical') return 'destructive' as const
  if (status === 'open') return 'secondary' as const
  if (status === 'muted') return 'outline' as const
  return 'outline' as const
}

type FormValues = {
  variantId: string
  threshold: string
  reason: string
}

const emptyForm = (): FormValues => ({ variantId: '', threshold: '20', reason: '' })

export default function StockAlertsSettingsPage() {
  const utils = trpc.useUtils()
  const [page, setPage] = React.useState(1)
  const pageSize = 20
  const [keyword, setKeyword] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')

  const listQuery = trpc.stockAlerts.list.useQuery({
    page,
    pageSize,
    q: keyword || undefined,
    status: statusFilter || undefined,
  })
  const meta = trpc.stockAlerts.meta.useQuery()
  const skuQuery = trpc.products.listSkus.useQuery({ page: 1, pageSize: 100 })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

  const [notice, setNotice] = React.useState('')
  const [dialog, setDialog] = React.useState<'create' | 'edit' | null>(null)
  const [initial, setInitial] = React.useState<FormValues>(emptyForm())

  const upsertMutation = trpc.stockAlerts.upsert.useMutation({
    onSuccess: async (row) => {
      setDialog(null)
      setNotice(
        `已保存 ${row.sku} 阈值 ${row.threshold}（可用 ${row.available} → ${STATUS_LABEL[row.status]}）`,
      )
      await utils.stockAlerts.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const muteMutation = trpc.stockAlerts.setMuted.useMutation({
    onSuccess: async (row) => {
      setNotice(`${row.sku} 已${row.muted ? '静音' : '取消静音'}`)
      await utils.stockAlerts.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const deleteMutation = trpc.stockAlerts.delete.useMutation({
    onSuccess: async () => {
      setNotice('已停用预警配置（不物理删除，历史审计保留）')
      await utils.stockAlerts.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const variantOptions = React.useMemo(
    () =>
      (skuQuery.data?.items ?? []).map((v) => ({
        value: v.id,
        title: `${v.code || v.sku} · ${v.name}`.trim(),
      })),
    [skuQuery.data],
  )

  const FORM_FIELDS = [
    {
      key: 'variantId',
      label: '内部 SKU',
      options: variantOptions,
      searchable: true,
      required: true,
      placeholder: '搜索 SKU 或商品名',
      helper: '按内部 SKU 维度维护阈值；同一 SKU 仅一条配置。',
    },
    { key: 'threshold', label: '补货阈值', type: 'number', required: true, helper: '可用 < 阈值 触发告警；可用 ≤ 0 为紧急。' },
    { key: 'reason', label: '变更原因', type: 'textarea', fullWidth: true, helper: '写入变更审计，便于回溯。' },
  ]

  function openCreate() {
    setInitial(emptyForm())
    setDialog('create')
  }

  function openEdit(row: (typeof rows)[number]) {
    setInitial({
      variantId: row.variantId,
      threshold: String(row.threshold),
      reason: '',
    })
    setDialog('edit')
  }

  function saveForm(values: Record<string, string>) {
    const threshold = Number(values.threshold)
    if (!Number.isFinite(threshold) || threshold < 0) {
      setNotice('阈值必须为非负整数')
      return
    }
    if (!values.variantId) {
      setNotice('请选择 SKU')
      return
    }
    upsertMutation.mutate({
      variantId: values.variantId,
      threshold,
      reason: values.reason || undefined,
    })
  }

  const editor =
    dialog === null ? null : (
      <UedDialog
        title={dialog === 'create' ? '新建库存预警阈值' : '编辑库存预警阈值'}
        description="写入 stock_alerts；阈值变更实时影响列表告警派生，历史阈值在变更审计中可查。"
        fields={FORM_FIELDS}
        initialValues={initial}
        onClose={() => {
          setDialog(null)
        }}
        onSave={saveForm}
        saveLabel={
          upsertMutation.isPending ? '保存中…' : dialog === 'create' ? '创建' : '保存'
        }
      />
    )

  return (
    <>
      {editor}
      <ConsoleBreadcrumbRegistration
        items={[{ label: '设置', href: '/settings' }, { label: '库存预警阈值', href: '/settings/stock-alerts' }]}
      />
      <UedWorkspace
        title="库存预警阈值"
        description="按内部 SKU 维护补货阈值与静音；阈值变更实时生效并写入变更审计。"
        rows={rows}
        search={keyword}
        onSearchChange={(v) => {
          setKeyword(v)
          setPage(1)
        }}
        searchPlaceholder="搜索 SKU 或商品名"
        filters={[
          {
            label: '状态',
            options: ['critical', 'open', 'muted', 'resolved'],
            key: 'status',
          },
        ]}
        onStatusFilterChange={(v) => {
          setStatusFilter(v)
          setPage(1)
        }}
        emptyText={
          listQuery.isLoading
            ? '加载中…'
            : '暂无预警配置。点击「新建」按 SKU 维护阈值，写余额后自动派生告警状态。'
        }
        addLabel="新建"
        onAdd={openCreate}
        pagination={{ page, pageSize, total, onPageChange: setPage }}
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'title', label: '商品' },
          {
            key: 'threshold',
            label: '阈值',
            render: (row) => <span className="tabular-nums">{row.threshold}</span>,
          },
          {
            key: 'available',
            label: '可用',
            render: (row) => (
              <span className="tabular-nums">
                {row.available}
                {row.alert === 'critical' ? (
                  <span className="ml-1 text-destructive">·</span>
                ) : null}
              </span>
            ),
          },
          {
            key: 'alert',
            label: '实时告警',
            render: (row) =>
              row.alert ? (
                <Badge variant={row.alert === 'critical' ? 'destructive' : 'secondary'}>
                  {row.alert === 'critical' ? '紧急补货' : '低于阈值'}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              ),
          },
          {
            key: 'status',
            label: '配置状态',
            render: (row) => (
              <Badge variant={statusVariant(row.status)}>{STATUS_LABEL[row.status]}</Badge>
            ),
          },
          { key: 'triggeredAt', label: '触发时间', render: (row) => row.triggeredAt || '—' },
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
                  disabled={muteMutation.isPending}
                  onClick={() =>
                    muteMutation.mutate({ id: row.id, muted: !row.muted })
                  }
                >
                  {row.muted ? '取消静音' : '静音'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`确认停用 ${row.sku} 的预警配置？不会物理删除，历史审计保留。`)) {
                      deleteMutation.mutate({ id: row.id })
                    }
                  }}
                >
                  停用
                </Button>
              </div>
            ),
          },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '配置数', value: String(total) },
            {
              label: '紧急补货',
              value: String(rows.filter((r) => r.status === 'critical').length),
              hint: '当前页',
            },
            {
              label: '低于阈值',
              value: String(rows.filter((r) => r.status === 'open').length),
              hint: '当前页',
            },
            {
              label: '已静音',
              value: String(rows.filter((r) => r.muted).length),
              hint: '当前页',
            },
          ]}
        />
        <UedPrototypeNotice>
          {meta.data?.note ||
            '阈值按内部 SKU 维护；可用 = 在库 − 预留 − 质检冻结 − 残次。阈值变更实时影响列表告警派生，历史阈值在「设置 → 变更审计」可查。'}
        </UedPrototypeNotice>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
