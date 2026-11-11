'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'

const PAGE_SIZE = 20

type PendingRow = {
  id: string
  kind: string
  kindLabel: string
  title: string
  status: string
  statusLabel: string
  shop: string
  createdBy: string
  expiresAt: string
  listingId: string | null
  missingFields: string[]
}

export default function PendingPage() {
  const [keyword, setKeyword] = React.useState('')
  const [kind, setKind] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [notice, setNotice] = React.useState('')
  const [completeRow, setCompleteRow] = React.useState<PendingRow | null>(null)
  const utils = trpc.useUtils()
  const statsQuery = trpc.pending.stats.useQuery()
  const metaQuery = trpc.listings.meta.useQuery()
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()
  const listQuery = trpc.pending.list.useQuery({
    page, pageSize: PAGE_SIZE, q: keyword || undefined,
    kind: kind === 'all' ? undefined : kind,
    status: status === 'all' ? undefined : status,
  })
  const confirmMutation = trpc.pending.confirm.useMutation({
    onSuccess: async (row) => {
      await utils.pending.list.invalidate()
      await utils.pending.stats.invalidate()
      await utils.dashboard.navBadges.invalidate()
      await utils.listings.list.invalidate()
      setNotice(
        row.listingId
          ? `已确认：${row.title} → 本地刊登已就绪 ${row.listingId}（可前往「发布到平台」）`
          : `已确认：${row.title}`,
      )
    },
    onError: (e) => setNotice(e.message),
  })
  const rejectMutation = trpc.pending.reject.useMutation({
    onSuccess: async (row) => {
      await utils.pending.list.invalidate()
      await utils.pending.stats.invalidate()
      await utils.dashboard.navBadges.invalidate()
      await utils.listings.list.invalidate()
      setNotice(`已拒绝：${row.title}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const completeMutation = trpc.pending.complete.useMutation({
    onSuccess: async (row) => {
      await utils.pending.list.invalidate()
      setCompleteRow(null)
      setNotice(
        row.missingFields.length
          ? `已补全，仍缺：${row.missingFields.join('、')}`
          : '补全完成，可以确认',
      )
    },
    onError: (e) => setNotice(e.message),
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const kindOptions = (statsQuery.data?.kinds ?? []).map((k) => ({ value: k, label: statsQuery.data?.kindLabels?.[k] ?? k }))
  const statusOptions = (statsQuery.data?.statuses ?? []).map((s) => ({ value: s, label: statsQuery.data?.statusLabels?.[s] ?? s }))
  const shops = metaQuery.data?.shops ?? []
  const skuOptions = skuCodesQuery.data ?? []

  const completeDialog = completeRow ? (
    <UedDialog
      title="补全刊登提交"
      description="补齐确认后创建本地刊登所需的店铺 / SKU / 售价等字段；确认时按这些字段创建草稿刊登。"
      fields={[
        {
          key: 'shopId',
          label: '店铺',
          options: shops.length ? shops.map((s) => `${s.id}::${s.name}`) : ['（请先连接店铺）'],
          helper: '选项值为 shopId::店铺名',
        },
        {
          key: 'sku',
          label: '内部 SKU',
          options: skuOptions.length ? skuOptions : ['（请先建 SKU）'],
        },
        { key: 'sellerSku', label: 'Seller SKU', placeholder: '平台侧 SKU' },
        { key: 'title', label: '刊登标题', fullWidth: true },
        { key: 'sellPrice', label: '售价', type: 'number', defaultValue: '12.5' },
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'THB', 'SGD', 'LKR'], defaultValue: 'USD' },
        { key: 'brandName', label: '品牌' },
        { key: 'categoryPath', label: '类目路径', fullWidth: true },
        { key: 'categoryExternalId', label: '平台类目 ID（PrimaryCategory）', fullWidth: true },
        { key: 'color', label: '颜色' },
        { key: 'size', label: '尺码' },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setCompleteRow(null)}
      onSave={(values) => {
        const rawShop = values.shopId || ''
        const shopIdValue = rawShop.includes('::') ? rawShop.split('::')[0]! : rawShop
        completeMutation.mutate({
          id: completeRow.id,
          shopId: shopIdValue || undefined,
          sku: values.sku || undefined,
          sellerSku: values.sellerSku || undefined,
          title: values.title || undefined,
          sellPrice: values.sellPrice !== undefined && values.sellPrice !== '' ? Number(values.sellPrice) : undefined,
          currency: values.currency || undefined,
          brandName: values.brandName || undefined,
          categoryPath: values.categoryPath || undefined,
          categoryExternalId: values.categoryExternalId || undefined,
          color: values.color || undefined,
          size: values.size || undefined,
          note: values.note || undefined,
        })
      }}
      saveLabel={completeMutation.isPending ? '保存中…' : '保存补全'}
    />
  ) : null

  return (
    <div className="space-y-4">
      {completeDialog}
      <div>
        <h2 className="text-xl font-semibold tracking-tight">待审队列</h2>
        <p className="text-sm text-muted-foreground">人工确认 / 拒绝 · pending_actions</p>
      </div>
      <Alert>
        <AlertTitle>刊登提交待审已闭环</AlertTitle>
        <AlertDescription>
          listing_submit（mode=create）确认后创建本地刊登草稿；关联已有刊登的待审确认后可前往「发布到平台」。
          其他类型确认只改站内状态。
        </AlertDescription>
      </Alert>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(v) => { setKeyword(v); setPage(1) }}
        keywordPlaceholder="标题 / 类型 / 创建者"
        filters={[
          { id: 'kind', label: '类型', value: kind, onChange: (v) => { setKind(v); setPage(1) }, options: kindOptions },
          { id: 'status', label: '状态', value: status, onChange: (v) => { setStatus(v); setPage(1) }, options: statusOptions },
        ]}
      />
      <ConsoleListSection title="待审列表" description={`共 ${total} 条 · 待审 ${statsQuery.data?.pending ?? 0}`} pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}>
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">加载待审…</p>
        ) : rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead><TableHead>标题</TableHead><TableHead>店铺</TableHead>
                <TableHead>创建者</TableHead><TableHead>过期</TableHead><TableHead>状态</TableHead>
                <TableHead>刊登</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">{row.kindLabel}</TableCell>
                  <TableCell className="font-medium">
                    {row.title}
                    {row.missingFields.length ? (
                      <span className="ml-2 text-xs text-amber-600">缺 {row.missingFields.join('、')}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.shop}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.createdBy}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.expiresAt}</TableCell>
                  <TableCell><Badge variant="secondary">{row.statusLabel}</Badge></TableCell>
                  <TableCell>
                    {row.listingId ? (
                      <LocaleLink
                        href={`/console/listings/${encodeURIComponent(row.listingId)}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        打开刊登
                      </LocaleLink>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {row.kind === 'listing_submit' && row.status === 'pending' && row.missingFields.length > 0 ? (
                      <Button size="sm" variant="secondary" onClick={() => setCompleteRow(row)}>补全</Button>
                    ) : null}
                    <Button size="sm" disabled={row.status !== 'pending' || confirmMutation.isPending} onClick={() => confirmMutation.mutate({ id: row.id })}>确认</Button>
                    <Button size="sm" variant="outline" disabled={row.status !== 'pending' || rejectMutation.isPending} onClick={() => rejectMutation.mutate({ id: row.id, reason: '人工拒绝' })}>拒绝</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
