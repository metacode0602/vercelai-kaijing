'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_MAPPINGS, type DemoMapping } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'

export default function MappingsPage() {
  const [rows, setRows] = React.useState<DemoMapping[]>(ERP_DEMO_MAPPINGS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="新增 Seller SKU 映射" description="每条平台变体只映射一个内部 SKU。" fields={[
        { key: 'shop', label: '店铺', options: ['Lazada MY', 'Lazada PH', 'Daraz LK'], required: true, helper: '店铺 + Seller SKU 必须唯一' },
        { key: 'platform', label: '平台', options: ['Lazada', 'Daraz', 'TikTok'], required: true },
        { key: 'site', label: '站点', options: ['MY', 'PH', 'LK', 'TH', 'SG', 'VN'], required: true },
        { key: 'itemId', label: 'Item ID', required: true },
        { key: 'sellerSku', label: 'Seller SKU', required: true },
        { key: 'internalSku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'color', label: '平台颜色', required: true },
        { key: 'size', label: '平台尺码', required: true },
        { key: 'listingStatus', label: '上架状态', options: ['在线', '下架', '草稿'], required: true },
        { key: 'mappingStatus', label: '映射状态', options: ['待确认', '启用', '异常'], required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]} onClose={() => setOpen(false)} onSave={() => { setRows((current) => [...current, { shop: 'Lazada MY', platform: 'Lazada', site: 'MY', itemId: '待同步', sellerSku: `DEMO-${current.length + 1}`, internalSku: 'HSY000001001', color: 'Black', size: 'L', listingStatus: '待同步', mappingStatus: '待确认' }]); setOpen(false); setNotice('映射已加入本次原型会话；生产保存时会校验唯一性。') }} /> : null
  return <>{editor}<UedWorkspace title="Seller SKU 映射" description="逐变体将店铺 Seller SKU 绑定到唯一内部 SKU。" rows={rows} detailHref={(row) => `/console/mappings/${encodeURIComponent(`${row.shop}::${row.sellerSku}`)}`} searchKeys={['shop', 'platform', 'site', 'sellerSku', 'internalSku', 'itemId']} searchPlaceholder="搜索店铺、Seller SKU 或内部 SKU" addLabel="新增映射" onAdd={() => setOpen(true)} columns={[
    { key: 'shop', label: '店铺' }, { key: 'platform', label: '平台 / 站点', render: (row) => `${row.platform} / ${row.site}` }, { key: 'itemId', label: 'Item ID' }, { key: 'sellerSku', label: 'Seller SKU' }, { key: 'internalSku', label: '内部 SKU' }, { key: 'color', label: '平台颜色' }, { key: 'size', label: '平台尺码' }, { key: 'listingStatus', label: '上架状态' }, { key: 'mappingStatus', label: '映射状态', render: (row) => <Badge variant={row.mappingStatus === '异常' ? 'destructive' : 'secondary'}>{row.mappingStatus}</Badge> },
  ]}>
    <UedPrototypeNotice>店铺 + Seller SKU 必须唯一；未映射、重复映射或 SKU 停用时，订单进入异常队列且不占库存。</UedPrototypeNotice>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
