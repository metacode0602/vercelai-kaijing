'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { Textarea } from '@workspace/ui/components/textarea'
import { Badge, badgeVariants } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { ListPagination } from '@/components/shared/list-pagination'
import type { VariantProps } from 'class-variance-authority'
import { SearchIcon, TicketIcon, HistoryIcon, UndoIcon, XIcon } from 'lucide-react'

/**
 * 平台侧算力券工作台
 *
 * 发放与回收都只经由 `packages/billing` 领域函数，UI 不碰余额：
 *   - 发放走 `freezeMerchantBalance`，券池可用额不足整笔失败（不会出现空头券）
 *   - 回收走 `expireMerchantCoupon`，只释放**剩余**额度，已核销部分不动
 *
 * 券是钱，所以有三处刻意的严格：
 *   1. `requestId` 在打开发放弹窗时生成一次并保持到提交成功，重复点击不会重复发券
 *   2. 回收必须填原因，且弹窗里写明「已核销部分不退回」
 *   3. 租户候选只来自所选商户名下，发给别的商户的租户后端会直接拒绝
 */

interface CouponItem {
  id: string
  code: string
  name: string
  merchantId: string
  merchantName: string | null
  tenantId: string | null
  tenantName: string | null
  type: string
  value: number
  surplusAmount: number
  minAmount: number | null
  status: string
  validityDay: number | null
  remark: string | null
  issuedAt: Date | string
  expiredAt: Date | string | null
  usedAt: Date | string | null
}

interface Summary {
  total: number
  active: number
  expiringSoon: number
  outstanding: number
  redeemed: number
}

interface Props {
  initial: { items: CouponItem[]; total: number; page: number; pageSize: number }
  summary: Summary
  filters: { status: string | null; search: string | null; merchantId: string | null }
}

const STATUS_LABEL: Record<string, string> = {
  active: '生效中',
  used: '已用尽',
  expired: '已过期',
  void: '已作废',
}

const STATUS_VARIANT: Record<string, VariantProps<typeof badgeVariants>['variant']> = {
  active: 'default',
  used: 'secondary',
  expired: 'secondary',
  void: 'destructive',
}

const TYPE_LABEL: Record<string, string> = { cash: '满减券', discount: '折扣券' }

