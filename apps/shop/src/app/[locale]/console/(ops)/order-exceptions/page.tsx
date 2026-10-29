'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type ExceptionRow = { id: string; shop: string; order: string; sellerSku: string; internalSku: string; reason: string; status: string; updatedAt: string }

export const initialRows: ExceptionRow[] = [
  { id: 'EX-2026-0012', shop: 'Daraz LK', order: 'DZ-10031', sellerSku: 'TEE-OLD-BLACK', internalSku: '—', reason: '未映射', status: '阻断扣库', updatedAt: '2026-10-28 09:31' },
  { id: 'EX-2026-0011', shop: 'Lazada MY', order: 'LZ-2201', sellerSku: 'TEE-BLK-L', internalSku: 'HSY000001001（停用）', reason: '映射 SKU 停用', status: '阻断扣库', updatedAt: '2026-10-28 09:20' },
]

export default function OrderExceptionsPage() {
  const [rows, setRows] = React.useState(initialRows)
  const [notice, setNotice] = React.useState('')
  return <UedWorkspace title="订单映射异常" description="映射异常订单行在修复前不进入库存占用。" rows={rows} detailHref={(row) => `/console/order-exceptions/${encodeURIComponent(row.id)}`} searchKeys={['id', 'shop', 'order', 'sellerSku', 'internalSku', 'reason', 'status']} searchPlaceholder="搜索订单号、Seller SKU 或原因" columns={[
    { key: 'id', label: '异常号' }, { key: 'shop', label: '店铺' }, { key: 'order', label: '平台订单号' }, { key: 'sellerSku', label: 'Seller SKU' }, { key: 'internalSku', label: '内部 SKU' }, { key: 'reason', label: '阻断原因' }, { key: 'status', label: '处理状态', render: (row) => <Badge variant="destructive">{row.status}</Badge> }, { key: 'updatedAt', label: '更新时间' },
  ]}>
    <UedPrototypeNotice>支持未映射、重复映射、SKU 停用、店铺授权失效和字段校验失败。修复后必须显式重试；不得静默扣库。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{rows.filter((row) => row.status === '阻断扣库').map((row) => <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2"><span className="text-sm">{row.order} · {row.sellerSku}</span><Button variant="outline" size="sm" asChild><LocaleLink href="/console/mappings">去修复映射</LocaleLink></Button><Button size="sm" onClick={() => { setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: '已重试待验证', updatedAt: '刚刚' } : item)); setNotice(`${row.order} 已加入示例重试队列；未调用平台或修改库存。`) }}>重试识别</Button></div>)}</div>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace>
}
