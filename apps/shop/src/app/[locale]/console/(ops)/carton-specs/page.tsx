'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { addCartonSpec, useCartonSpecs } from '@/lib/crossborder/carton-spec-store'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'

export default function CartonSpecsPage() {
  const rows = useCartonSpecs()
  const dictionaries = useDictionaries()
  const packOptions = activeDictionaryValues(dictionaries, 'product_pack')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="新增箱规"
      description="箱规是独立主数据，引用「包装规格」字典值；商品只选包装规格，不在这里维护商品。"
      fields={[
        { key: 'name', label: '箱规名称', required: true, placeholder: '如 标准快递箱 / 海运整箱' },
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
        addCartonSpec(rows, {
          name: values.name || '未命名箱规',
          applicablePack: values.applicablePack || packOptions[0] || '单件',
          lengthCm: Number(values.lengthCm) || 0,
          widthCm: Number(values.widthCm) || 0,
          heightCm: Number(values.heightCm) || 0,
          grossWeightKg: Number(values.grossWeightKg) || 0,
          unitsPerCarton: Number(values.unitsPerCarton) || 0,
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
        setOpen(false)
        setNotice('箱规已加入本次原型会话；运费测算读取启用的箱规。')
      }}
      saveLabel="保存箱规"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="箱规管理"
        description="运输包装独立维护，引用售卖包装规格；商品表单不出现长宽高/重量字段。"
        rows={rows}
        searchKeys={['id', 'name', 'applicablePack', 'status', 'note']}
        searchPlaceholder="搜索箱规、包装规格或状态"
        addLabel="新增箱规"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '箱规 ID' },
          { key: 'name', label: '箱规名称' },
          { key: 'applicablePack', label: '适用包装规格' },
          { key: 'dimensions', label: '尺寸 cm', render: (row) => `${row.lengthCm}×${row.widthCm}×${row.heightCm}` },
          { key: 'grossWeightKg', label: '毛重 kg', render: (row) => String(row.grossWeightKg) },
          { key: 'unitsPerCarton', label: '每箱件数', render: (row) => String(row.unitsPerCarton) },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          包装规格回答“怎么卖”，箱规回答“怎么发”。两者不合并：商品 SKU 只选包装规格，箱规引用包装规格；运费测算和入库使用箱规。停用箱规不影响历史单据。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