const money = (value: number) =>
  `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dateText = (value: Date | string | null) => {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('zh-CN')
}

/** 幂等键：打开弹窗时生成一次，重试复用同一个 id */
const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `ri-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export function VoucherPanel({ initial, summary, filters }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const utils = trpc.useUtils()
  const [isPending, startTransition] = useTransition()
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '')
  const [grantOpen, setGrantOpen] = useState(false)

  // 商户下拉同时服务「按商户筛选」和「发放时选商户」，共用一份候选
  const merchantOptions = trpc.merchant.receivingAccount.merchantOptions.useQuery({
    page: 1,
    pageSize: 100,
  })

  const refresh = () =>
    startTransition(() => {
      void utils.merchant.voucher.invalidate()
      router.refresh()
    })

  const setFilter = (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    params.delete('page')
    const query = params.toString()
    startTransition(() => {
      router.push(query ? `?${query}` : window.location.pathname)
    })
  }

  const totalPages = Math.max(1, Math.ceil(initial.total / initial.pageSize))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">算力券管理</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            发放会从商户券池冻结额度，回收只释放剩余额度。当前未核销余额{' '}
            {money(summary.outstanding)}，7 天内到期 {summary.expiringSoon} 张。
          </p>
        </div>
        <Button
          onClick={() => {
            setSearchDraft(filters.search ?? '')
            setGrantOpen(true)
          }}
        >
          <TicketIcon className="size-4" />
          发放算力券
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: '券总数', value: String(summary.total) },
          { label: '生效中', value: String(summary.active) },
          { label: '7 天内到期', value: String(summary.expiringSoon), tone: 'text-amber-600' },
          { label: '未核销余额', value: money(summary.outstanding), tone: 'text-sky-600' },
          { label: '累计核销', value: money(summary.redeemed), tone: 'text-emerald-600' },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border bg-card p-4">
            <div className="text-muted-foreground text-sm">{c.label}</div>
            <div className={`mt-1 text-2xl font-bold ${c.tone ?? ''}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="搜索券码、券名或商户名"
              className="h-9 w-64 pl-8"
              placeholder="券码 / 券名 / 商户名"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setFilter({ search: searchDraft.trim() })
              }}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setFilter({ search: searchDraft.trim() })}
          >
            搜索
          </Button>
          <NativeSelect
            aria-label="券状态"
            className="h-9 w-32"
            value={filters.status ?? ''}
            disabled={isPending}
            onChange={(e) => setFilter({ status: e.target.value })}
          >
            <NativeSelectOption value="">全部状态</NativeSelectOption>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="商户"
            className="h-9 w-44"
            value={filters.merchantId ?? ''}
            disabled={isPending}
            onChange={(e) => setFilter({ merchantId: e.target.value })}
          >
            <NativeSelectOption value="">全部商户</NativeSelectOption>
            {merchantOptions.data?.items.map((m) => (
              <NativeSelectOption key={m.id} value={m.id}>
                {m.name}
                {m.code ? `（${m.code}）` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {filters.search || filters.status || filters.merchantId ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearchDraft('')
                startTransition(() => {
                  void utils.merchant.voucher.invalidate()
                  router.push(window.location.pathname)
                })
              }}
            >
              <XIcon className="size-4" />
              清除筛选
            </Button>
          ) : null}
        </div>

        {initial.items.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            没有符合条件的算力券
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>券码</TableHead>
                <TableHead>券名 / 类型</TableHead>
                <TableHead>商户 / 租户</TableHead>
                <TableHead className="text-right">面额</TableHead>
                <TableHead className="text-right">剩余</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>到期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initial.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {TYPE_LABEL[c.type] ?? c.type}
                      {c.minAmount != null ? ` · 满 ${money(c.minAmount)} 可用` : ''}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{c.merchantName ?? c.merchantId}</div>
                    <div className="text-muted-foreground text-xs">{c.tenantName ?? '—'}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{money(c.value)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {money(c.surplusAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {dateText(c.expiredAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <RedemptionDialog coupon={c} />
                      {c.status === 'active' ? <RecoverDialog coupon={c} /> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <ListPagination
          page={initial.page}
          totalPages={totalPages}
          totalItems={initial.total}
          pageSize={initial.pageSize}
          onPageChange={(p) => {
            const params = new URLSearchParams(sp.toString())
            params.set('page', String(p))
            startTransition(() => {
              router.push(`?${params.toString()}`)
            })
          }}
        />
      </div>

      <GrantDialog open={grantOpen} onOpenChange={setGrantOpen} onGranted={refresh} />
    </div>
  )
}

function GrantDialog({
  open,
  onOpenChange,
  onGranted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onGranted: () => void
}) {
  const utils = trpc.useUtils()
  const [merchantId, setMerchantId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [validityDay, setValidityDay] = useState('90')
  const [remark, setRemark] = useState('')
  const [requestId, setRequestId] = useState(() => newRequestId())
  const [tenantSearch, setTenantSearch] = useState('')

  const merchants = trpc.merchant.receivingAccount.merchantOptions.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: open },
  )
  const tenants = trpc.merchant.voucher.tenantOptions.useQuery(
    { merchantId, ...(tenantSearch.trim() ? { search: tenantSearch.trim() } : {}) },
    { enabled: open && merchantId.length > 0 },
  )
  const grant = trpc.merchant.voucher.grant.useMutation({
    onSuccess: (d) => {
      toast.success(
        d.replay
          ? `券码 ${d.code} 此前已发放，本次未重复发放`
          : `已发放 ${money(d.amount)} → 券码 ${d.code}`,
      )
      onOpenChange(false)
      setName('')
      setAmount('')
      setMinAmount('')
      setRemark('')
      void utils.merchant.voucher.invalidate()
      onGranted()
    },
    onError: (e: { message: string }) => toast.error(e.message),
  })

  const value = Number(amount)
  const valid =
    merchantId.length > 0 && tenantId.length > 0 && name.trim().length > 0 && value > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (v) {
          // 每次打开换新的 requestId；同一次提交的重试复用它
          setRequestId(newRequestId())
          setTenantId('')
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>发放算力券</DialogTitle>
          <DialogDescription>
            发放会从该商户的券池可用额中冻结同额额度；券池余额不足时整笔失败。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-merchant">商户</Label>
            <NativeSelect
              id="grant-merchant"
              value={merchantId}
              onChange={(e) => {
                setMerchantId(e.target.value)
                // 换商户后已选租户不再属于新商户，必须清空，否则会把 A 商户的租户
                // 带着提交给 B 商户
                setTenantId('')
                setTenantSearch('')
              }}
            >
              <NativeSelectOption value="">请选择商户</NativeSelectOption>
              {(merchants.data?.items ?? []).map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {m.name}
                  {m.code ? `（${m.code}）` : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-tenant">租户</Label>
            <Input
              id="grant-tenant-search"
              value={tenantSearch}
              maxLength={200}
              onChange={(e) => setTenantSearch(e.target.value)}
              placeholder="按租户名 / 平台租户号搜索"
              disabled={!merchantId}
            />
            <NativeSelect
              id="grant-tenant"
              value={tenantId}
              disabled={!merchantId || tenants.isLoading}
              onChange={(e) => setTenantId(e.target.value)}
            >
              <NativeSelectOption value="">
                {merchantId ? '请选择租户' : '请先选择商户'}
              </NativeSelectOption>
              {(tenants.data?.items ?? []).map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.name}
                  {t.platformTenantId && t.platformTenantId !== '—' ? `（${t.platformTenantId}）` : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {tenants.error ? (
              <p className="text-destructive text-xs">{tenants.error.message}</p>
            ) : tenants.data?.hasMore ? (
              <p className="text-muted-foreground text-xs">
                该商户共 {tenants.data.total} 个租户，当前仅显示前 {tenants.data.items.length}{' '}
                个，请用上方搜索缩小范围。
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="grant-name">券名</Label>
              <Input
                id="grant-name"
                value={name}
                maxLength={128}
                placeholder="如：新人算力券"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="grant-amount">面额</Label>
              <Input
                id="grant-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="grant-min">使用门槛（可选）</Label>
              <Input
                id="grant-min"
                type="number"
                min={0}
                step="0.01"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="grant-validity">有效天数</Label>
              <Input
                id="grant-validity"
                type="number"
                min={1}
                max={3650}
                value={validityDay}
                onChange={(e) => setValidityDay(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="grant-remark">备注（可选）</Label>
            <Textarea
              id="grant-remark"
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={grant.isPending || !valid}
            onClick={() =>
              grant.mutate({
                merchantId,
                tenantId,
                amount: value,
                name: name.trim(),
                requestId,
                ...(minAmount && Number(minAmount) > 0
                  ? { minAmount: Number(minAmount) }
                  : {}),
                ...(validityDay && Number(validityDay) > 0
                  ? { validityDay: Number(validityDay) }
                  : {}),
                ...(remark.trim() ? { remark: remark.trim() } : {}),
              })
            }
          >
            {grant.isPending ? '发放中…' : '确认发放'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RecoverDialog({ coupon }: { coupon: CouponItem }) {
  const utils = trpc.useUtils()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const recover = trpc.merchant.voucher.recover.useMutation({
    onSuccess: (d) => {
      toast.success(
        d.replay
          ? `券 ${coupon.code} 此前已回收，本次未重复释放`
          : `已回收 ${money(d.released)} → 券码 ${coupon.code}`,
      )
      setOpen(false)
      setReason('')
      void utils.merchant.voucher.invalidate()
      // 列表与统计都在 Server Component 里算，刷新才能拿到回收后的口径
      router.refresh()
    },
    onError: (e: { message: string }) => toast.error(e.message),
  })

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <UndoIcon className="size-4" />
        回收
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>回收算力券</DialogTitle>
            <DialogDescription>
              券码 {coupon.code} 当前剩余 {money(coupon.surplusAmount)}。回收只把剩余额度退回商户券池，
              已核销部分（{money(coupon.value - coupon.surplusAmount)}）不会退回。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`recover-reason-${coupon.id}`}>回收原因</Label>
            <Textarea
              id={`recover-reason-${coupon.id}`}
              rows={2}
              value={reason}
              maxLength={200}
              placeholder="如：活动结束 / 用户申请退券"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={recover.isPending || reason.trim().length === 0}
              onClick={() => recover.mutate({ couponId: coupon.id, reason: reason.trim() })}
            >
              {recover.isPending ? '回收中…' : '确认回收'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RedemptionDialog({ coupon }: { coupon: CouponItem }) {
  const [open, setOpen] = useState(false)
  const history = trpc.merchant.voucher.redemptions.useQuery(
    { couponId: coupon.id, limit: 100 },
    { enabled: open },
  )

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <HistoryIcon className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>核销明细</DialogTitle>
            <DialogDescription>
              券码 {coupon.code}（{coupon.name}）· 面额 {money(coupon.value)} · 剩余{' '}
              {money(coupon.surplusAmount)}
            </DialogDescription>
          </DialogHeader>

          {history.isLoading ? (
            <p className="text-muted-foreground p-6 text-center text-sm">加载中…</p>
          ) : history.error ? (
            <p className="p-6 text-center text-sm text-destructive">{history.error.message}</p>
          ) : !history.data || history.data.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">这张券还没有核销记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">核销金额</TableHead>
                  <TableHead>抵扣对象</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-right font-mono text-sm">
                      {money(r.amount)}
                    </TableCell>
                    <TableCell className="text-xs">{r.description ?? r.refId ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(r.occurredAt).toLocaleString('zh-CN')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
