'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { trpc } from '@/lib/trpc/client'

const PAGE_SIZE = 50

export default function CartonSpecsPage() {
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const utils = trpc.useUtils()
  const dictionariesQuery = trpc.dictionaries.list.useQuery()
  const listQuery = trpc.cartonSpecs.list.useQuery({ page, pageSize: PAGE_SIZE, q: q || undefined })
  const createMutation = trpc.cartonSpecs.create.useMutation({
    onSuccess: async (created) => {
      await utils.cartonSpecs.list.invalidate()
      setOpen(false)
      setNotice(`${created.code} ${created.name} 已写入 commerce_carton_specs。`)
    },
    onError: (e) => setNotice(e.message),
  })
  const packDict = dictionariesQuery.data?.find((d) => d.key === 'product_pack')
  const packOptions = (packDict?.values ?? [])
    .filter((value) => !(packDict?.inactiveValues ?? []).includes(value))
    .map((value) => ({ value, title: packDict?.valueTitles?.[value] ?? value }))
  const packTitles = packDict?.valueTitles ?? {}
  const rows = listQuery.data?.items ?? []
  const editor = open ? (
    <UedDialog
      title="新增箱规"
      description="箱规是独立主数据，引用「包装规格」字典值。"
      fields={[
        { key: 'name', label: '箱规名称', required: true },
        { key: 'applicablePack', label: '适用包装规格', options: packOptions.length ? packOptions : ['单件'], required: true },
        { key: 'lengthCm', label: '长（cm）', type: 'number', required: true },
        { key: 'widthCm', label: '宽（cm）', type: 'number', required: true },
        { key: 'heightCm', label: '高（cm）', type: 'number', required: true },
        { key: 'grossWeightKg', label: '毛重（kg）', type: 'number', required: true },
        { key: 'unitsPerCarton', label: '每箱件数', type: 'number', required: true },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          name: values.name || '未命名箱规',
          applicablePack: values.applicablePack || packOptions[0]?.value || '单件',
          lengthCm: Number(values.lengthCm) || 0,
          widthCm: Number(values.widthCm) || 0,
          heightCm: Number(values.heightCm) || 0,
          grossWeightKg: Number(values.grossWeightKg) || 0,
          unitsPerCarton: Number(values.unitsPerCarton) || 1,
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '保存箱规'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="箱规管理"
        description="运输包装独立维护（commerce_carton_specs）；与 ocean_shipment_boxes 柜次装箱行分离。"
        rows={rows}
        detailHref={(row) => `/console/carton-specs/${encodeURIComponent(row.code)}`}
        search={q}
        onSearchChange={(value) => { setQ(value); setPage(1) }}
        searchPlaceholder="搜索箱规、包装规格或状态"
        addLabel="新增箱规"
        onAdd={() => setOpen(true)}
        pagination={{ page, pageSize: PAGE_SIZE, total: listQuery.data?.total ?? 0, onPageChange: setPage }}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无箱规。请新增或运行 db:seed:commerce-carton-specs。'}
        columns={[
          { key: 'code', label: '箱规编码' },
          { key: 'name', label: '箱规名称' },
          { key: 'applicablePack', label: '适用包装规格', render: (row) => packTitles[row.applicablePack] ?? row.applicablePack },
          { key: 'dimensions', label: '尺寸 cm', render: (row) => `${row.lengthCm}×${row.widthCm}×${row.heightCm}` },
          { key: 'grossWeightKg', label: '毛重 kg', render: (row) => String(row.grossWeightKg) },
          { key: 'unitsPerCarton', label: '每箱件数', render: (row) => String(row.unitsPerCarton) },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>ocean_shipment_boxes 是柜次装箱行，不是箱规主数据。</UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
