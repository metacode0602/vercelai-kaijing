'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { getCandidateById, getShopById } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import { labelField, labelStatus } from '@/lib/console/labels'

interface CandidateDetailPageProps {
  params: Promise<{ id: string }>
}

function goBadge(go: string) {
  if (go === 'GO') return 'default' as const
  if (go === 'HOLD') return 'secondary' as const
  return 'outline' as const
}

type DemoReviewChoice = 'continue' | 'hold' | 'no_go'
const REVIEW_CHOICES: { value: DemoReviewChoice; label: string }[] = [
  { value: 'continue', label: '继续验证' },
  { value: 'hold', label: '暂缓' },
  { value: 'no_go', label: '不建议' },
]

export default function CandidateDetailPage({ params }: CandidateDetailPageProps) {
  const { id } = React.use(params)
  const candidate = getCandidateById(id)
  const [decision, setDecision] = React.useState('')
  const [reason, setReason] = React.useState(candidate?.reviewReason ?? '')
  const [reviewer, setReviewer] = React.useState('')
  const [saved, setSaved] = React.useState(false)

  if (!candidate) notFound()

  const shops = candidate.recommendedShops
    .map((shopId) => getShopById(shopId)?.name ?? shopId)
    .join(' · ')
  const costSku = candidate.id === 'c1' ? 'TEE-001' : candidate.id === 'c2' ? 'HUB-01' : 'MAT-02'

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/candidates"
        title={candidate.title}
        description={candidate.categoryHint}
        badges={
          <>
            <Badge variant={candidate.status === 'new' ? 'secondary' : 'default'}>{labelStatus(candidate.status)}</Badge>
            <Badge variant={goBadge(candidate.goNoGo)}>当前示例决策 · {labelStatus(candidate.goNoGo)}</Badge>
            <Badge variant="outline">{candidate.evidenceLabel}</Badge>
          </>
        }
        actions={
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href={`/console/costs/${costSku}/recalculate`}>比较成本情景</LocaleLink>
          </Button>
        }
      />

      <Alert>
        <AlertTitle>UED 演示数据 · 尚未写入业务数据库</AlertTitle>
        <AlertDescription>
          市场信息、评分、报价和成本均为示例/估算。此页的评估操作仅在当前页面会话内有效，不是正式审批，也不会触发刊登或采购。
        </AlertDescription>
      </Alert>

      <DetailKpiRow
        items={[
          { label: '机会评分（演示）', value: candidate.score.toFixed(2), hint: '证据未核实，不计为实测分' },
          { label: '到仓成本（估算）', value: `${candidate.landedCost.toFixed(2)} ${candidate.currency}`, hint: '输入和报价待复核' },
          { label: '建议售价（估算）', value: `${candidate.suggestPrice.toFixed(2)} ${candidate.currency}` },
          { label: '经营净利率（估算）', value: `${candidate.marginPct}%`, hint: '费用和报价未核实' },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailFieldGrid
          title="候选字段"
          columns={2}
          fields={[
            { label: labelField('id'), value: candidate.id, mono: true },
            { label: labelField('categoryHint'), value: candidate.categoryHint },
            { label: '竞争压力', value: `${candidate.competition} · 待核实` },
            { label: '风险状态', value: candidate.risk },
            { label: labelField('url'), value: candidate.url, mono: true },
            { label: '推荐店铺', value: shops },
          ]}
        />

        <DetailSection title="市场 / 决策说明" description="AI 输出是研究建议，不是市场事实">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">市场机会</dt><dd className="mt-1 font-medium">{candidate.marketPotential} · 待核实</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">需求线索</dt><dd className="mt-1 text-muted-foreground">{candidate.rationale.demand}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">利润线索</dt><dd className="mt-1 text-muted-foreground">{candidate.rationale.margin}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">风险线索</dt><dd className="mt-1 text-muted-foreground">{candidate.rationale.risk}</dd></div>
          </dl>
        </DetailSection>
      </div>

      <DetailSection title="证据与数据状态" description="缺少原始来源时，只能作为假设或估算，不进入实测评分">
        <div className="space-y-3">
          {candidate.evidenceSources.map((source) => (
            <div key={source.label} className="flex flex-col gap-1 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-medium">{source.label}</p><p className="text-xs text-muted-foreground">{source.detail}</p></div>
              <Badge variant="outline">{source.status === 'assumption' ? '假设 / 待验证' : '估算'}</Badge>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="candidate-source-url">补充证据链接（演示）</Label><Input id="candidate-source-url" placeholder="商品、评论或报价来源 URL" /></div>
            <div className="space-y-1"><Label htmlFor="candidate-source-note">采集/核实信息</Label><Input id="candidate-source-note" placeholder="日期、样本范围、报价有效期" /></div>
          </div>
        </div>
      </DetailSection>

      <DetailSection title="人工评估" description="记录下一步研究判断；不触发真实审批、刊登或采购">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REVIEW_CHOICES.map(({ value, label }) => (
            <Button key={value} size="sm" variant={decision === value ? 'default' : 'outline'} aria-pressed={decision === value} onClick={() => { setDecision(value); setSaved(false) }}>{label}</Button>
            ))}
          </div>
          <div className="space-y-1"><Label htmlFor="review-reason">判断理由 / 待补问题</Label><Textarea id="review-reason" value={reason} onChange={(event) => { setReason(event.target.value); setSaved(false) }} rows={3} /></div>
          <div className="space-y-1"><Label htmlFor="reviewer-name">评估人（演示）</Label><Input id="reviewer-name" value={reviewer} onChange={(event) => { setReviewer(event.target.value); setSaved(false) }} placeholder="填写姓名" /></div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!decision || !reason.trim()} onClick={() => setSaved(true)}>保存本次演示评估</Button>
            {saved ? <Badge variant="secondary">仅当前会话记录 · 未写入数据库</Badge> : null}
          </div>
        </div>
      </DetailSection>

      <DetailSection title="AI 信号" description="C 级决策辅助 · 示例内容不直接写入生产">
        <div className="flex flex-wrap gap-2">{candidate.aiSignals.map((signal) => <Badge key={signal} variant="secondary">{signal}</Badge>)}</div>
      </DetailSection>
    </div>
  )
}
