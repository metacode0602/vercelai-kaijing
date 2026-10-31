'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  EXCEPTION_KINDS,
  EXCEPTION_STATUSES,
  countExceptionsKpi,
  retryExceptionIdentify,
  useMappingExceptions,
} from '@/lib/crossborder/mapping-exception-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function OrderExceptionsPage() {
  const rows = useMappingExceptions()
  const kpi = React.useMemo(() => countExceptionsKpi(rows), [rows])
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '异常数', value: String(kpi.total) },
      { label: '开放 / 阻断', value: String(kpi.open), hint: '禁止自动占库' },
      { label: '未映射', value: String(kpi.unmapped) },
      { label: '冲突', value: String(kpi.conflict) },
      { label: '停用 SKU', value: String(kpi.disabled) },
    ],
    [kpi],
  )

  return (
    <UedWorkspace
      title="订单映射异常"
      description="mapping_exceptions：未映射 / 冲突 / 停用 SKU / 重复 Seller SKU。异常订单行在修复前禁止自动占库。"
      rows={rows}
      detailHref={(row) => `/console/order-exceptions/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'shop', 'order', 'sellerSku', 'internalSku', 'reason', 'kind', 'status']}
      searchPlaceholder="搜索异常号、订单、Seller SKU 或原因"
      filters={[
        { label: '类型', options: [...EXCEPTION_KINDS], key: 'kind' },
        { label: '状态', options: [...EXCEPTION_STATUSES] },
      ]}
      emptyText="暂无映射异常。新订单若 Seller SKU 未映射或冲突，会自动进入本队列并阻断占库。"
      columns={[
        { key: 'id', label: '异常号' },
        { key: 'shop', label: '店铺' },
        { key: 'order', label: '平台订单号' },
        { key: 'sellerSku', label: 'Seller SKU' },
        { key: 'internalSku', label: '内部 SKU' },
        { key: 'kind', label: '异常类型' },
        { key: 'reason', label: '阻断原因' },
        {
          key: 'blocksReservation',
          label: '占库',
          render: (row) =>
            row.blocksReservation ? (
              <Badge variant="destructive">阻断</Badge>
            ) : (
              <Badge variant="secondary">不阻断</Badge>
            ),
        },
        {
          key: 'status',
          label: '处理状态',
          render: (row) => (
            <Badge variant={row.blocksReservation ? 'destructive' : 'secondary'}>{row.status}</Badge>
          ),
        },
        { key: 'updatedAt', label: '更新时间' },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <Alert>
        <AlertTitle>异常阻断自动占库</AlertTitle>
        <AlertDescription>
          对齐 schema mapping_exceptions：未映射 / 冲突 / 停用 SKU 的订单行必须进本队列，且禁止自动库存预留。修复映射后须显式「重试识别」，不得静默扣库。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        支持未映射、重复映射、SKU 停用、店铺授权失效与字段校验失败。可跳转 Seller SKU 映射修复后回来重试。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows
          .filter((row) => row.blocksReservation)
          .map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <span className="text-sm">
                {row.order} · {row.sellerSku}
              </span>
              <Button variant="outline" size="sm" asChild>
                <LocaleLink href="/console/mappings">去修复映射</LocaleLink>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const result = retryExceptionIdentify(row.id)
                  setNotice(result.ok ? `${result.row.order} 已加入重试队列（原型）` : result.reason)
                }}
              >
                重试识别
              </Button>
            </div>
          ))}
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
