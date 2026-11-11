'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PAGE_SIZE = 20
const CATEGORY_OPTIONS = [
  { value: 'quality', title: '质量' },
  { value: 'size', title: '尺码规格' },
  { value: 'logistics', title: '物流' },
  { value: 'description', title: '描述不符' },
  { value: 'other', title: '其他' },
] as const

type Category = (typeof CATEGORY_OPTIONS)[number]['value']

function toDateInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function rangeForPreset(preset: '7' | '30' | '90'): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - (Number(preset) - 1))
  return { from: toDateInput(from), to: toDateInput(to) }
}

function formatStamp(value: string | null): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

const SOURCE_LABEL: Record<string, string> = {
  override: '人工改判',
  reason_code: '原因码',
  keyword: '关键词',
  default: '其他',
}

export default function AttributionBoardPage() {
  const utils = trpc.useUtils()
  const initial = rangeForPreset('30')
  const [preset, setPreset] = React.useState<'7' | '30' | '90' | 'custom'>('30')
  const [from, setFrom] = React.useState(initial.from)
  const [to, setTo] = React.useState(initial.to)
  const [shopId, setShopId] = React.useState('')
  const [sku, setSku] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [drillSku, setDrillSku] = React.useState<string | null>(null)
  const [mapOpen, setMapOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [noticeError, setNoticeError] = React.useState(false)

  const shopsQuery = trpc.shops.list.useQuery({ page: 1, pageSize: 100 })
  const query = trpc.reports.attribution.useQuery({
    shopId: shopId || undefined,
    from,
    to,
    sku: sku || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  const mapsQuery = trpc.reports.listReasonMaps.useQuery()
  const drillQuery = trpc.reports.attributionDrill.useQuery(
    { sku: drillSku ?? '', shopId: shopId || undefined, from, to },
    { enabled: Boolean(drillSku) },
  )

  const overrideMutation = trpc.reports.overrideAttribution.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.reports.attribution.invalidate(), utils.reports.attributionDrill.invalidate()])
      setNoticeError(false)
      setNotice('已保存人工改判')
    },
    onError: (error) => {
      setNoticeError(true)
      setNotice(error.message)
    },
  })
  const upsertMapMutation = trpc.reports.upsertReasonMap.useMutation({
    onSuccess: async () => {
      await utils.reports.listReasonMaps.invalidate()
      await Promise.all([utils.reports.attribution.invalidate(), utils.reports.attributionDrill.invalidate()])
      setMapOpen(false)
      setNoticeError(false)
      setNotice('映射已保存，看板将按新规则重新归类')
    },
    onError: (error) => {
      setNoticeError(true)
      setNotice(error.message)
    },
  })

  const rows = query.data?.items ?? []
  const shops = shopsQuery.data?.items ?? []

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>差评 / 退货归因已接真实库存数据</AlertTitle>
        <AlertDescription>
          {query.data?.note ??
            '差评按评分 1–2 统计；退货来自已入库的逆向单。无数据时显示空态，不使用演示 KPI。平台评论回复与售后列表拉取尚未接入。'}
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">店铺</span>
          <select
            className="h-8 min-w-40 rounded-md border bg-background px-2 text-sm"
            value={shopId}
            onChange={(event) => {
              setShopId(event.target.value)
              setPage(1)
            }}
          >
            <option value="">全部店铺</option>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} · {shop.platformLabel}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          {(['7', '30', '90'] as const).map((item) => (
            <Button
              key={item}
              size="sm"
              variant={preset === item ? 'default' : 'outline'}
              onClick={() => {
                const next = rangeForPreset(item)
                setPreset(item)
                setFrom(next.from)
                setTo(next.to)
                setPage(1)
              }}
            >
              近 {item} 天
            </Button>
          ))}
          <Button
            size="sm"
            variant={preset === 'custom' ? 'default' : 'outline'}
            onClick={() => setPreset('custom')}
          >
            自定义
          </Button>
        </div>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">开始</span>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value)
              setPreset('custom')
              setPage(1)
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">结束</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value)
              setPreset('custom')
              setPage(1)
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-muted-foreground">SKU</span>
          <Input
            value={sku}
            placeholder="按 SKU / 商品名筛选"
            onChange={(event) => {
              setSku(event.target.value)
              setPage(1)
            }}
          />
        </label>
        <Button size="sm" variant="outline" onClick={() => setMapOpen(true)}>
          维护映射
        </Button>
      </div>

      {notice ? (
        <p role="status" className={`text-sm ${noticeError ? 'text-destructive' : 'text-muted-foreground'}`}>
          {notice}
        </p>
      ) : null}

      <UedWorkspace
        title="按 SKU 汇总"
        description="五类原因：质量 / 尺码规格 / 物流 / 描述不符 / 其他。点击行可下钻到真实评论和退货明细。"
        rows={rows}
        emptyText={
          query.isLoading
            ? '正在汇总已入库差评和退货…'
            : query.isError
              ? `加载失败：${query.error.message}`
              : '所选范围内暂无已入库的差评或退货。'
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: query.data?.total ?? 0,
          onPageChange: setPage,
        }}
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: '商品' },
          { key: 'badReviews', label: '差评', render: (row) => String(row.badReviews) },
          { key: 'returns', label: '退货', render: (row) => String(row.returns) },
          { key: 'quality', label: '质量', render: (row) => String(row.reasons.quality) },
          { key: 'size', label: '尺码规格', render: (row) => String(row.reasons.size) },
          { key: 'logistics', label: '物流', render: (row) => String(row.reasons.logistics) },
          { key: 'description', label: '描述不符', render: (row) => String(row.reasons.description) },
          { key: 'other', label: '其他', render: (row) => String(row.reasons.other) },
          {
            key: 'actions',
            label: '操作',
            render: (row) => (
              <Button size="sm" variant="ghost" onClick={() => setDrillSku(row.sku)}>
                下钻
              </Button>
            ),
          },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '差评合计', value: String(query.data?.kpis.badReviews ?? 0) },
            { label: '退货合计', value: String(query.data?.kpis.returns ?? 0) },
            { label: '涉及 SKU', value: String(query.data?.kpis.skuCount ?? 0) },
          ]}
        />
      </UedWorkspace>

      {drillSku ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">
                下钻 {drillQuery.data?.sku ?? drillSku}
                {drillQuery.data?.name ? ` · ${drillQuery.data.name}` : ''}
              </h3>
              <p className="text-sm text-muted-foreground">可对单条评论或退货行改判，写入 attribution_overrides。</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDrillSku(null)}>
              关闭
            </Button>
          </div>
          {drillQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">加载明细…</p>
          ) : drillQuery.isError ? (
            <p className="text-sm text-destructive">{drillQuery.error.message}</p>
          ) : (drillQuery.data?.lines.length ?? 0) === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              该 SKU 在当前筛选下没有差评或退货明细。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>店铺</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>内容 / 原因</TableHead>
                  <TableHead>归类</TableHead>
                  <TableHead>依据</TableHead>
                  <TableHead>改判</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(drillQuery.data?.lines ?? []).map((line) => (
                  <TableRow key={`${line.kind}-${line.id}`}>
                    <TableCell>
                      <Badge variant={line.kind === 'review' ? 'secondary' : 'outline'}>
                        {line.kind === 'review' ? `差评 ${line.rating ?? ''}` : '退货'}
                      </Badge>
                    </TableCell>
                    <TableCell>{line.shopName || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatStamp(line.at)}</TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm">{line.content}</p>
                      {line.reasonCode ? (
                        <p className="text-xs text-muted-foreground">原因码 {line.reasonCode}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{line.categoryLabel}</TableCell>
                    <TableCell>
                      <Badge variant={line.overridden ? 'default' : 'outline'}>{SOURCE_LABEL[line.source] ?? line.source}</Badge>
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                        value={line.category}
                        onChange={(event) =>
                          overrideMutation.mutate({
                            subjectType: line.kind === 'review' ? 'review' : 'reverse_item',
                            subjectId: line.id,
                            category: event.target.value as Category,
                          })
                        }
                      >
                        {CATEGORY_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-base font-semibold">原因映射</h3>
        <p className="text-sm text-muted-foreground">
          有原因码先走映射，再对评论文本 / 退货原因做关键词匹配；仍无法判断则归「其他」。下列为空时仍会使用内置关键词兜底，不会写入演示 KPI。
        </p>
        {(mapsQuery.data ?? []).length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">暂无组织自定义映射。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>匹配值</TableHead>
                <TableHead>归类</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(mapsQuery.data ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.matchType === 'reason_code' ? '原因码' : '关键词'}</TableCell>
                  <TableCell className="font-mono text-xs">{item.pattern}</TableCell>
                  <TableCell>{item.categoryLabel}</TableCell>
                  <TableCell>{item.status === 'enabled' ? '启用' : '停用'}</TableCell>
                  <TableCell>{item.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {mapOpen ? (
        <UedDialog
          title="新增或更新映射"
          description="相同类型 + 匹配值会更新原记录。关键词按包含匹配，较长的优先。"
          fields={[
            {
              key: 'matchType',
              label: '类型',
              options: [
                { value: 'reason_code', title: '平台原因码' },
                { value: 'keyword', title: '关键词' },
              ],
              defaultValue: 'keyword',
              required: true,
            },
            { key: 'pattern', label: '原因码或关键词', required: true },
            { key: 'category', label: '归类', options: [...CATEGORY_OPTIONS], required: true, defaultValue: 'other' },
            {
              key: 'status',
              label: '状态',
              options: [
                { value: 'enabled', title: '启用' },
                { value: 'disabled', title: '停用' },
              ],
              defaultValue: 'enabled',
            },
            { key: 'notes', label: '备注', type: 'textarea', fullWidth: true },
          ]}
          onClose={() => setMapOpen(false)}
          onSave={(values) =>
            upsertMapMutation.mutate({
              matchType: values.matchType === 'reason_code' ? 'reason_code' : 'keyword',
              pattern: values.pattern,
              category: (values.category || 'other') as Category,
              status: values.status === 'disabled' ? 'disabled' : 'enabled',
              notes: values.notes,
            })
          }
          saveLabel={upsertMapMutation.isPending ? '保存中…' : '保存映射'}
        />
      ) : null}
    </div>
  )
}
