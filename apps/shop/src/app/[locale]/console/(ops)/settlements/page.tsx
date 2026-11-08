'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { SyncConfirmDialog } from '@/components/console/sync-confirm-dialog'
import { DetailKpiRow } from '@/components/console/detail'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Label } from '@workspace/ui/components/label'

const PAGE_SIZE = 20

/** 本地 ERP 状态机；平台拉取经 finance.syncSettlementsFromPlatform（无凭证/未配置则禁用）。 */
const NEXT_STATUS: Record<string, string | null> = {
  待匹配: '已确认',
  差异待处理: '已确认',
  已确认: '已打款',
  已打款: null,
}

export default function SettlementsPage() {
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')
  const [notice, setNotice] = React.useState('')
  const [importOpen, setImportOpen] = React.useState(false)
  const [importText, setImportText] = React.useState('')
  const [pendingStatus, setPendingStatus] = React.useState<{ id: string; label: string; next: string } | null>(
    null,
  )
  const [syncConfirmOpen, setSyncConfirmOpen] = React.useState(false)
  const [syncShopId, setSyncShopId] = React.useState('')
  const utils = trpc.useUtils()

  const metaQuery = trpc.finance.meta.useQuery()
  const statsQuery = trpc.finance.settlementStats.useQuery()
  const listQuery = trpc.finance.listSettlements.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })
  const importMutation = trpc.finance.importSettlements.useMutation({
    onSuccess: async (res) => {
      await utils.finance.listSettlements.invalidate()
      await utils.finance.settlementStats.invalidate()
      setImportOpen(false)
      setImportText('')
      setNotice(
        res.failed
          ? `成功 ${res.success}，失败 ${res.failed}${res.errors[0] ? `：${res.errors[0].message}` : ''}`
          : `已导入 ${res.success} 条结算批次（本地 ERP）`,
      )
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.finance.updateSettlementStatus.useMutation({
    onSuccess: async (row) => {
      await utils.finance.listSettlements.invalidate()
      await utils.finance.settlementStats.invalidate()
      await utils.finance.overview.invalidate()
      setPendingStatus(null)
      setNotice(`${row.externalSettlementId} 状态已更新为 ${row.status}（本地 ERP，非平台回写）。`)
    },
    onError: (error) => setNotice(error.message),
  })
  const syncMutation = trpc.finance.syncSettlementsFromPlatform.useMutation({
    onSuccess: async (res) => {
      await utils.finance.listSettlements.invalidate()
      await utils.finance.settlementStats.invalidate()
      await utils.finance.overview.invalidate()
      await utils.finance.meta.invalidate()
      setSyncConfirmOpen(false)
      setNotice(res.note || (res.ok ? '结算同步完成' : '结算同步未成功'))
    },
    onError: (error) => {
      setSyncConfirmOpen(false)
      setNotice(error.message)
    },
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const statuses = metaQuery.data?.settlementStatuses ?? ['待匹配', '差异待处理', '已确认', '已打款']

  return (
    <>
      <UedWorkspace
        title="平台结算对账"
        description="settlements / settlement_lines：账单批次、费用拆分、本地确认。可 CSV/JSON 导入，或经 apps/api 真实拉取 Lazop 结算（无凭证/未配置则禁用）。"
        rows={rows}
        detailHref={(row) => `/console/settlements/${encodeURIComponent(row.id)}`}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="结算单号 / 外部账单号 / 店铺"
        filters={[{ label: '状态', options: statuses.filter((s) => s !== '未结算') }]}
        onStatusFilterChange={(value) => {
          setStatus(value === '全部' ? '全部' : value)
          setPage(1)
        }}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        emptyText={
          listQuery.isLoading
            ? '加载结算…'
            : '暂无结算批次。可点击「导入账单」粘贴 CSV / JSON。'
        }
        columns={[
          { key: 'externalSettlementId', label: '外部结算号' },
          { key: 'platform', label: '平台' },
          { key: 'shop', label: '店铺' },
          { key: 'period', label: '账期' },
          {
            key: 'billAmount',
            label: '账单额',
            render: (row) => (
              <span className="tabular-nums">
                {row.billAmount.toLocaleString()} {row.currency}
              </span>
            ),
          },
          {
            key: 'feesTotal',
            label: '费用',
            render: (row) => <span className="tabular-nums">{row.feesTotal.toLocaleString()}</span>,
          },
          {
            key: 'payoutAmount',
            label: '打款',
            render: (row) => <span className="tabular-nums">{row.payoutAmount.toLocaleString()}</span>,
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant="secondary">{row.status}</Badge>,
          },
          {
            key: 'actions',
            label: '操作',
            render: (row) => {
              const next = NEXT_STATUS[row.status]
              if (!next) return <span className="text-xs text-muted-foreground">—</span>
              return (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPendingStatus({ id: row.id, label: row.externalSettlementId, next })
                  }}
                >
                  → {next}
                </Button>
              )
            },
          },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '批次', value: String(stats?.total ?? 0) },
            { label: '账单合计', value: (stats?.billTotal ?? 0).toLocaleString() },
            { label: '费用合计', value: (stats?.feesTotal ?? 0).toLocaleString() },
            { label: '打款合计', value: (stats?.payoutTotal ?? 0).toLocaleString() },
          ]}
        />
        <UedPrototypeNotice>
          费用拆分按费用类型展示；状态流转：待匹配 / 差异待处理 → 已确认 → 已打款，确认后的费用计入利润。Daraz
          / Lazada 支持从平台拉取结算，其它平台请使用导入。
        </UedPrototypeNotice>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setImportOpen(true)}>
            导入账单
          </Button>
          {metaQuery.data?.settlementSync?.canSync ? (
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={syncShopId}
              onChange={(e) => setSyncShopId(e.target.value)}
              aria-label="同步店铺"
            >
              <option value="">全部已授权店铺</option>
              {(metaQuery.data.settlementSync.shops.filter((s) => s.hasCredential) ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.platform}）
                </option>
              ))}
            </select>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={!metaQuery.data?.settlementSync?.canSync || syncMutation.isPending}
            title={
              metaQuery.data?.settlementSync?.disableReason ||
              '从平台拉取结算账单（apps/api → Lazop finance OpenAPI）'
            }
            onClick={() => setSyncConfirmOpen(true)}
          >
            从平台拉取
          </Button>
          {metaQuery.data?.settlementSync?.disableReason ? (
            <span className="text-xs text-muted-foreground">{metaQuery.data.settlementSync.disableReason}</span>
          ) : null}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>导入结算账单</DialogTitle>
            <DialogDescription>
              每行一条 JSON，或 CSV 头：shopId,externalSettlementId,currency,billAmount,feesTotal,payoutAmount,status。写入
              settlements / settlement_lines（本地 ERP）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="settlement-import">粘贴内容</Label>
            <Textarea
              id="settlement-import"
              rows={10}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                '{"shopId":"...","externalSettlementId":"SET-001","currency":"USD","billAmount":100,"status":"待匹配"}'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button
              disabled={importMutation.isPending || !importText.trim()}
              onClick={() => {
                const raw = importText.trim()
                let parsed: Array<Record<string, unknown>> = []
                try {
                  if (raw.startsWith('[')) parsed = JSON.parse(raw)
                  else if (raw.startsWith('{'))
                    parsed = raw
                      .split(/\n+/)
                      .filter(Boolean)
                      .map((line) => JSON.parse(line))
                  else {
                    const lines = raw.split(/\n+/).filter(Boolean)
                    const header = lines[0]!.split(',').map((h) => h.trim())
                    parsed = lines.slice(1).map((line) => {
                      const cols = line.split(',')
                      const obj: Record<string, unknown> = {}
                      header.forEach((h, i) => {
                        const v = (cols[i] ?? '').trim()
                        if (['billAmount', 'itemRevenue', 'feesTotal', 'payoutAmount'].includes(h))
                          obj[h] = Number(v)
                        else obj[h] = v
                      })
                      return obj
                    })
                  }
                } catch (e) {
                  setNotice(e instanceof Error ? e.message : '解析失败')
                  return
                }
                importMutation.mutate({
                  rows: parsed.map((r) => ({
                    shopId: String(r.shopId || ''),
                    externalSettlementId: String(r.externalSettlementId || ''),
                    currency: r.currency ? String(r.currency) : undefined,
                    periodStart: r.periodStart ? String(r.periodStart) : undefined,
                    periodEnd: r.periodEnd ? String(r.periodEnd) : undefined,
                    billAmount: r.billAmount != null ? Number(r.billAmount) : undefined,
                    itemRevenue: r.itemRevenue != null ? Number(r.itemRevenue) : undefined,
                    feesTotal: r.feesTotal != null ? Number(r.feesTotal) : undefined,
                    payoutAmount: r.payoutAmount != null ? Number(r.payoutAmount) : undefined,
                    status: r.status ? String(r.status) : '待匹配',
                    note: r.note ? String(r.note) : undefined,
                  })),
                })
              }}
            >
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingStatus != null} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认推进结算状态？</AlertDialogTitle>
            <AlertDialogDescription>
              将把 {pendingStatus?.label} 状态改为「{pendingStatus?.next}」。此为本地 ERP 软状态，不会回写平台。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingStatus) return
                updateMutation.mutate({ id: pendingStatus.id, status: pendingStatus.next })
              }}
            >
              确认改为「{pendingStatus?.next}」
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SyncConfirmDialog
        open={syncConfirmOpen}
        onOpenChange={setSyncConfirmOpen}
        title="从平台拉取结算"
        description="将调用 apps/api → syncSettlementsForShop，写入 settlements / settlement_lines。无假成功。"
        scope={{
          label: '作用店铺',
          value: (() => {
            const shops = metaQuery.data?.settlementSync?.shops?.filter((s) => s.hasCredential) ?? []
            if (syncShopId) {
              const hit = shops.find((s) => s.id === syncShopId)
              return hit ? `${hit.name}（${hit.platform}）` : syncShopId
            }
            return shops.length ? `全部已授权 Lazop 店铺（${shops.length}）` : '无可用店铺'
          })(),
        }}
        impacts={[
          '按店铺拉取近期账单与交易行，upsert 到本地 settlements',
          '仅支持已授权的 Daraz / Lazada 店铺',
          '未配置 MARKETPLACE_API_BASE_URL 或缺少凭证时会失败，不会写入假数据',
        ]}
        platformCall={{
          label: '将调用平台 OpenAPI',
          detail: 'Lazop finance：listSettlements + listSettlementTransactions',
        }}
        confirmLabel="确认拉取"
        pending={syncMutation.isPending}
        onConfirm={() => {
          syncMutation.mutate(syncShopId ? { shopId: syncShopId } : {})
        }}
      />

    </>
  )
}
