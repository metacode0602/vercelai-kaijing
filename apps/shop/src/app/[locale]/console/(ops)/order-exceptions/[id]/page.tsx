'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  parentsToFields,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  ignoreException,
  resolveException,
  retryExceptionIdentify,
  toRelatedExceptionShape,
  useMappingExceptions,
} from '@/lib/crossborder/mapping-exception-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function OrderExceptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useMappingExceptions()
  const row = rows.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/order-exceptions"
          title={mounted ? '未找到异常' : '加载中…'}
          description={mounted ? `异常 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('order-exceptions', toRelatedExceptionShape(row))
  const parentFields = parentsToFields(related.parents)

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[{ label: '订单映射异常', href: '/console/order-exceptions' }, { label: row.id }]}
      />
      <DetailPageHeader
        backHref="/console/order-exceptions"
        title={row.id}
        description={`${row.shop} · ${row.order} · ${row.kind}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={row.blocksReservation ? 'destructive' : 'secondary'}>{row.status}</Badge>
            {row.blocksReservation ? <Badge variant="destructive">阻断占库</Badge> : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/mappings">修复映射</LocaleLink>
            </Button>
            {row.blocksReservation ? (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    const result = retryExceptionIdentify(row.id)
                    setNotice(result.ok ? '已重试识别（原型）' : result.reason)
                  }}
                >
                  重试识别
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const result = resolveException(row.id, '运营确认映射已修复')
                    setNotice(result.ok ? '已标记修复，解除占库阻断' : result.reason)
                  }}
                >
                  标记已修复
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const result = ignoreException(row.id, '详情忽略')
                    setNotice(result.ok ? '已忽略该异常' : result.reason)
                  }}
                >
                  忽略
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <Alert variant={row.blocksReservation ? 'destructive' : 'default'}>
        <AlertTitle>{row.blocksReservation ? '已阻断自动占库' : '占库阻断已解除'}</AlertTitle>
        <AlertDescription>
          {row.payloadSummary}
          {row.resolution ? ` · 处理：${row.resolution}` : ''}
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>{notice || '修复映射后必须显式重试；不得静默扣库。'}</UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '异常类型', value: row.kind },
          { label: '占库', value: row.blocksReservation ? '阻断' : '允许' },
          { label: '平台', value: row.platform },
          { label: '状态', value: row.status },
        ]}
      />
      <DetailFieldGrid
        title="异常主信息"
        description="mapping_exceptions 投影"
        fields={[
          { label: '异常号', value: row.id, mono: true },
          ...parentFields,
          { label: '店铺', value: row.shop },
          { label: '平台订单号', value: row.order, mono: true },
          { label: 'Item ID', value: row.itemId, mono: true },
          { label: 'Seller SKU', value: row.sellerSku, mono: true },
          { label: '内部 SKU', value: row.internalSku, mono: true },
          { label: '阻断原因', value: row.reason },
          { label: '创建时间', value: row.createdAt },
          { label: '更新时间', value: row.updatedAt },
          { label: '修复时间', value: row.resolvedAt || '—' },
          { label: '处理说明', value: row.resolution || '—' },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
