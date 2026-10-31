'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  type FeeBreakdown,
  type FinanceSettlement,
  sumFeeBreakdown,
  updateSettlementStatus,
  upsertSettlement,
  useSettlements,
} from '@/lib/crossborder/finance-store'
import { appendAuditEvent } from '@/lib/crossborder/audit-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function feeLabel(fees: FeeBreakdown) {
  return `平台 ${fees.platform} / 物流 ${fees.logistics} / 推广 ${fees.ads} / JSB ${fees.jsb} / 退款 ${fees.refunds} / 汇兑 ${fees.fx}`
}

export default function SettlementsPage() {
  const rows = useSettlements()
  const [open, setOpen] = React.useState(false)
  const [reviewTarget, setReviewTarget] = React.useState<FinanceSettlement | null>(null)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="导入平台账单"
      description="上传平台结算账单后自动按订单匹配；差异行进入处理队列，确认后锁定期间。费用拆分占位写入本会话。"
      fields={[
        { key: 'platform', label: '平台', options: ['Daraz', 'Lazada', 'TikTok'], required: true },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada MY', 'Lazada TH'], required: true },
        { key: 'period', label: '结算周期', required: true, placeholder: '如 2026-10 上半月' },
        { key: 'file', label: '账单文件名', required: true },
        { key: 'currency', label: '账单币种', options: ['USD', 'MYR', 'THB', 'PHP', 'SGD', 'VND'], required: true },
        { key: 'billAmount', label: '账单总额', type: 'number' },
        { key: 'feePlatform', label: '平台佣金', type: 'number' },
        { key: 'feeLogistics', label: '物流费', type: 'number' },
        { key: 'feeAds', label: '推广费', type: 'number' },
        { key: 'feeJsb', label: 'JSB 费用', type: 'number' },
        { key: 'feeRefunds', label: '退款扣回', type: 'number' },
        { key: 'feeFx', label: '汇兑损益', type: 'number' },
        { key: 'periodStart', label: '账期开始', type: 'date', required: true },
        { key: 'periodEnd', label: '账期结束', type: 'date', required: true },
        { key: 'remark', label: '导入备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const fees: FeeBreakdown = {
          platform: Number(values.feePlatform || 0),
          logistics: Number(values.feeLogistics || 0),
          ads: Number(values.feeAds || 0),
          jsb: Number(values.feeJsb || 0),
          refunds: Number(values.feeRefunds || 0),
          fx: Number(values.feeFx || 0),
        }
        const row: FinanceSettlement = {
          id: `STL-IMP-${String(rows.length + 1).padStart(4, '0')}`,
          platform: values.platform || 'Daraz',
          shop: values.shop || 'Daraz LK',
          period: values.period || '待填周期',
          billAmount: Number(values.billAmount || 0),
          currency: values.currency || 'USD',
          matchedOrders: 0,
          diffAmount: 0,
          status: '待匹配',
          fees,
        }
        upsertSettlement(row)
        appendAuditEvent({
          actor: '杨洁',
          action: '导入平台账单',
          object: row.id,
          entityType: 'settlement',
          result: '待匹配',
          detail: `费用合计 ${sumFeeBreakdown(fees)} ${row.currency}`,
        })
        setOpen(false)
        setNotice('账单已写入财务会话（待匹配）；费用拆分已占位保存。')
      }}
    />
  ) : null

  function submitReview(values: Record<string, string>) {
    if (!reviewTarget) return
    const conclusion = values.conclusion || '调整账单行'
    const reason = values.reason || '未填写原因'
    const target = reviewTarget
    updateSettlementStatus(target.id, '待匹配', 0)
    appendAuditEvent({
      actor: '黄发聪',
      action: `提交差异复核（${conclusion}）`,
      object: target.id,
      entityType: 'settlement',
      result: '待匹配',
      detail: reason,
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
    updateSettlementStatus(id, '已确认')
    appendAuditEvent({
      actor: '杨洁',
      action: '确认对账',
      object: id,
      entityType: 'settlement',
      result: '已确认',
      detail: '差异为 0，确认后锁定期间',
    })
    setNotice(`${id} 已确认：期间账单锁定，确认事件写入审计会话。`)
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
        description="导入平台账单 → 自动匹配订单 → 处理差异 → 确认锁定；费用拆分：平台 / 物流 / 推广 / JSB / 退款 / 汇兑。"
        rows={rows}
        detailHref={(row) => `/console/settlements/${encodeURIComponent(row.id)}`}
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
          {
            key: 'billAmount',
            label: '账单金额',
            render: (row) => `${row.billAmount.toLocaleString()} ${row.currency}`,
          },
          {
            key: 'fees',
            label: '费用拆分',
            render: (row) => (
              <span className="text-xs text-muted-foreground" title={feeLabel(row.fees)}>
                Σ {sumFeeBreakdown(row.fees).toLocaleString()}
              </span>
            ),
          },
          { key: 'matchedOrders', label: '匹配订单', render: (row) => String(row.matchedOrders) },
          {
            key: 'diffAmount',
            label: '差异',
            render: (row) => (
              <span className={row.diffAmount !== 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>
                {row.diffAmount === 0 ? '0' : `${row.diffAmount > 0 ? '+' : ''}${row.diffAmount}`}
              </span>
            ),
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge
                variant={
                  row.status === '已确认' ? 'secondary' : row.status === '差异待处理' ? 'destructive' : 'outline'
                }
              >
                {row.status}
              </Badge>
            ),
          },
        ]}
      >
        <UedPrototypeNotice>
          结算与费用拆分写入本地财务会话（无 tRPC / DB）。蔡值为只读角色。差异处理与确认写入审计事件。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.status === '差异待处理')
            .map((row) => (
              <Button key={row.id} variant="outline" size="sm" onClick={() => setReviewTarget(row)}>
                提交差异复核 · {row.id}
              </Button>
            ))}
          {rows
            .filter((row) => row.status !== '已确认')
            .map((row) => {
              const blocked = row.diffAmount !== 0 || row.matchedOrders === 0
              return (
                <Button
                  key={`ok-${row.id}`}
                  size="sm"
                  disabled={blocked}
                  title={
                    row.diffAmount !== 0
                      ? '存在差异，请先提交差异复核'
                      : row.matchedOrders === 0
                        ? '尚未匹配订单，不能确认'
                        : '确认后锁定期间'
                  }
                  onClick={() => confirm(row.id)}
                >
                  确认对账 · {row.id}
                </Button>
              )
            })}
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-3">
            <h2 className="font-medium">费用拆分说明</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              平台佣金 · 物流费 · 推广费 · JSB · 退款扣回 · 汇兑损益；点开账单详情可查看完整拆分。
            </p>
          </div>
          <div className="divide-y">
            {rows.slice(0, 3).map((row) => (
              <div key={row.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[10rem_1fr]">
                <span className="font-medium">{row.id}</span>
                <span className="text-muted-foreground">{feeLabel(row.fees)}</span>
              </div>
            ))}
          </div>
        </div>
      </UedWorkspace>
    </>
  )
}
