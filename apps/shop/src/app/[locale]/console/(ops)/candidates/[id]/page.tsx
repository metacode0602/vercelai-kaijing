import { notFound } from 'next/navigation'
import { PageDemoBanner } from '@/components/console/page-demo-banner'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { getCandidateById, getShopById } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

interface CandidateDetailPageProps {
  params: Promise<{ id: string }>
}

function goBadge(go: string) {
  if (go === 'GO') return 'default' as const
  if (go === 'HOLD') return 'secondary' as const
  return 'outline' as const
}

export default async function CandidateDetailPage({ params }: CandidateDetailPageProps) {
  const { id } = await params
  const candidate = getCandidateById(id)
  if (!candidate) notFound()

  const shops = candidate.recommendedShops
    .map((shopId) => getShopById(shopId)?.name ?? shopId)
    .join(' · ')

  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <DetailPageHeader
        backHref="/console/candidates"
        title={candidate.title}
        description={candidate.categoryHint}
        badges={
          <>
            <Badge variant={candidate.status === 'new' ? 'secondary' : 'default'}>
              {candidate.status}
            </Badge>
            <Badge variant={goBadge(candidate.goNoGo)}>Go/No-Go · {candidate.goNoGo}</Badge>
          </>
        }
        actions={
          <>
            <Button size="sm" disabled>
              接受（→ 待审）
            </Button>
            <Button size="sm" variant="outline" disabled>
              拒绝
            </Button>
          </>
        }
      />

      <DetailKpiRow
        items={[
          { label: '潜力评分', value: candidate.score.toFixed(2), hint: '示例' },
          {
            label: '到仓成本',
            value: `${candidate.landedCost.toFixed(2)} ${candidate.currency}`,
          },
          {
            label: '建议售价',
            value: `${candidate.suggestPrice.toFixed(2)} ${candidate.currency}`,
          },
          { label: '净利率', value: `${candidate.marginPct}%` },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailFieldGrid
          title="product_candidates 字段"
          columns={2}
          fields={[
            { label: 'id', value: candidate.id, mono: true },
            { label: 'categoryHint', value: candidate.categoryHint },
            { label: 'competition', value: candidate.competition },
            { label: 'risk', value: candidate.risk },
            { label: 'url', value: candidate.url, mono: true },
            { label: '推荐店铺', value: shops },
          ]}
        />

        <DetailSection title="市场 / 决策说明（rationale）">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">市场潜力</dt>
              <dd className="mt-1 font-medium">{candidate.marketPotential}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">demand</dt>
              <dd className="mt-1 text-muted-foreground">{candidate.rationale.demand}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">margin</dt>
              <dd className="mt-1 text-muted-foreground">{candidate.rationale.margin}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">risk</dt>
              <dd className="mt-1 text-muted-foreground">{candidate.rationale.risk}</dd>
            </div>
          </dl>
        </DetailSection>
      </div>

      <DetailSection title="AI 信号" description="C 级决策辅助 · 不直接写生产">
        <div className="flex flex-wrap gap-2">
          {candidate.aiSignals.map((signal) => (
            <Badge key={signal} variant="secondary">
              {signal}
            </Badge>
          ))}
        </div>
      </DetailSection>
    </div>
  )
}
