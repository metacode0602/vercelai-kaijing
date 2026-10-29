'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { addSupplier, useSuppliers } from '@/lib/crossborder/supplier-store'
import { Badge } from '@workspace/ui/components/badge'

export default function SuppliersPage() {
  const suppliers = useSuppliers()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

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
        addSupplier(suppliers, {
          name: values.name ?? '',
          contact: values.contact ?? '',
          phone: values.phone ?? '',
          email: values.email ?? '—',
          settlement: values.settlement ?? '待确认',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note ?? '',
        })
        setOpen(false)
        setNotice('供应商已加入本次原型会话；供应商货号页面会立即读取最新供应商列表。')
      }}
      saveLabel="保存供应商"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="供应商管理"
        description="维护商户供应商主档；供应商货号的供应商选项读取本列表。"
        rows={suppliers}
        detailHref={(row) => `/console/suppliers/${encodeURIComponent(row.code)}`}
        searchKeys={['code', 'name', 'contact', 'phone', 'email', 'status']}
        searchPlaceholder="搜索供应商编码、名称、联系人或电话"
        addLabel="新增供应商"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'code', label: '供应商编码' },
          { key: 'name', label: '供应商' },
          { key: 'contact', label: '联系人' },
          { key: 'phone', label: '电话' },
          { key: 'settlement', label: '结算方式' },
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
        <UedPrototypeNotice>
          供应商主档维护联系人、结算和启停；SKU 采购来源、厂家款号、报价与交期在「供应商货号」维护。停用供应商不影响历史采购单。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
