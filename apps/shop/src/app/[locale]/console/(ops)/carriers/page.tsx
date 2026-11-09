'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

export default function CarriersPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.carriers.list.useQuery({ page: 1, pageSize: 100 })
  const meta = trpc.carriers.meta.useQuery()
  const rows = listQuery.data?.items ?? []
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const createMutation = trpc.carriers.create.useMutation({
    onSuccess: async () => {
      setOpen(false)
      setNotice('承运商已落库。运价请在运价卡维护。')
      await utils.carriers.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const editor = open ? (
    <UedDialog
      title="新增承运商"
      description="租户自维护承运商主档；运价卡可引用。"
      fields={[
        { key: 'name', label: '承运商名称', required: true },
        { key: 'type', label: '类型', options: [...(meta.data?.types ?? ['国际快递', '海运', '平台物流', '尾程派送'])], required: true },
        { key: 'coverage', label: '覆盖线路', required: true, placeholder: '如 CN → LK / MY' },
        { key: 'contact', label: '联系人' },
        { key: 'phone', label: '联系电话' },
        { key: 'status', label: '状态', options: [...(meta.data?.statuses ?? ['启用', '停用'])], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          name: values.name || '未命名承运商',
          type: values.type || '国际快递',
          coverage: values.coverage || '',
          contact: values.contact || '',
          phone: values.phone || '',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
      }}
      saveLabel="保存承运商"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="承运商管理"
        description="commerce_carriers 主档；运费估算关联 fee_templates / ocean_shipments。"
        rows={rows}
        detailHref={(row) => `/console/carriers/${encodeURIComponent(row.code)}`}
        searchKeys={['code', 'name', 'type', 'coverage', 'contact', 'phone', 'status']}
        searchPlaceholder="搜索承运商、类型或覆盖线路"
        addLabel="新增承运商"
        onAdd={() => setOpen(true)}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无承运商。可新增主档；真实报价 API 待平台/承运商授权。'}
        columns={[
          { key: 'code', label: '承运商编码' },
          { key: 'name', label: '承运商' },
          { key: 'type', label: '类型' },
          { key: 'coverage', label: '覆盖线路' },
          { key: 'contact', label: '联系人' },
          { key: 'phone', label: '电话' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>,
          },
        ]}
      >
        <UedPrototypeNotice>
          运价卡可关联承运商；实时报价接口暂未接入。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
