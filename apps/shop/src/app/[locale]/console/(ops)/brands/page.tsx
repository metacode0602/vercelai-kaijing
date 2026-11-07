'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 20

type BrandRow = {
  id: string
  code: string
  name: string
  status: string
  note: string
  productCount: number
  updatedAt: string
}

export default function BrandsPage() {
  const [open, setOpen] = React.useState(false)
  const [edit, setEdit] = React.useState<BrandRow | null>(null)
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')

  const utils = trpc.useUtils()
  const statsQuery = trpc.brands.stats.useQuery()
  const listQuery = trpc.brands.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })

  const createMutation = trpc.brands.create.useMutation({
    onSuccess: async (created) => {
      await utils.brands.list.invalidate()
      await utils.brands.stats.invalidate()
      await utils.brands.meta.invalidate()
      setOpen(false)
      setNotice(`${created?.code} ${created?.name} 已写入 commerce_brands。`)
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.brands.update.useMutation({
    onSuccess: async (updated) => {
      await utils.brands.list.invalidate()
      await utils.brands.stats.invalidate()
      await utils.brands.meta.invalidate()
      await utils.products.list.invalidate()
      setEdit(null)
      setNotice(`${updated?.code} 已更新。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = (listQuery.data?.items ?? []) as BrandRow[]
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data

  const createDialog = open ? (
    <UedDialog
      title="新增品牌"
      description="维护商户品牌主档；商品 SPU 创建/编辑将从此列表选择品牌。"
      fields={[
        { key: 'name', label: '品牌名称', required: true },
        { key: 'code', label: '品牌编码', placeholder: '可空，自动生成 BRD-0001' },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      initialValues={{ status: '启用' }}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          name: values.name ?? '',
          code: values.code || undefined,
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note ?? '',
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '保存品牌'}
    />
  ) : null

  const editDialog = edit ? (
    <UedDialog
      title="编辑品牌"
      description="编码创建后不可改；停用后商品新建不可再选该品牌（已关联商品保留）。"
      fields={[
        { key: 'code', label: '品牌编码', defaultValue: edit.code, readOnly: true },
        { key: 'name', label: '品牌名称', defaultValue: edit.name, required: true },
        {
          key: 'status',
          label: '状态',
          options: ['启用', '停用'],
          defaultValue: edit.status,
          required: true,
        },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: edit.note },
      ]}
      onClose={() => setEdit(null)}
      onSave={(values) => {
        updateMutation.mutate({
          id: edit.id,
          name: values.name || edit.name,
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note ?? '',
        })
      }}
      saveLabel={updateMutation.isPending ? '保存中…' : '保存修改'}
    />
  ) : null

  return (
    <>
      {createDialog}
      {editDialog}
      <UedWorkspace
        title="品牌管理"
        description="商户品牌主档 commerce_brands；与平台缓存 platform_brands 分离。已接 PostgreSQL。"
        rows={rows}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="搜索品牌编码或名称"
        filters={[{ label: '状态', options: ['启用', '停用'] }]}
        onStatusFilterChange={(value) => {
          setStatus(value === '全部' ? '全部' : value)
          setPage(1)
        }}
        addLabel="新增品牌"
        onAdd={() => setOpen(true)}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        emptyText={
          listQuery.isError
            ? `加载失败：${listQuery.error.message}`
            : listQuery.isLoading
              ? '正在从数据库加载品牌…'
              : '暂无品牌。请新增，或部署迁移 0025 后由历史商品 brand 文本回填。'
        }
        columns={[
          { key: 'code', label: '编码' },
          { key: 'name', label: '名称' },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
          {
            key: 'productCount',
            label: '关联商品',
            render: (row) => String(row.productCount),
          },
          { key: 'updatedAt', label: '更新时间' },
          { key: 'note', label: '备注' },
          {
            key: 'id',
            label: '操作',
            render: (row) => (
              <Button size="sm" variant="outline" onClick={() => setEdit(row)}>
                编辑
              </Button>
            ),
          },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '品牌总数', value: String(stats?.total ?? '—'), hint: '数据库' },
            { label: '启用', value: String(stats?.active ?? '—') },
            { label: '停用', value: String(stats?.disabled ?? '—') },
          ]}
        />
        <UedPrototypeNotice>
          软停用：状态改为停用后不再出现在商品品牌下拉；不硬删除品牌行。改名会同步已关联商品的 brand 展示名。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
