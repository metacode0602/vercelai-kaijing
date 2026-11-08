'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function OrderExceptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.orderExceptions.get.useQuery({ id })
  const row = query.data
  const [notice, setNotice] = React.useState('')

  const startMutation = trpc.orderExceptions.start.useMutation({
    onSuccess: async () => {
      await utils.orderExceptions.get.invalidate({ id })
      await utils.orderExceptions.list.invalidate()
      setNotice('已开始处理')
    },
    onError: (error) => setNotice(error.message),
  })
  const resolveMutation = trpc.orderExceptions.resolve.useMutation({
    onSuccess: async () => {
      await utils.orderExceptions.get.invalidate({ id })
      await utils.orderExceptions.list.invalidate()
      setNotice('已标记修复，解除履约阻断')
    },
    onError: (error) => setNotice(error.message),
  })
  const ignoreMutation = trpc.orderExceptions.ignore.useMutation({
    onSuccess: async () => {
      await utils.orderExceptions.get.invalidate({ id })
      await utils.orderExceptions.list.invalidate()
      setNotice('已忽略该异常')
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/order-exceptions" title="加载中…" description="正在读取异常案件…" />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/order-exceptions"
          title="未找到异常"
          description={`异常 ${id} 不存在。`}
        />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '订单履约异常', href: '/console/order-exceptions' }, { label: row.caseNo }]}
      />
      <DetailPageHeader
        backHref="/console/order-exceptions"
        title={row.caseNo}
        description={`${row.shop} · ${row.order} · ${row.kind}`}
        badges={
          <>
            <Badge variant={row.blocksFulfillment ? 'destructive' : 'secondary'}>{row.status}</Badge>
            {row.blocksFulfillment ? <Badge variant="destructive">阻断履约</Badge> : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {row.orderId ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/orders/${encodeURIComponent(row.orderId)}`}>查看订单</LocaleLink>
              </Button>
            ) : null}
            {row.status === '开放' ? (
              <Button size="sm" variant="outline" onClick={() => startMutation.mutate({ id: row.id })}>
                开始处理
              </Button>
            ) : null}
            {row.status === '开放' || row.status === '处理中' ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    resolveMutation.mutate({ id: row.id, resolution: '运营确认已处理' })
                  }
                >
                  标记已修复
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => ignoreMutation.mutate({ id: row.id, reason: '详情忽略' })}
                >
                  忽略
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <Alert variant={row.blocksFulfillment ? 'destructive' : 'default'}>
        <AlertTitle>{row.blocksFulfillment ? '已阻断履约推进' : '履约阻断已解除'}</AlertTitle>
        <AlertDescription>
          {row.detail || row.title}
          {row.resolution ? ` · 处理：${row.resolution}` : ''}
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>{notice || '处理动作会记录审计日志，不会静默修改库存。'}</UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '异常类型', value: row.kind },
          { label: '履约', value: row.blocksFulfillment ? '阻断' : '允许' },
          { label: '来源', value: `${row.sourceType}` },
          { label: '状态', value: row.status },
        ]}
      />
      <DetailFieldGrid
        title="异常主信息"
        description="order_exception_cases"
        fields={[
          { label: '异常号', value: row.caseNo, mono: true },
          { label: '店铺', value: row.shop },
          { label: '平台订单号', value: row.order, mono: true },
          { label: 'Seller SKU', value: row.sellerSku || '—', mono: true },
          { label: '内部 SKU', value: row.internalSku || '—', mono: true },
          { label: '标题', value: row.title },
          { label: '说明', value: row.detail || '—' },
          { label: '来源类型', value: row.sourceType },
          { label: '来源 ID', value: row.sourceId, mono: true },
          { label: '负责人', value: row.assignedTo || '—' },
          { label: '创建时间', value: row.createdAt },
          { label: '更新时间', value: row.updatedAt },
          { label: '修复时间', value: row.resolvedAt || '—' },
          { label: '处理说明', value: row.resolution || '—' },
        ]}
      />
      <DetailFieldGrid
        title="处理审计"
        description="audit_events · entity_type=order_exception_case"
        fields={(row.actions.length ? row.actions : [{ id: '-', action: '—', actor: '—', result: '—', detail: '暂无处理记录', createdAt: '—' }]).flatMap(
          (action, index) => [
            { label: `#${index + 1} 动作`, value: action.action },
            { label: `#${index + 1} 操作人`, value: action.actor },
            { label: `#${index + 1} 结果`, value: action.result || '—' },
            { label: `#${index + 1} 说明`, value: action.detail || '—' },
            { label: `#${index + 1} 时间`, value: action.createdAt },
          ],
        )}
      />
    </div>
  )
}
