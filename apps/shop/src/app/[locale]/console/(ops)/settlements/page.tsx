'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { SyncConfirmDialog } from '@/components/console/sync-confirm-dialog'
import { DetailKpiRow } from '@/components/console/detail'
import { trpc } from '@/lib/trpc/client'
import {
  downloadSettlementTemplate,
  parseSettlementWorkbook,
  type SettlementWorkbookParseResult,
} from './_lib/settlement-import'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

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
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importPreview, setImportPreview] = React.useState<SettlementWorkbookParseResult | null>(null)
  const [importParseError, setImportParseError] = React.useState('')
  const [pendingStatus, setPendingStatus] = React.useState<{ id: string; label: string; next: string } | null>(
    null,
  )
  const [syncConfirmOpen, setSyncConfirmOpen] = React.useState(false)
  const [syncShopId, setSyncShopId] = React.useState('')
  const importFileRef = React.useRef<HTMLInputElement>(null)
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
      setImportFile(null)
      setImportPreview(null)
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

  async function onImportFile(file: File) {
    setImportFile(file)
    setImportPreview(null)
    setImportParseError('')
    try {
      const shops = metaQuery.data?.shops ?? []
      if (!shops.length) {
        setImportParseError('尚未加载店铺列表，请稍后重试')
        return
      }
      const buffer = await file.arrayBuffer()
      setImportPreview(parseSettlementWorkbook(buffer, shops))
    } catch (error) {
      setImportParseError(error instanceof Error ? error.message : '解析 Excel 失败')
    }
  }

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const statuses = metaQuery.data?.settlementStatuses ?? ['待匹配', '差异待处理', '已确认', '已打款']

  return (
    <>
      <UedWorkspace
        title="平台结算对账"
        description="settlements / settlement_lines：账单批次、费用拆分、本地确认。支持 Excel 导入（模板可下载，字段对齐 Lazop Finance OpenAPI），或经 apps/api 真实拉取 Lazop 结算（无凭证/未配置则禁用）。"
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
            : '暂无结算批次。可点击「导入账单」上传 Excel（先在弹窗中下载模板）。'
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
          / Lazada 支持从平台拉取结算，其它平台请使用 Excel 导入。
        </UedPrototypeNotice>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setImportOpen(true)}>
            导入账单
          </Button>
          {metaQuery.data?.settlementSync?.canSync ? (
            <Select
              value={syncShopId === '' ? '__empty__' : syncShopId}
              onValueChange={(value) => setSyncShopId(value === '__empty__' ? '' : value)}
            >
              <SelectTrigger className="h-8" aria-label="同步店铺">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">全部已授权店铺</SelectItem>
                {(metaQuery.data.settlementSync.shops.filter((s) => s.hasCredential) ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}（{s.platform}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void onImportFile(file)
        }}
      />

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open)
          if (!open) {
            setImportFile(null)
            setImportPreview(null)
            setImportParseError('')
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>导入结算账单</DialogTitle>
            <DialogDescription>
              上传 Excel（.xlsx）：settlements 表每行一个结算单，transaction_details 表经 statement
              关联明细；字段对齐 Lazop Finance OpenAPI。写入 settlements / settlement_lines（本地 ERP）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={downloadSettlementTemplate}>
                下载模板
              </Button>
              <Button size="sm" variant="secondary" onClick={() => importFileRef.current?.click()}>
                选择 Excel 文件
              </Button>
              <span className="text-sm text-muted-foreground">{importFile?.name ?? '未选择文件'}</span>
            </div>
            {importParseError ? (
              <p role="alert" className="text-sm text-destructive">
                {importParseError}
              </p>
            ) : null}
            {importPreview ? (
              <div className="rounded-md border p-3 text-sm space-y-1">
                <p>
                  识别结算单 <span className="tabular-nums">{importPreview.stats.settlements}</span> 条，明细{' '}
                  <span className="tabular-nums">{importPreview.stats.lines}</span> 条，跳过{' '}
                  <span className="tabular-nums">{importPreview.stats.skippedLines}</span> 条。
                </p>
                {importPreview.issues.slice(0, 5).map((issue, index) => (
                  <p key={index} className="text-muted-foreground">
                    {issue.sheet} 第 {issue.row || '—'} 行：{issue.message}
                  </p>
                ))}
                {importPreview.issues.length > 5 ? (
                  <p className="text-muted-foreground">…另有 {importPreview.issues.length - 5} 条提示</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button
              disabled={
                importMutation.isPending ||
                !importPreview ||
                importPreview.rows.length === 0
              }
              onClick={() => {
                if (!importPreview?.rows.length) return
                importMutation.mutate({ rows: importPreview.rows })
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
