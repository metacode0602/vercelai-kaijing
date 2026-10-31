'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  advancePackage,
  createPackage,
  toRelatedPackageShape,
  usePackages,
} from '@/lib/crossborder/order-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function PickingPage() {
  const packages = usePackages()
  const rows = packages.map(toRelatedPackageShape)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="补建拣货单"
      description="正常由订单自动生成；漏单补建需订单已完成映射且未占用其他包裹。出库终态写库存流水。"
      fields={[
        { key: 'order', label: '订单', options: ['DZ-10021', 'LZ-2201', 'DZ-10018', 'TTS-901'], required: true },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada TH', 'Lazada MY', 'TikTok Shop'], required: true },
        { key: 'site', label: '站点', options: ['LK', 'TH', 'MY', 'PH', 'US'], required: true },
        { key: 'sku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'quantity', label: '数量', type: 'number', required: true, defaultValue: '1' },
        { key: 'bin', label: '拣货库位', options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'], required: true },
        { key: 'picker', label: '拣货人', placeholder: '默认当前用户' },
        { key: 'weight', label: '预估重量（g）', type: 'number' },
        {
          key: 'remark',
          label: '补建原因',
          type: 'textarea',
          fullWidth: true,
          required: true,
          placeholder: '说明漏单原因与关联订单',
        },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const qty = Number(values.quantity || '1')
        const result = createPackage({
          order: values.order || '',
          shop: values.shop || '',
          site: values.site || '',
          sku: values.sku || '',
          quantity: qty,
          bin: values.bin || '',
          picker: values.picker,
          weight: values.weight ? `${values.weight} g` : undefined,
          remark: values.remark || '',
        })
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setOpen(false)
        setNotice(`${result.package.id} 已补建；重复出库保护已按订单校验。`)
      }}
    />
  ) : null

  function advance(id: string) {
    const result = advancePackage(id)
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    if (result.package.status === '已出库' && result.outbound) {
      setNotice(
        `${id} 已出库 · 出库单 ${result.outbound.outboundNo} 已过账写「订单出库」流水（扣减 on_hand / reserved）`,
      )
      return
    }
    setNotice(
      `${id} 已推进至「${result.package.status}」${
        result.package.outboundId ? ` · 关联出库单 ${result.package.outboundId}` : ''
      }`,
    )
  }

  return (
    <>
      {editor}
      <UedWorkspace
        title="拣货打包发货"
        description="按订单生成拣货单：拣货 → 复核 → 称重 → 生成面单 → 出库交接；终态调用 wms-store 出库过账写流水。"
        rows={rows}
        detailHref={(row) => `/console/picking/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'order', 'shop', 'skus', 'tracking', 'picker', 'status', 'outboundId']}
        searchPlaceholder="搜索包裹号、订单、店铺或运单号"
        filters={[{ label: '状态', options: ['待拣货', '拣货中', '已复核', '已出库', '已取消'] }]}
        addLabel="补建拣货单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '包裹 / 拣货单' },
          { key: 'order', label: '订单号' },
          { key: 'shop', label: '店铺 / 站点', render: (row) => `${row.shop} · ${row.site}` },
          { key: 'items', label: '件数', render: (row) => String(row.items) },
          { key: 'skus', label: 'SKU 明细' },
          { key: 'weight', label: '称重' },
          { key: 'tracking', label: '面单 / 运单号' },
          { key: 'picker', label: '拣货人' },
          {
            key: 'outboundId',
            label: '出库单',
            render: (row) => (row.outboundId && row.outboundId !== '—' ? row.outboundId : '—'),
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '已出库' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
        ]}
      >
        <UedPrototypeNotice>
          同一订单行只允许一个未出库包裹。终态「已出库」调用 createStockOutbound（若无）+
          postStockOutbound，与库存流水同事务扣减；面单号回写包裹与订单。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {packages
            .filter((row) => row.status !== '已出库' && row.status !== '已取消')
            .map((row) => (
              <Button key={row.id} variant="outline" size="sm" onClick={() => advance(row.id)}>
                推进 · {row.id}（{row.status}）
              </Button>
            ))}
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
