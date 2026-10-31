'use client'

import * as React from 'react'
import { Badge } from '@workspace/ui/components/badge'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  FEE_TEMPLATE_TYPE_LABEL,
  FULFILLMENT_POOL_OPTIONS,
  addFeeTemplate,
  createFeeTemplateVersionDraft,
  listFeeTemplateVersions,
  useFeeTemplateStore,
  type FeeTemplate,
  type FeeTemplateStatus,
  type FeeTemplateType,
} from '@/lib/crossborder/fee-template-store'

export default function FeeTemplatesPage() {
  const state = useFeeTemplateStore()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const rows = state.templates.map((row) => {
    const versions = listFeeTemplateVersions(row.id)
    const published = versions.filter((v) => v.published)
    const top = published[0]
    return {
      ...row,
      typeLabel: FEE_TEMPLATE_TYPE_LABEL[row.type],
      versionCount: versions.length,
      topPriority: top?.priority ?? '—',
      topVersion: top ? `v${top.versionNo}` : '无已发布',
      logisticsLabel: row.fulfillmentLogistics || '不限',
    }
  })

  const editor = open ? (
    <UedDialog
      title="新建费用模板"
      description="按平台、国家、履约池与物流形态配置进口税或平台费；版本支持有效期与人工优先级。"
      fields={[
        { key: 'code', label: '模板编码', required: true, placeholder: '如 daraz_lk_import_custom' },
        { key: 'name', label: '名称', required: true },
        { key: 'platform', label: '平台', options: ['daraz', 'lazada'], required: true },
        { key: 'country', label: '国家', options: ['LK', 'MY', 'ID', 'TH', 'PH', 'VN'], required: true },
        {
          key: 'fulfillmentPool',
          label: '履约池',
          options: [...FULFILLMENT_POOL_OPTIONS],
          required: true,
        },
        {
          key: 'fulfillmentLogistics',
          label: '物流形态（可空=不限）',
          options: ['', 'FCL', 'LCL', 'AIR_DDP', 'FCL20', 'FCL40'],
        },
        {
          key: 'type',
          label: '类型',
          options: ['import_tax', 'platform_fee'],
          required: true,
          helper: 'import_tax=进口税叠；platform_fee=佣金/支付费等',
        },
        { key: 'status', label: '状态', options: ['启用', '停用', '草稿'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const type = (values.type === 'platform_fee' ? 'platform_fee' : 'import_tax') as FeeTemplateType
        const status = (values.status as FeeTemplateStatus) || '草稿'
        const id = addFeeTemplate({
          code: values.code || `fee_${Date.now()}`,
          name: values.name || '未命名费用模板',
          platform: values.platform || 'daraz',
          country: values.country || 'LK',
          fulfillmentPool: values.fulfillmentPool || 'daraz_lk_sea_lot',
          fulfillmentLogistics: values.fulfillmentLogistics || '',
          type,
          status,
          note: values.note || '',
        })
        createFeeTemplateVersionDraft(id)
        setOpen(false)
        setNotice(`已创建模板 ${id} 及草稿版本 v1；请进入详情编辑组件并发布。`)
      }}
      saveLabel="创建模板"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="费用模板"
        description="按平台、国家、履约配置进口税与平台费版本；测算按有效期+优先级解析，保存柜次成本时写入版本 ID 与组件快照。"
        rows={rows}
        detailHref={(row) => `/console/fee-templates/${encodeURIComponent(row.id)}`}
        searchKeys={['code', 'name', 'platform', 'country', 'fulfillmentPool', 'typeLabel', 'status']}
        searchPlaceholder="搜索编码、名称、平台或履约池"
        addLabel="新建费用模板"
        onAdd={() => setOpen(true)}
        filters={[
          { label: '平台', options: ['daraz', 'lazada'], key: 'platform' },
          { label: '国家', options: ['LK', 'MY', 'ID', 'TH'], key: 'country' },
          { label: '履约池', options: [...FULFILLMENT_POOL_OPTIONS], key: 'fulfillmentPool' },
          { label: '类型', options: ['import_tax', 'platform_fee'], key: 'type' },
          { label: '状态', options: ['启用', '停用', '草稿'], key: 'status' },
        ]}
        columns={[
          { key: 'code', label: '编码' },
          { key: 'name', label: '名称' },
          { key: 'platform', label: '平台' },
          { key: 'country', label: '国家' },
          { key: 'fulfillmentPool', label: '履约池' },
          { key: 'logisticsLabel', label: '物流' },
          {
            key: 'typeLabel',
            label: '类型',
            render: (row) => (
              <Badge variant={row.type === 'import_tax' ? 'secondary' : 'outline'}>{row.typeLabel}</Badge>
            ),
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
          { key: 'topVersion', label: '当前版本' },
          { key: 'topPriority', label: '优先级' },
          { key: 'versionCount', label: '版本数' },
        ]}
      >
        <UedPrototypeNotice>
          审计结论（用户已确认）：允许有效期重叠，必须人工优先级；履约两级=业务履约池+物流形态；import_tax
          与 platform_fee 两套类型可组合引用；保存柜次成本写入 feeTemplateVersionId + components
          快照。本页为 localStorage UED，无 tRPC。
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
