'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

const PAGE_SIZE = 20

export default function SuppliersPage() {
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')

  const utils = trpc.useUtils()
  const statsQuery = trpc.suppliers.stats.useQuery()
  const listQuery = trpc.suppliers.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: async (created) => {
      await utils.suppliers.list.invalidate()
      await utils.suppliers.stats.invalidate()
      await utils.suppliers.meta.invalidate()
      setOpen(false)
      setNotice(`${created.code} ${created.name} 已写入 commerce_suppliers。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data

  const editor = open ? (
    <UedDialog
      title="新增供应商"
      description="维护商户供应商主档；保存后供应商货号的供应商下拉会同步读取。"
      fields={[
        { key: 'name', label: '供应商名称', required: true },
        { key: 'contact', label: '联系人', required: true },
        { key: 'phone', label: '联系电话', required: true },
        { key: 'email', label: '邮箱' },
        { key: 'settlement', label: '结算方式', placeholder: '如 月结 30 天 / 现结' },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        return createMutation.mutateAsync({
          name: values.name ?? '',
          contact: values.contact ?? '',
          phone: values.phone ?? '',
          email: values.email ?? '',
          settlement: values.settlement ?? '',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note ?? '',
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '保存供应商'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="供应商管理"
        description="维护商户供应商主档；供应商货号的供应商选项读取本列表。已接 PostgreSQL。"
        rows={rows}
        detailHref={(row) => `/console/suppliers/${encodeURIComponent(row.code)}`}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="搜索供应商编码、名称、联系人或电话"
        filters={[{ label: '状态', options: ['启用', '停用'] }]}
        onStatusFilterChange={(value) => {
          setStatus(value === '全部' ? '全部' : value)
          setPage(1)
        }}
        addLabel="新增供应商"
        onAdd={() => setOpen(true)}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        emptyText={
          listQuery.isError
            ? `加载失败：${listQuery.error.message}`
            : listQuery.isLoading
              ? '正在从数据库加载供应商…'
              : '暂无供应商。点击新增或跑 db:seed:commerce-suppliers。'
        }
        columns={[
          { key: 'code', label: '供应商编码' },
          { key: 'name', label: '供应商' },
          { key: 'contact', label: '联系人' },
          { key: 'phone', label: '电话' },
          { key: 'settlement', label: '结算方式' },
          {
            key: 'skuCount',
            label: '货号数',
            render: (row) => String(row.skuCount),
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
          { key: 'note', label: '备注' },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '供应商', value: String(stats?.total ?? '—'), hint: '数据库' },
            { label: '启用', value: String(stats?.active ?? '—') },
            { label: '停用', value: String(stats?.disabled ?? '—') },
          ]}
        />
        <UedPrototypeNotice>
          供应商主档维护联系人、结算和启停；SKU 采购来源、厂家款号、报价与交期在「供应商货号」维护。停用供应商不影响历史采购单。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
