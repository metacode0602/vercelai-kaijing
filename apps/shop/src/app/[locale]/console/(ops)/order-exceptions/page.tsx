'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 20

function statusVariant(status: string) {
  if (status === '开放') return 'destructive' as const
  if (status === '处理中') return 'outline' as const
  if (status === '已修复') return 'secondary' as const
  return 'outline' as const
}

export default function OrderExceptionsPage() {
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')
  const [kind, setKind] = React.useState('全部')

  const utils = trpc.useUtils()
  const metaQuery = trpc.orderExceptions.meta.useQuery()
  const statsQuery = trpc.orderExceptions.stats.useQuery()
  const listQuery = trpc.orderExceptions.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
    kind: kind === '全部' ? undefined : kind,
  })

  const scanMutation = trpc.orderExceptions.scan.useMutation({
    onSuccess: async (result) => {
      await utils.orderExceptions.list.invalidate()
      await utils.orderExceptions.stats.invalidate()
      setNotice(
        `规则扫描完成：新建 ${result.created} · 更新 ${result.updated} · 跳过已结案 ${result.skipped}`,
      )
    },
    onError: (error) => setNotice(error.message),
  })

  const startMutation = trpc.orderExceptions.start.useMutation({
    onSuccess: async () => {
      await utils.orderExceptions.list.invalidate()
      await utils.orderExceptions.stats.invalidate()
      setNotice('已开始处理')
    },
    onError: (error) => setNotice(error.message),
  })

  const resolveMutation = trpc.orderExceptions.resolve.useMutation({
    onSuccess: async (row) => {
      await utils.orderExceptions.list.invalidate()
      await utils.orderExceptions.stats.invalidate()
      setNotice(`${row.caseNo} 已标记修复`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const kinds = metaQuery.data?.kinds ?? ['超时未发货', '占库失败', '拣货异常', '同步失败']
  const statuses = metaQuery.data?.statuses ?? ['开放', '处理中', '已修复', '已忽略']

  const kpiItems = React.useMemo(
    () => [
      { label: '异常数', value: String(stats?.total ?? '—'), hint: 'order_exception_cases' },
      { label: '开放', value: String(stats?.open ?? '—'), hint: '阻断履约' },
      { label: '超时未发', value: String(stats?.timeoutUnshipped ?? '—') },
      { label: '占库失败', value: String(stats?.reservationFailed ?? '—') },
      { label: '拣货异常', value: String(stats?.pickingException ?? '—') },
      { label: '同步失败', value: String(stats?.syncFailed ?? '—') },
    ],
    [stats],
  )

  return (
    <UedWorkspace
      title="订单履约异常"
      description="源自真实订单 / 占库 / 拣货出库 / 履约同步失败的规则视图；处理动作写入审计。不含假异常列表。"
      rows={rows}
      detailHref={(row) => `/console/order-exceptions/${encodeURIComponent(row.id)}`}
      search={q}
      onSearchChange={(value) => {
        setQ(value)
        setPage(1)
      }}
      searchPlaceholder="搜索异常号、订单、Seller SKU 或说明"
      filters={[{ label: '状态', options: [...statuses] }]}
      onStatusFilterChange={(value) => {
        setStatus(value === '全部' ? '全部' : value)
        setPage(1)
      }}
      pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      emptyText={
        listQuery.isError
          ? `加载失败：${listQuery.error.message}`
          : listQuery.isLoading
            ? '正在从数据库加载异常案件…'
            : '暂无履约异常。可点「扫描规则」从真实订单/出库/履约尝试生成案件，或跑 db:seed:commerce-suppliers。'
      }
      columns={[
        { key: 'caseNo', label: '异常号' },
        { key: 'shop', label: '店铺' },
        { key: 'order', label: '平台订单号' },
        { key: 'sellerSku', label: 'Seller SKU' },
        { key: 'internalSku', label: '内部 SKU' },
        { key: 'kind', label: '异常类型' },
        {
          key: 'blocksFulfillment',
          label: '履约',
          render: (row) =>
            row.blocksFulfillment ? (
              <Badge variant="destructive">阻断</Badge>
            ) : (
              <Badge variant="secondary">不阻断</Badge>
            ),
        },
        {
          key: 'status',
          label: '处理状态',
          render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
        },
        { key: 'updatedAt', label: '更新时间' },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={kind === '全部' ? 'default' : 'outline'}
          onClick={() => {
            setKind('全部')
            setPage(1)
          }}
        >
          全部类型
        </Button>
        {kinds.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={kind === item ? 'default' : 'outline'}
            onClick={() => {
              setKind(item)
              setPage(1)
            }}
          >
            {item}
          </Button>
        ))}
      </div>
      <Alert>
        <AlertTitle>规则视图 · 非假列表</AlertTitle>
        <AlertDescription>
          超时未发货（已支付超 48h）、占库失败（映射阻断 / 无活跃预留）、拣货异常（出库 reason）、同步失败（fulfillment_attempts）。Seller
          SKU 映射异常仍在「店铺映射」处理。后台 cron 每小时自动扫描（apps/api ORDER_EXCEPTIONS_SCAN_CRON）。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        处理「开始 / 修复 / 忽略」会记录审计日志；映射类异常请前往「映射管理」。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
          {scanMutation.isPending ? '扫描中…' : '扫描规则'}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <LocaleLink href="/console/mappings">店铺映射</LocaleLink>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <LocaleLink href="/console/orders">订单</LocaleLink>
        </Button>
        {rows
          .filter((row) => row.status === '开放')
          .slice(0, 5)
          .map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <span className="text-sm">
                {row.caseNo} · {row.kind}
              </span>
              <Button size="sm" variant="outline" onClick={() => startMutation.mutate({ id: row.id })}>
                开始处理
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  resolveMutation.mutate({ id: row.id, resolution: '列表快捷修复' })
                }
              >
                标记已修复
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
