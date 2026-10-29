'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type SettlementAudit = {
  id: string
  at: string
  settlementId: string
  action: string
  before: string
  after: string
  reason: string
}

type SettlementRow = {
  id: string
  platform: string
  shop: string
  period: string
  billAmount: number
  currency: string
  matchedOrders: number
  diffAmount: number
  status: string
}

export const DEMO_SETTLEMENTS: SettlementRow[] = [
  { id: 'STL-DZ-2026-10-LK', platform: 'Daraz', shop: 'Daraz LK', period: '2026-10 上半月', billAmount: 4820.55, currency: 'USD', matchedOrders: 148, diffAmount: -12.4, status: '差异待处理' },
  { id: 'STL-LZ-2026-09-MY', platform: 'Lazada', shop: 'Lazada MY', period: '2026-09 下半月', billAmount: 12640.2, currency: 'MYR', matchedOrders: 216, diffAmount: 0, status: '已确认' },
  { id: 'STL-LZ-2026-10-TH', platform: 'Lazada', shop: 'Lazada TH', period: '2026-10 上半月', billAmount: 35800, currency: 'THB', matchedOrders: 97, diffAmount: 356, status: '待匹配' },
]

export default function SettlementsPage() {
  const [rows, setRows] = React.useState<SettlementRow[]>(DEMO_SETTLEMENTS)
  const [open, setOpen] = React.useState(false)
  const [reviewTarget, setReviewTarget] = React.useState<SettlementRow | null>(null)
  const [audit, setAudit] = React.useState<SettlementAudit[]>([])
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="导入平台账单"
      description="上传平台结算账单后自动按订单匹配；差异行进入处理队列，确认后锁定期间。"
      fields={[
        { key: 'platform', label: '平台', options: ['Daraz', 'Lazada', 'TikTok'], required: true },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada MY', 'Lazada TH'], required: true },
        { key: 'period', label: '结算周期', required: true, placeholder: '如 2026-10 上半月' },
        { key: 'file', label: '账单文件名', required: true },
        { key: 'currency', label: '账单币种', options: ['USD', 'MYR', 'THB', 'PHP', 'SGD', 'VND'], required: true },
        { key: 'billAmount', label: '账单总额', type: 'number' },
        { key: 'periodStart', label: '账期开始', type: 'date', required: true },
        { key: 'periodEnd', label: '账期结束', type: 'date', required: true },
        { key: 'remark', label: '导入备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `STL-IMP-${String(current.length + 1).padStart(4, '0')}`,
            platform: 'Daraz',
            shop: 'Daraz LK',
            period: '2026-10 下半月',
            billAmount: 0,
            currency: 'USD',
            matchedOrders: 0,
            diffAmount: 0,
            status: '待匹配',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('账单已导入为待匹配批次（原型）；自动匹配完成后差异行会出现在本列表。')
      }}
    />
  ) : null
  function appendAudit(entry: Omit<SettlementAudit, 'id' | 'at'>) {
    setAudit((current) => [
      {
        ...entry,
        id: `AUD-${String(current.length + 1).padStart(4, '0')}`,
        at: new Date().toLocaleString('zh-CN', { hour12: false }),
      },
      ...current,
    ])
  }

  function submitReview(values: Record<string, string>) {
    if (!reviewTarget) return
    const conclusion = values.conclusion || '调整账单行'
    const reason = values.reason || '未填写原因'
    const target = reviewTarget
    setRows((current) =>
      current.map((row) =>
        row.id === target.id ? { ...row, diffAmount: 0, status: '待匹配' } : row,
      ),
    )
    appendAudit({
      settlementId: target.id,
      action: `提交差异复核（${conclusion}）`,
      before: target.status,
      after: '待匹配',
      reason,
    })
    setReviewTarget(null)
    setNotice(`${target.id} 差异已提交复核并归零；请复核后执行「确认对账」。`)
  }

  function confirm(id: string) {
    const target = rows.find((row) => row.id === id)
    if (!target) return
    if (target.diffAmount !== 0) {
      setNotice(`${id} 仍有差异 ${target.diffAmount} ${target.currency}，不能直接确认；请先提交差异复核。`)
      return
    }
    if (target.matchedOrders === 0) {
      setNotice(`${id} 尚未匹配到订单，不能确认；请先完成订单匹配。`)
      return
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: '已确认' } : row)))
    appendAudit({
      settlementId: id,
      action: '确认对账',
      before: target.status,
      after: '已确认',
      reason: '差异为 0，确认后锁定期间',
    })
    setNotice(`${id} 已确认：期间账单锁定，确认事件记入审计（原型）。`)
  }
  const reviewEditor = reviewTarget ? (
    <UedDialog
      title="提交差异复核"
      description="差异不能直接确认；先填写处理结论与原因，复核通过后差异归零，再执行确认对账。"
      fields={[
        { key: 'conclusion', label: '处理结论', options: ['调整账单行', '补录订单匹配', '接受差异并备注'], required: true },
        { key: 'reason', label: '处理原因', type: 'textarea', required: true, fullWidth: true, placeholder: '说明差异来源、调整依据和复核人' },
      ]}
      onClose={() => setReviewTarget(null)}
      onSave={submitReview}
      saveLabel="提交复核"
    />
  ) : null

  return (
    <>
      {editor}
      {reviewEditor}
      <UedWorkspace
        title="平台结算对账"
        description="导入平台账单 → 自动匹配订单 → 处理差异 → 确认锁定；对账口径按原币分列。"
        rows={rows} detailHref={(row) => `/console/settlements/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'platform', 'shop', 'period', 'status']}
        searchPlaceholder="搜索账单号、平台或店铺"
        filters={[{ label: '状态', options: ['待匹配', '差异待处理', '已确认'] }]}
        addLabel="导入平台账单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '账单号' },
          { key: 'platform', label: '平台' },
          { key: 'shop', label: '店铺' },
          { key: 'period', label: '结算周期' },
          { key: 'billAmount', label: '账单金额', render: (row) => `${row.billAmount.toLocaleString()} ${row.currency}` },
          { key: 'matchedOrders', label: '匹配订单', render: (row) => String(row.matchedOrders) },
          { key: 'diffAmount', label: '差异', render: (row) => <span className={row.diffAmount !== 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>{row.diffAmount === 0 ? '0' : `${row.diffAmount > 0 ? '+' : ''}${row.diffAmount}`}</span> },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已确认' ? 'secondary' : row.status === '差异待处理' ? 'destructive' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          账单费用来源（佣金/物流/推广/罚款）与差异处理规则待财务确认；蔡值为只读角色，不能执行导入与确认。差异处理保留「账单行 ↔ 订单 ↔ 处理结论」三元审计记录，确认后期间不可再导入。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '差异待处理').map((row) => (
            <Button key={row.id} variant="outline" size="sm" onClick={() => setReviewTarget(row)}>提交差异复核 · {row.id}</Button>
          ))}
          {rows.filter((row) => row.status !== '已确认').map((row) => {
            const blocked = row.diffAmount !== 0 || row.matchedOrders === 0
            return (
              <Button
                key={`ok-${row.id}`}
                size="sm"
                disabled={blocked}
                title={row.diffAmount !== 0 ? '存在差异，请先提交差异复核' : row.matchedOrders === 0 ? '尚未匹配订单，不能确认' : '确认后锁定期间'}
                onClick={() => confirm(row.id)}
              >
                确认对账 · {row.id}
              </Button>
            )
          })}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
        <div className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-3">
            <h2 className="font-medium">审计记录（原型会话）</h2>
            <p className="mt-1 text-sm text-muted-foreground">差异复核与确认对账均记录操作人、前后状态和原因；正式环境写入审计表。</p>
          </div>
          {audit.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">暂无操作记录。提交差异复核或确认对账后在此显示。</p>
          ) : (
            <div className="divide-y">
              {audit.slice(0, 5).map((entry) => (
                <div key={entry.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[10rem_1fr_auto] sm:items-center">
                  <span className="text-muted-foreground">{entry.at}</span>
                  <span><span className="font-medium">{entry.settlementId}</span> · {entry.action} · {entry.before} → {entry.after}</span>
                  <span className="text-muted-foreground">{entry.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </UedWorkspace>
    </>
  )
}
