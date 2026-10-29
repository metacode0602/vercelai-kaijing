'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { addCarrier, useCarriers } from '@/lib/crossborder/carrier-store'

export default function CarriersPage() {
  const rows = useCarriers()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="新增承运商"
      description="租户自维护承运商主档；运费测算和物流单据会读取启用的承运商。"
      fields={[
        { key: 'name', label: '承运商名称', required: true },
        { key: 'type', label: '类型', options: ['国际快递', '海运', '平台物流', '尾程派送'], required: true },
        { key: 'coverage', label: '覆盖线路', required: true, placeholder: '如 CN → LK / MY' },
        { key: 'contact', label: '联系人' },
        { key: 'phone', label: '联系电话' },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        addCarrier(rows, {
          name: values.name || '未命名承运商',
          type: (values.type || '国际快递') as '国际快递' | '海运' | '平台物流' | '尾程派送',
          coverage: values.coverage || '待补充',
          contact: values.contact || '—',
          phone: values.phone || '—',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
        setOpen(false)
        setNotice('承运商已加入本次原型会话；运费测算会读取启用的承运商。')
      }}
      saveLabel="保存承运商"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="承运商管理"
        description="租户自维护国际快递、海运、平台物流与尾程承运商；停用不影响历史单据。"
        rows={rows}
        detailHref={(row) => `/console/carriers/${encodeURIComponent(row.code)}`}
        searchKeys={['code', 'name', 'type', 'coverage', 'contact', 'phone', 'status']}
        searchPlaceholder="搜索承运商、类型或覆盖线路"
        addLabel="新增承运商"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'code', label: '承运商编码' },
          { key: 'name', label: '承运商' },
          { key: 'type', label: '类型' },
          { key: 'coverage', label: '覆盖线路' },
          { key: 'contact', label: '联系人' },
          { key: 'phone', label: '电话' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          承运商由租户自行维护；平台物流（Daraz Express / LGS / JSB）也作为承运商记录，便于运费测算和物流单据统一选择。停用后不再出现在新建下拉。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
