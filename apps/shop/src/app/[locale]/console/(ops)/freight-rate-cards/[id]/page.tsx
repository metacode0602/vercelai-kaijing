'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailPageHeader } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function FreightRateCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.freightRateCards.get.useQuery({ id })
  const meta = trpc.freightRateCards.meta.useQuery()
  const carriersQuery = trpc.carriers.list.useQuery({ page: 1, pageSize: 100 })
  const row = query.data
  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmStatus, setConfirmStatus] = React.useState<'启用' | '停用' | null>(null)
  const [notice, setNotice] = React.useState('')

  const updateMutation = trpc.freightRateCards.update.useMutation({
    onSuccess: async () => {
      await utils.freightRateCards.get.invalidate({ id })
      await utils.freightRateCards.list.invalidate()
      setEditOpen(false)
      setConfirmStatus(null)
      setNotice('运价卡已保存到数据库。')
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/freight-rate-cards" title="加载中…" description="读取运价卡…" />
  }
  if (!row) {
    return (
      <DetailPageHeader
        backHref="/console/freight-rate-cards"
        title="未找到运价卡"
        description={`编码/ID ${id} 不存在。`}
      />
    )
  }

  const carrier = (carriersQuery.data?.items ?? []).find((c) => c.id === row.carrierId)
  const modes = meta.data?.freightModes ?? ['AIR_DDP', 'LCL', 'FCL20', 'FCL40']
  const carrierOptions = (carriersQuery.data?.items ?? [])
    .filter((c) => c.status === '启用' || c.id === row.carrierId)
    .map((c) => ({ value: c.id, title: `${c.code} · ${c.name}` }))

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '运价卡', href: '/console/freight-rate-cards' }, { label: row.code }]}
      />
      <DetailPageHeader
        backHref="/console/freight-rate-cards"
        title={row.name}
        description={`${row.freightMode} · ${row.originPort || '—'} → ${row.destPort || '—'}`}
        badges={<Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
            {row.status === '启用' ? (
              <Button size="sm" variant="outline" onClick={() => setConfirmStatus('停用')}>
                停用
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmStatus('启用')}>
                启用
              </Button>
            )}
          </div>
        }
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <DetailFieldGrid
        title="运价卡"
        fields={[
          { label: '编码', value: row.code, mono: true },
          { label: '名称', value: row.name },
          { label: '运输模式', value: row.freightMode },
          { label: '承运商', value: carrier ? `${carrier.code} · ${carrier.name}` : row.carrierId || '—' },
          { label: '币种', value: row.currency },
          { label: '单价', value: String(row.unitRate) },
          { label: '最低收费', value: String(row.minCharge) },
          { label: '附加费', value: String(row.surcharge) },
          { label: 'THC', value: String(row.thc) },
          { label: '泡重除数', value: row.volumetricDivisor != null ? String(row.volumetricDivisor) : '—' },
          { label: '可用 CBM', value: row.usableCbm != null ? String(row.usableCbm) : '—' },
          { label: '吨单价', value: row.unitRatePerTon != null ? String(row.unitRatePerTon) : '—' },
          { label: '起运港', value: row.originPort || '—' },
          { label: '目的港', value: row.destPort || '—' },
          { label: '生效日', value: row.effectiveFrom },
          { label: '失效日', value: row.effectiveTo || '—' },
          { label: '备注', value: row.note || '—' },
          { label: '更新时间', value: row.updatedAt },
        ]}
      />

      {editOpen ? (
        <UedDialog
          title="编辑运价卡"
          description="修改后写入 commerce_freight_rate_cards。"
          fields={[
            { key: 'name', label: '名称', required: true, defaultValue: row.name },
            {
              key: 'freightMode',
              label: '运输模式',
              options: modes,
              required: true,
              defaultValue: row.freightMode,
            },
            {
              key: 'carrierId',
              label: '承运商',
              options: [{ value: '', title: '不指定' }, ...carrierOptions],
              defaultValue: row.carrierId || '',
            },
            { key: 'currency', label: '币种', required: true, defaultValue: row.currency },
            { key: 'unitRate', label: '单价', type: 'number', required: true, defaultValue: String(row.unitRate) },
            { key: 'minCharge', label: '最低收费', type: 'number', defaultValue: String(row.minCharge) },
            { key: 'surcharge', label: '附加费', type: 'number', defaultValue: String(row.surcharge) },
            { key: 'thc', label: 'THC', type: 'number', defaultValue: String(row.thc) },
            {
              key: 'volumetricDivisor',
              label: '泡重除数',
              type: 'number',
              defaultValue: row.volumetricDivisor != null ? String(row.volumetricDivisor) : '',
            },
            {
              key: 'usableCbm',
              label: '可用 CBM',
              type: 'number',
              defaultValue: row.usableCbm != null ? String(row.usableCbm) : '',
            },
            {
              key: 'unitRatePerTon',
              label: '吨单价',
              type: 'number',
              defaultValue: row.unitRatePerTon != null ? String(row.unitRatePerTon) : '',
            },
            { key: 'originPort', label: '起运港', defaultValue: row.originPort },
            { key: 'destPort', label: '目的港', defaultValue: row.destPort },
            { key: 'effectiveFrom', label: '生效日', required: true, defaultValue: row.effectiveFrom },
            { key: 'effectiveTo', label: '失效日', defaultValue: row.effectiveTo },
            {
              key: 'status',
              label: '状态',
              options: ['启用', '停用'],
              required: true,
              defaultValue: row.status,
            },
            { key: 'note', label: '备注', type: 'textarea', fullWidth: true, defaultValue: row.note },
          ]}
          onClose={() => setEditOpen(false)}
          onSave={(values) => {
            updateMutation.mutate({
              id: row.id,
              name: values.name || row.name,
              freightMode: values.freightMode || row.freightMode,
              carrierId: values.carrierId || null,
              currency: values.currency || row.currency,
              unitRate: Number(values.unitRate),
              minCharge: values.minCharge !== '' ? Number(values.minCharge) : 0,
              surcharge: values.surcharge !== '' ? Number(values.surcharge) : 0,
              thc: values.thc !== '' ? Number(values.thc) : 0,
              volumetricDivisor: values.volumetricDivisor ? Number(values.volumetricDivisor) : null,
              usableCbm: values.usableCbm ? Number(values.usableCbm) : null,
              unitRatePerTon: values.unitRatePerTon ? Number(values.unitRatePerTon) : null,
              originPort: values.originPort ?? row.originPort,
              destPort: values.destPort ?? row.destPort,
              effectiveFrom: values.effectiveFrom || row.effectiveFrom,
              effectiveTo: values.effectiveTo || null,
              status: values.status === '停用' ? '停用' : '启用',
              note: values.note ?? row.note,
            })
          }}
          saveLabel="保存"
        />
      ) : null}

      <AlertDialog open={confirmStatus != null} onOpenChange={(o) => !o && setConfirmStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认{confirmStatus}运价卡？</AlertDialogTitle>
            <AlertDialogDescription>
              将把 {row.code} 状态改为「{confirmStatus}」（软状态，不物理删除）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmStatus) return
                updateMutation.mutate({ id: row.id, status: confirmStatus })
              }}
            >
              确认{confirmStatus}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
