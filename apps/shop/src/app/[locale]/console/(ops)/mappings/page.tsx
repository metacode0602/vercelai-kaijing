'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { createMapping, mappingRouteId, useMappings } from '@/lib/crossborder/mapping-store'
import {
  countExceptionsKpi,
  useMappingExceptions,
} from '@/lib/crossborder/mapping-exception-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function MappingsPage() {
  const rows = useMappings()
  const exceptions = useMappingExceptions()
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()
  const skuOptions = skuCodesQuery.data ?? []
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const exKpi = React.useMemo(() => countExceptionsKpi(exceptions), [exceptions])

  const kpiItems = React.useMemo(() => {
    const enabled = rows.filter((item) => item.mappingStatus === '启用').length
    const pending = rows.filter((item) => item.mappingStatus === '待确认').length
    const abnormal = rows.filter((item) => item.mappingStatus === '异常').length
    const unmapped = rows.filter((item) => !item.internalSku || item.internalSku === '—').length
    return [
      { label: '映射数', value: String(rows.length), hint: '当前原型会话' },
      { label: '启用', value: String(enabled) },
      { label: '待确认', value: String(pending) },
      { label: '异常 / 未映射', value: String(abnormal + unmapped), hint: '异常订单不占库' },
      { label: '阻断占库异常', value: String(exKpi.open), hint: 'mapping_exceptions' },
    ]
  }, [rows, exKpi.open])

  const editor = open ? (
    <UedDialog
      title="新增 Seller SKU 映射"
      description="每条平台变体只映射一个内部 SKU；店铺 + Seller SKU 必须唯一。"
      fields={[
        {
          key: 'shop',
          label: '店铺',
          options: ['Lazada MY', 'Lazada PH', 'Daraz LK'],
          required: true,
          helper: '店铺 + Seller SKU 必须唯一',
        },
        { key: 'platform', label: '平台', options: ['Lazada', 'Daraz', 'TikTok'], required: true },
        {
          key: 'site',
          label: '站点',
          options: ['MY', 'PH', 'LK', 'TH', 'SG', 'VN'],
          required: true,
        },
        { key: 'itemId', label: 'Item ID', required: true, helper: '平台商品 / Item ID' },
        {
          key: 'platformSkuId',
          label: '平台 SKU ID',
          required: true,
          helper: '独立于 Item ID、Seller SKU、内部 SKU',
        },
        { key: 'sellerSku', label: 'Seller SKU', required: true },
        {
          key: 'internalSku',
          label: '内部 SKU',
          options: skuOptions.length ? skuOptions : ['HSY000001001'],
          required: true,
        },
        { key: 'color', label: '平台颜色', required: true },
        { key: 'size', label: '平台尺码', required: true },
        {
          key: 'listingStatus',
          label: '上架状态',
          options: ['在线', '下架', '草稿', '待同步'],
          required: true,
        },
        {
          key: 'mappingStatus',
          label: '映射状态',
          options: ['待确认', '启用', '异常'],
          required: true,
        },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const created = createMapping({
          shop: values.shop || 'Lazada MY',
          platform: values.platform || 'Lazada',
          site: values.site || 'MY',
          itemId: values.itemId || '待同步',
          platformSkuId: values.platformSkuId || '待同步',
          sellerSku: values.sellerSku || `DEMO-${rows.length + 1}`,
          internalSku: values.internalSku || skuOptions[0] || 'HSY000001001',
          color: values.color || 'Black',
          size: values.size || 'L',
          listingStatus: values.listingStatus || '待同步',
          mappingStatus: (values.mappingStatus as '待确认' | '启用' | '异常') || '待确认',
        })
        setOpen(false)
        setNotice(
          `${created.shop} · ${created.sellerSku} 已写入原型会话；生产保存时会校验唯一性与 SKU 启用态。`,
        )
      }}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="Seller SKU 映射"
        description="逐变体将店铺 Seller SKU 绑定到唯一内部 SKU。未映射 / 冲突 / 停用 SKU 的订单进异常队列且不占库存。"
        rows={rows}
        detailHref={(row) => `/console/mappings/${encodeURIComponent(mappingRouteId(row))}`}
        searchKeys={['shop', 'platform', 'site', 'sellerSku', 'internalSku', 'itemId', 'platformSkuId']}
        searchPlaceholder="搜索店铺、Seller SKU、平台 SKU ID 或内部 SKU"
        filters={[
          { label: '映射状态', options: ['启用', '待确认', '异常'], key: 'mappingStatus' },
        ]}
        addLabel="新增映射"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'shop', label: '店铺' },
          {
            key: 'platform',
            label: '平台 / 站点',
            render: (row) => `${row.platform} / ${row.site}`,
          },
          { key: 'itemId', label: 'Item ID' },
          { key: 'platformSkuId', label: '平台 SKU ID' },
          { key: 'sellerSku', label: 'Seller SKU' },
          { key: 'internalSku', label: '内部 SKU' },
          { key: 'color', label: '平台颜色' },
          { key: 'size', label: '平台尺码' },
          { key: 'listingStatus', label: '上架状态' },
          {
            key: 'mappingStatus',
            label: '映射状态',
            render: (row) => (
              <Badge variant={row.mappingStatus === '异常' ? 'destructive' : 'secondary'}>
                {row.mappingStatus}
              </Badge>
            ),
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <Alert>
          <AlertTitle>映射异常阻断自动占库</AlertTitle>
          <AlertDescription>
            对齐 schema mapping_exceptions：未映射 / 冲突 / 停用 SKU 的订单行必须进异常队列，且禁止自动库存预留。开放阻断 {exKpi.open} 条。
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/order-exceptions">打开订单映射异常队列</LocaleLink>
          </Button>
        </div>
        <UedPrototypeNotice>
          四码并列：Item ID · 平台 SKU ID · Seller SKU · 内部 SKU。店铺 + Seller SKU 必须唯一；未映射 / 冲突 / 停用 SKU 的订单进异常队列且不占库存。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
