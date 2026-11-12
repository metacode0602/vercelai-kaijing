'use client'

import * as React from 'react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
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
  const [syncPlatform, setSyncPlatform] = React.useState('daraz')
  const [syncCountry, setSyncCountry] = React.useState('LK')

  const listQuery = trpc.feeTemplates.list.useQuery({ page: 1, pageSize: 100 })
  const capabilitiesQuery = trpc.feeTemplates.officialFeeCapabilities.useQuery()
  const latestSyncQuery = trpc.feeTemplates.latestOfficialSync.useQuery({
    platform: syncPlatform,
    country: syncCountry,
  })
  const syncMutation = trpc.feeTemplates.syncOfficialFees.useMutation({
    onSuccess: async (result) => {
      await Promise.all([utils.feeTemplates.list.invalidate(), utils.feeTemplates.latestOfficialSync.invalidate()])
      setNotice(`${result.run.status === 'unsupported' ? result.run.reason : result.plan.reasonZh}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const selectedCapability = (capabilitiesQuery.data ?? []).find((c) => c.platform === (syncPlatform === 'tiktok' ? 'tiktok_shop' : syncPlatform))
    ?? (capabilitiesQuery.data ?? []).find((c) => c.platform === syncPlatform)
  const initFromCatalog = trpc.feeTemplates.initFromCatalog.useMutation({
    onSuccess: async (result) => {
      await utils.feeTemplates.list.invalidate()
      setNotice(
        result.inserted > 0
          ? `已从平台默认费用模板补齐 ${result.inserted} 条（只补缺失，拷贝为草稿，需复核发布后计算器才使用）`
          : '本组织费用模板已齐全，无需补齐。',
      )
    },
    onError: (e) => setNotice(e.message),
  })
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
        { key: 'country', label: '国家', options: ['LK', 'MY', 'SG', 'ID', 'TH', 'PH', 'VN'], required: true },
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

  const latest = latestSyncQuery.data
  const syncStatusLabel =
    latest?.status === 'success'
      ? '成功（仅写入草稿，待审核）'
      : latest?.status === 'partial'
        ? '部分失败'
        : latest?.status === 'failed'
          ? '失败'
          : latest?.status === 'unsupported'
            ? '该平台暂无官方费率接口'
            : '尚未同步'

  return (
    <>
      {editor}
      <div className="mb-4 rounded-lg border p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium">官方费率同步</h3>
          <p className="text-xs text-muted-foreground">
            若平台提供官方费率或类目佣金接口，同步结果只会生成费用模板草稿，需审核发布后计算器才会使用。计算器始终只读已发布的本组织费用模板，不会显示「已从平台实时同步」。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">平台</span>
            <select
              className="block h-9 rounded-md border bg-background px-2 text-sm"
              value={syncPlatform}
              onChange={(e) => setSyncPlatform(e.target.value)}
            >
              <option value="daraz">daraz</option>
              <option value="lazada">lazada</option>
              <option value="tiktok_shop">tiktok_shop</option>
              <option value="shopee">shopee</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">站点</span>
            <select
              className="block h-9 rounded-md border bg-background px-2 text-sm"
              value={syncCountry}
              onChange={(e) => setSyncCountry(e.target.value)}
            >
              {['LK', 'MY', 'SG', 'TH', 'VN', 'ID', 'PH'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate({ platform: syncPlatform, country: syncCountry })}
          >
            {syncMutation.isPending ? '正在查询官方接口…' : '从官方同步费率'}
          </Button>
        </div>
        <p className="text-sm">
          最近同步：{syncStatusLabel}
          {latest?.finishedAt ? ` · ${new Date(latest.finishedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {selectedCapability?.reasonZh || '该平台暂无官方费率接口，仍使用本组织费用模板'}
          {selectedCapability?.whyNotUsableZh ? ` ${selectedCapability.whyNotUsableZh}` : ''}
          {latest?.reason && latest.reason !== selectedCapability?.reasonZh ? ` 记录：${latest.reason}` : ''}
        </p>
      </div>
      <div className="mb-3">
        <Button
          size="sm"
          variant="outline"
          disabled={initFromCatalog.isPending}
          onClick={() => initFromCatalog.mutate()}
        >
          {initFromCatalog.isPending ? '补齐中…' : '从平台目录补齐'}
        </Button>
      </div>
      <UedWorkspace
        title="费用模板"
        description="按平台、国家、履约配置进口税与平台费版本；测算按有效期+优先级解析，保存柜次成本时写入版本 ID 与组件快照。可从平台默认费用模板补齐缺失项（拷贝为草稿）。官方同步只产生待审核草稿，不会显示「已从平台实时同步」。"
        rows={rows}
        detailHref={(row) => `/console/fee-templates/${encodeURIComponent(row.id)}`}
        searchKeys={['code', 'name', 'platform', 'country', 'fulfillmentPool', 'typeLabel', 'status']}
        searchPlaceholder="搜索编码、名称、平台或履约池"
        addLabel="新建费用模板"
        onAdd={() => setOpen(true)}
        filters={[
          { label: '平台', options: ['daraz', 'lazada'], key: 'platform' },
          { label: '国家', options: ['LK', 'MY', 'SG', 'ID', 'TH', 'PH', 'VN'], key: 'country' },
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
