'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 50

export default function FreightRateCardsPage() {
  const utils = trpc.useUtils()
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const meta = trpc.freightRateCards.meta.useQuery()
  const carriersQuery = trpc.carriers.list.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const listQuery = trpc.freightRateCards.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })

  const createMutation = trpc.freightRateCards.create.useMutation({
    onSuccess: async (row) => {
      setOpen(false)
      setNotice(`${row?.code ?? ''} 运价卡已写入 commerce_freight_rate_cards。`)
      await utils.freightRateCards.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const carrierOptions = (carriersQuery.data?.items ?? []).map((c) => ({
    value: c.id,
    title: `${c.code} · ${c.name}`,
  }))
  const modes = meta.data?.freightModes ?? ['AIR_DDP', 'LCL', 'FCL20', 'FCL40']
  const rows = listQuery.data?.items ?? []
  const today = new Date().toISOString().slice(0, 10)

  const editor = open ? (
    <UedDialog
      title="新增运价卡"
      description="正式运费主数据；成本测算与运费页读取本表。"
      fields={[
        { key: 'name', label: '名称', required: true },
        { key: 'freightMode', label: '运输模式', options: modes, required: true },
        {
          key: 'carrierId',
          label: '承运商',
          options: carrierOptions.length
            ? [{ value: '', title: '不指定' }, ...carrierOptions]
            : [{ value: '', title: '暂无启用承运商' }],
        },
        { key: 'currency', label: '币种', defaultValue: 'USD', required: true },
        { key: 'unitRate', label: '单价（USD/kg·CBM·柜）', type: 'number', required: true },
        { key: 'minCharge', label: '最低收费', type: 'number' },
        { key: 'surcharge', label: '附加费', type: 'number' },
        { key: 'thc', label: 'THC', type: 'number' },
        { key: 'volumetricDivisor', label: '泡重除数（空运）', type: 'number' },
        { key: 'usableCbm', label: '可用 CBM（整柜）', type: 'number' },
        { key: 'unitRatePerTon', label: '吨单价（LCL）', type: 'number' },
        { key: 'originPort', label: '起运港', placeholder: 'CNXMN' },
        { key: 'destPort', label: '目的港', placeholder: 'LKCMB' },
        { key: 'effectiveFrom', label: '生效日', required: true, defaultValue: today },
        { key: 'effectiveTo', label: '失效日', placeholder: '可空' },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true, defaultValue: '启用' },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          name: values.name || '未命名运价卡',
          freightMode: values.freightMode || 'LCL',
          carrierId: values.carrierId || undefined,
          currency: values.currency || 'USD',
          unitRate: Number(values.unitRate) || 0,
          minCharge: values.minCharge ? Number(values.minCharge) : undefined,
          surcharge: values.surcharge ? Number(values.surcharge) : undefined,
          thc: values.thc ? Number(values.thc) : undefined,
          volumetricDivisor: values.volumetricDivisor ? Number(values.volumetricDivisor) : undefined,
          usableCbm: values.usableCbm ? Number(values.usableCbm) : undefined,
          unitRatePerTon: values.unitRatePerTon ? Number(values.unitRatePerTon) : undefined,
          originPort: values.originPort || undefined,
          destPort: values.destPort || undefined,
          effectiveFrom: values.effectiveFrom || today,
          effectiveTo: values.effectiveTo || undefined,
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '保存运价卡'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="运价卡"
        description="commerce_freight_rate_cards：按模式维护正式运价；成本测算强制读取本表。"
        rows={rows}
        detailHref={(row) => `/console/freight-rate-cards/${encodeURIComponent(row.code)}`}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="搜索编码、名称、港口或模式"
        filters={[{ label: '状态', options: ['启用', '停用'] }]}
        onStatusFilterChange={(value) => {
          setStatus(value === '全部' ? '全部' : value)
          setPage(1)
        }}
        pagination={{ page, pageSize: PAGE_SIZE, total: listQuery.data?.total ?? 0, onPageChange: setPage }}
        addLabel="新增运价卡"
        onAdd={() => setOpen(true)}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无运价卡。请新增 AIR_DDP / LCL / FCL20 / FCL40。'}
        columns={[
          { key: 'code', label: '编码' },
          { key: 'name', label: '名称' },
          { key: 'freightMode', label: '模式' },
          {
            key: 'carrierId',
            label: '承运商',
            render: (row) => {
              const c = (carriersQuery.data?.items ?? []).find((x) => x.id === row.carrierId)
              return c ? c.code : row.carrierId ? '已关联' : '—'
            },
          },
          {
            key: 'unitRate',
            label: '单价',
            render: (row) => (
              <span className="tabular-nums">
                {row.unitRate} {row.currency}
              </span>
            ),
          },
          { key: 'originPort', label: '起运港', render: (row) => row.originPort || '—' },
          { key: 'destPort', label: '目的港', render: (row) => row.destPort || '—' },
          { key: 'effectiveFrom', label: '生效' },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
        ]}
      >
        <UedPrototypeNotice>
          运价卡是正式运费主数据，运费测算与成本测算共用同一套运价；未命中运价卡时不可正式保存成本。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <LocaleLink href="/console/freight">运费测算</LocaleLink>
          </Button>
          <Button asChild size="sm" variant="outline">
            <LocaleLink href="/console/carriers">承运商</LocaleLink>
          </Button>
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
