'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

const PAGE_SIZE = 20

const CAPABILITY_LABEL: Record<string, string> = {
  ready: '已就绪',
  known_unimplemented: 'API 已确认 · 未接线',
  unknown: 'IM API 未确认',
  unsupported: '不支持',
}

const CAPABILITY_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  ready: 'secondary',
  known_unimplemented: 'outline',
  unknown: 'destructive',
  unsupported: 'outline',
}

export default function CsInboxPage() {
  const utils = trpc.useUtils()
  const [q, setQ] = React.useState('')
  const [platform, setPlatform] = React.useState('all')
  const [shopId, setShopId] = React.useState('all')
  const [sku, setSku] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.csInbox.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    platform: platform === 'all' ? undefined : platform,
    shopId: shopId === 'all' ? undefined : shopId,
    sku: sku || undefined,
    status: status === 'all' ? undefined : status,
  })
  const statsQuery = trpc.csInbox.stats.useQuery()
  const filterOptionsQuery = trpc.csInbox.filterOptions.useQuery()
  const capabilitiesQuery = trpc.csInbox.capabilities.useQuery()

  const markReadMutation = trpc.csInbox.markRead.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.csInbox.list.invalidate(),
        utils.csInbox.stats.invalidate(),
      ])
      setNotice('已标记为已读')
    },
    onError: (e) => setNotice(e.message),
  })
  const markAllReadMutation = trpc.csInbox.markAllRead.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.csInbox.list.invalidate(),
        utils.csInbox.stats.invalidate(),
      ])
      setNotice(`已批量标记 ${res.updated} 条为已读`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = listQuery.data?.items ?? []
  const kpi = statsQuery.data ?? { total: 0, unread: 0, byPlatform: [], byShop: [] }
  const shops = filterOptionsQuery.data?.shops ?? []
  const platforms = filterOptionsQuery.data?.platforms ?? []
  const capabilities = capabilitiesQuery.data?.platforms ?? []
  const anyReady = capabilitiesQuery.data?.anyReady ?? false

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">客服收件箱（只读）</h1>
        <p className="text-sm text-muted-foreground">
          F28 · 多店铺消息只读工作台。按平台 / 店铺 / SKU 过滤；不可发送。发送与自动化属后续权限确认项。
        </p>
      </div>

      {/* 平台 IM 能力 banner */}
      <Alert>
        <AlertTitle>平台 IM API 能力</AlertTitle>
        <AlertDescription>
          <div className="mt-2 flex flex-wrap gap-2">
            {capabilities.map((cap) => (
              <Badge key={cap.platform} variant={CAPABILITY_VARIANT[cap.capability] ?? 'outline'}>
                {cap.platform}：{CAPABILITY_LABEL[cap.capability] ?? cap.capability}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {anyReady
              ? '已有平台 IM adapter 就绪，可点击「同步」拉取。'
              : '当前所有平台 IM adapter 未实现 listMessages，同步会失败，禁止写入演示消息。详见 docs/design/platform-apis。'}
          </p>
        </AlertDescription>
      </Alert>

      {/* 筛选栏 */}
      <div className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs">平台</Label>
          <Select value={platform} onValueChange={(v) => { setPlatform(v); setPage(1) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="全部平台" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">店铺</Label>
          <Select value={shopId} onValueChange={(v) => { setShopId(v); setPage(1) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="全部店铺" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部店铺</SelectItem>
              {shops.map((s) => (
                <SelectItem key={s.shopId} value={s.shopId}>{s.shop}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">SKU</Label>
          <Input
            value={sku}
            onChange={(e) => { setSku(e.target.value); setPage(1) }}
            placeholder="按 SKU 过滤"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">状态</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="unread">未读</SelectItem>
              <SelectItem value="read">已读</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">快捷操作</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={markAllReadMutation.isPending || kpi.unread === 0}
              onClick={() => markAllReadMutation.mutate()}
            >
              全部已读
            </Button>
          </div>
        </div>
      </div>

      <UedWorkspace
        title="客服收件箱"
        description="按平台 / 店铺 / SKU 过滤；只读，不可发送。"
        rows={rows}
        search={q}
        onSearchChange={(v) => { setQ(v); setPage(1) }}
        searchKeys={['shop', 'platform', 'customer', 'subject', 'preview', 'sku']}
        searchPlaceholder="搜索店铺、客户、主题或 SKU"
        emptyText={listQuery.isLoading ? '加载中…' : '暂无消息。当前平台 IM adapter 未接线，需手工导入或等待 IM 同步落地。'}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: listQuery.data?.total ?? 0,
          onPageChange: setPage,
        }}
        columns={[
          { key: 'shop', label: '店铺' },
          { key: 'platform', label: '平台' },
          { key: 'customer', label: '客户' },
          { key: 'subject', label: '主题' },
          { key: 'preview', label: '预览' },
          { key: 'sku', label: 'SKU' },
          { key: 'receivedAt', label: '时间' },
          {
            key: 'status',
            label: '状态',
            render: (r) => (
              <Badge variant={r.status === 'unread' ? 'destructive' : 'secondary'}>
                {r.status === 'unread' ? '未读' : '已读'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            label: '操作',
            render: (r) =>
              r.status === 'unread' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markReadMutation.isPending}
                  onClick={() => markReadMutation.mutate({ id: r.id })}
                >
                  标记已读
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '消息', value: String(kpi.total) },
            { label: '未读', value: String(kpi.unread) },
            { label: '店铺数', value: String(kpi.byShop.length) },
            { label: '平台数', value: String(kpi.byPlatform.length) },
          ]}
        />
        <UedPrototypeNotice>
          只读壳：无 send API、无自动回复。每店 OAuth token 需独立授权；平台 IM 拉取待 adapter 落地。
          优惠券触达属 P2（Q38）。
        </UedPrototypeNotice>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">{notice}</p>
        ) : null}
      </UedWorkspace>
    </div>
  )
}
