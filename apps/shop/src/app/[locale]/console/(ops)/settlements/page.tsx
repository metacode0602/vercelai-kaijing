'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
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

export default function SettlementsPage() {
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')
  const [notice, setNotice] = React.useState('')
  const [importOpen, setImportOpen] = React.useState(false)
  const [importText, setImportText] = React.useState('')
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
          : `已导入 ${res.success} 条结算批次`,
      )
    },
    onError: (error) => setNotice(error.message),
  })
  const updateMutation = trpc.finance.updateSettlementStatus.useMutation({
    onSuccess: async (row) => {
      await utils.finance.listSettlements.invalidate()
      await utils.finance.settlementStats.invalidate()
      await utils.finance.overview.invalidate()
      setNotice(`${row.externalSettlementId} 状态已更新为 ${row.status}（本地 ERP，非平台回写）。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const statuses = metaQuery.data?.settlementStatuses ?? ['待匹配', '差异待处理', '已确认', '已打款']

  return (
    <>
    <UedWorkspace
      title="平台结算对账"
      description="settlements / settlement_lines：账单批次、费用拆分（按明细汇总）、本地确认。非平台 OpenAPI 拉取。"
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
        费用拆分来自 settlement_lines.fee_kind。状态机：待匹配 → 差异待处理 → 已确认 → 已打款。确认后的费用进入利润。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setImportOpen(true)}>
          导入账单
        </Button>
        {rows
          .filter((r) => r.status === '待匹配' || r.status === '差异待处理')
          .slice(0, 4)
          .map((row) => (
            <Button
              key={row.id}
              size="sm"
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: row.id, status: '已确认' })}
            >
              确认 · {row.externalSettlementId}
            </Button>
          ))}
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>导入结算账单</DialogTitle>
            <DialogDescription>
              每行一条 JSON，或 CSV 头：shopId,externalSettlementId,currency,billAmount,feesTotal,payoutAmount,status。写入 settlements / settlement_lines。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="settlement-import">粘贴内容</Label>
            <Textarea
              id="settlement-import"
              rows={10}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'{"shopId":"...","externalSettlementId":"SET-001","currency":"USD","billAmount":100,"status":"待匹配"}'}
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
                let rows: Array<Record<string, unknown>> = []
                try {
                  if (raw.startsWith('[')) rows = JSON.parse(raw)
                  else if (raw.startsWith('{')) rows = raw.split(/\n+/).filter(Boolean).map((line) => JSON.parse(line))
                  else {
                    const lines = raw.split(/\n+/).filter(Boolean)
                    const header = lines[0]!.split(',').map((h) => h.trim())
                    rows = lines.slice(1).map((line) => {
                      const cols = line.split(',')
                      const obj: Record<string, unknown> = {}
                      header.forEach((h, i) => {
                        const v = (cols[i] ?? '').trim()
                        if (['billAmount', 'itemRevenue', 'feesTotal', 'payoutAmount'].includes(h)) obj[h] = Number(v)
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
                  rows: rows.map((r) => ({
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
    </>
  )
}
