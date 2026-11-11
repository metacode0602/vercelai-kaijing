'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function InventoryPoolsPage() {
  const utils = trpc.useUtils()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [noticeError, setNoticeError] = React.useState(false)

  const poolsQuery = trpc.wms.listInventoryPools.useQuery({ page: 1, pageSize: 100 })
  const warehousesQuery = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 100 })
  const assignmentsQuery = trpc.wms.listShopPoolAssignments.useQuery()

  const showOk = (message: string) => {
    setNoticeError(false)
    setNotice(message)
  }
  const showErr = (message: string) => {
    setNoticeError(true)
    setNotice(message)
  }

  const invalidate = async () => {
    await Promise.all([
      utils.wms.listInventoryPools.invalidate(),
      utils.wms.listShopPoolAssignments.invalidate(),
    ])
  }

  const createMutation = trpc.wms.createInventoryPool.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setCreateOpen(false)
      showOk(`已创建库存池 ${row.code}`)
    },
    onError: (error) => showErr(error.message),
  })
  const updateMutation = trpc.wms.updateInventoryPool.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setEditingId(null)
      showOk(`已更新库存池 ${row.code}`)
    },
    onError: (error) => showErr(error.message),
  })
  const assignMutation = trpc.wms.assignShopInventoryPool.useMutation({
    onSuccess: async () => {
      await invalidate()
      setAssignOpen(false)
      showOk('店铺库存池分配已保存')
    },
    onError: (error) => showErr(error.message),
  })

  const pools = poolsQuery.data?.items ?? []
  const warehouses = warehousesQuery.data?.items ?? []
  const assignments = assignmentsQuery.data ?? []
  const editing = pools.find((item) => item.id === editingId) ?? null
  const warehouseOptions = warehouses.map((item) => ({
    value: item.id,
    title: `${item.code} · ${item.name}`,
  }))
  const shopOptions = assignments.map((item) => ({
    value: item.shopId,
    title: item.poolCode
      ? `${item.shopName} · ${item.platform}（当前 ${item.poolCode}）`
      : `${item.shopName} · ${item.platform}（未加入）`,
  }))
  const poolOptions = [
    { value: '', title: '退出共享池' },
    ...pools.filter((item) => item.status === '启用').map((item) => ({
      value: item.id,
      title: `${item.code} · ${item.name}`,
    })),
  ]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>库存池已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          读取并写入 inventory_pools，店铺通过 shops.inventory_pool_id 加入或退出。不使用演示数据。
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '库存池', value: String(poolsQuery.data?.total ?? pools.length) },
          { label: '启用', value: String(pools.filter((item) => item.status === '启用').length) },
          { label: '已分配店铺', value: String(assignments.filter((item) => item.poolId).length) },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          新建库存池
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} disabled={assignments.length === 0}>
          分配店铺
        </Button>
      </div>
      {notice ? (
        <p role="status" className={`text-sm ${noticeError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {notice}
        </p>
      ) : null}

      {createOpen ? (
        <UedDialog
          title="新建库存池"
          description="库存池挂在仓库上，编码创建后不可变。"
          fields={[
            { key: 'code', label: '库存池编码', required: true, placeholder: '如 POOL-XMN-SHARED' },
            { key: 'name', label: '名称', required: true },
            {
              key: 'warehouseId',
              label: '所属仓库',
              required: true,
              options: warehouseOptions.length > 0 ? warehouseOptions : [{ value: '', title: '暂无仓库，请先创建仓库' }],
            },
            { key: 'status', label: '状态', options: ['启用', '停用'], defaultValue: '启用' },
            { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
          ]}
          onClose={() => setCreateOpen(false)}
          onSave={(values) => {
            if (!values.warehouseId) {
              showErr('请选择所属仓库')
              return
            }
            createMutation.mutate({
              code: values.code,
              name: values.name,
              warehouseId: values.warehouseId,
              status: values.status,
              note: values.note,
            })
          }}
        />
      ) : null}

      {editing ? (
        <UedDialog
          title={`编辑库存池 ${editing.code}`}
          description="编码创建后不可变；停用后店铺不可新加入。"
          fields={[
            { key: 'name', label: '名称', required: true, defaultValue: editing.name },
            {
              key: 'warehouseId',
              label: '所属仓库',
              required: true,
              options: warehouseOptions,
              defaultValue: editing.warehouseId,
            },
            { key: 'status', label: '状态', options: ['启用', '停用'], defaultValue: editing.status },
            { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: editing.note },
          ]}
          onClose={() => setEditingId(null)}
          onSave={(values) =>
            updateMutation.mutate({
              id: editing.id,
              name: values.name,
              warehouseId: values.warehouseId,
              status: values.status,
              note: values.note,
            })
          }
        />
      ) : null}

      {assignOpen ? (
        <UedDialog
          title="分配店铺到库存池"
          description="一个店铺同一时间只能加入一个库存池；选择「退出共享池」将清空绑定。"
          fields={[
            {
              key: 'shopId',
              label: '店铺',
              required: true,
              options: shopOptions.length > 0 ? shopOptions : [{ value: '', title: '暂无店铺' }],
            },
            {
              key: 'poolId',
              label: '库存池',
              options: poolOptions,
            },
          ]}
          onClose={() => setAssignOpen(false)}
          onSave={(values) => {
            if (!values.shopId) {
              showErr('请选择店铺')
              return
            }
            assignMutation.mutate({
              shopId: values.shopId,
              poolId: values.poolId ? values.poolId : null,
            })
          }}
        />
      ) : null}

      <UedWorkspace
        title="库存池"
        description="inventory_pools · 多店铺共享仓库库存"
        rows={pools}
        searchKeys={['code', 'name', 'warehouseCode', 'status', 'note']}
        searchPlaceholder="搜索编码、名称或仓库"
        filters={[{ label: '状态', options: ['启用', '停用'] }]}
        emptyText={poolsQuery.isLoading ? '加载中…' : '暂无库存池'}
        columns={[
          { key: 'code', label: '编码' },
          { key: 'name', label: '名称' },
          { key: 'warehouseCode', label: '仓库' },
          { key: 'shopCount', label: '店铺数', render: (row) => String(row.shopCount) },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
          { key: 'note', label: '备注' },
          { key: 'updatedAt', label: '更新时间' },
          {
            key: 'actions',
            label: '操作',
            render: (row) => (
              <Button size="sm" variant="ghost" onClick={() => setEditingId(row.id)}>
                编辑
              </Button>
            ),
          },
        ]}
      />
    </div>
  )
}
