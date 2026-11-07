'use client'

import * as React from 'react'
import { Badge } from '@workspace/ui/components/badge'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  FEE_TEMPLATE_TYPE_LABEL,
  FULFILLMENT_POOL_OPTIONS,
  type FeeTemplateType,
} from '@/lib/crossborder/fee-template-store'
import { trpc } from '@/lib/trpc/client'

export default function FeeTemplatesPage() {
  const utils = trpc.useUtils()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.feeTemplates.list.useQuery({ page: 1, pageSize: 100 })
  const createMutation = trpc.feeTemplates.create.useMutation({
    onSuccess: async (row) => {
      await utils.feeTemplates.list.invalidate()
      setOpen(false)
      setNotice(`已创建模板 ${row.code}（${row.id}）及草稿版本；请进入详情编辑组件并提交/发布。`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = (listQuery.data?.items ?? []).map((row) => ({
    ...row,
    typeLabel: row.typeLabel || FEE_TEMPLATE_TYPE_LABEL[(row.type as FeeTemplateType) ?? 'import_tax'] || row.type,
    status: row.statusLabel,
    logisticsLabel: row.logisticsLabel || row.fulfillmentLogistics || '不限',
    topPriority: row.topPriority ?? '—',
    topVersion: row.topVersion || '无已发布',
    versionCount: row.versionCount ?? 0,
  }))

  const editor = open ? (
    <UedDialog
      title="新建费用模板"
      description="按平台、国家、履约池与物流形态配置进口税或平台费；版本支持有效期与人工优先级。写入 PostgreSQL。"
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
          options: ['', 'FCL', 'LCL', 'AIR_DDP', 'FCL20', 'FCL40', 'SEA'],
        },
        {
          key: 'type',
          label: '类型',
          options: ['import_tax', 'platform_fee', 'ocean_freight'],
          required: true,
          helper: 'import_tax=进口税；platform_fee=平台费；ocean_freight=海运运费',
        },
        { key: 'status', label: '状态', options: ['草稿', '启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          code: values.code || `fee_${Date.now()}`,
          name: values.name || '未命名费用模板',
          platform: values.platform || 'daraz',
          country: values.country || 'LK',
          fulfillmentPool: values.fulfillmentPool || 'daraz_lk_sea_lot',
          fulfillmentLogistics: values.fulfillmentLogistics || '',
          type: values.type === 'platform_fee' ? 'platform_fee' : values.type === 'ocean_freight' ? 'ocean_freight' : 'import_tax',
          status: values.status || '草稿',
          note: values.note || '',
          withDraftVersion: true,
        })
      }}
      saveLabel={createMutation.isPending ? '创建中…' : '创建模板'}
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
          { label: '类型', options: ['import_tax', 'platform_fee', 'ocean_freight'], key: 'type' },
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
          已接 DB：fee_templates + fee_template_versions（migration 0012）。审核流
          draft→in_review→published→disabled；解析取同维度 priority 最高且有效期内已发布版本。成本测算主路径读
          tRPC resolve；未命中不可发布正式成本。
        </UedPrototypeNotice>
        {listQuery.isLoading ? <p className="text-sm text-muted-foreground">加载中…</p> : null}
        {listQuery.isError ? (
          <p className="text-sm text-destructive">加载失败：{listQuery.error.message}</p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
