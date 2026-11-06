'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import {
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  EditableDetailFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

interface CandidateDetailPageProps {
  params: Promise<{ id: string }>
}

export default function CandidateDetailPage({ params }: CandidateDetailPageProps) {
  const { id } = React.use(params)
  const utils = trpc.useUtils()
  const query = trpc.candidates.get.useQuery({ id })
  const [reason, setReason] = React.useState('')
  const [mode, setMode] = React.useState<'create_draft' | 'link_existing'>('create_draft')
  const [productSpu, setProductSpu] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const acceptMutation = trpc.candidates.accept.useMutation({
    onSuccess: async (row) => {
      setNotice(
        row.productSpu
          ? `已通过并关联/创建 SPU ${row.productSpu}`
          : '已通过审核',
      )
      await utils.candidates.get.invalidate({ id })
      await utils.candidates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const rejectMutation = trpc.candidates.reject.useMutation({
    onSuccess: async () => {
      setNotice('已拒绝并写入理由')
      await utils.candidates.get.invalidate({ id })
      await utils.candidates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }
  const candidate = query.data
  if (!candidate) notFound()

  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '选品候选', href: '/console/candidates' }, { label: candidate.title }]}
      />
      <DetailPageHeader
        backHref="/console/candidates"
        title={candidate.title}
        description={candidate.categoryHint || '未分类'}
        badges={
          <>
            <Badge variant={candidate.dbStatus === 'new' ? 'secondary' : 'default'}>
              {candidate.status}
            </Badge>
            <Badge variant="outline">{candidate.source}</Badge>
            <Badge variant="secondary">{candidate.goNoGo}</Badge>
            <Badge variant="outline">{candidate.evidenceLabel}</Badge>
          </>
        }
        actions={
          candidate.productSpu ? (
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/products/${candidate.productSpu}`}>打开 SPU</LocaleLink>
            </Button>
          ) : null
        }
      />

      <Alert>
        <AlertTitle>库内候选 · 非爬虫结果</AlertTitle>
        <AlertDescription>
          本页读写 product_candidates。通过可创建 SPU 草稿或关联已有商品；拒绝必须填写理由。不会触发平台刊登或采购。
        </AlertDescription>
      </Alert>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <DetailKpiRow
        items={[
          { label: '评分', value: candidate.score.toFixed(2) },
          {
            label: '到仓成本',
            value: candidate.landedCost ? `${candidate.landedCost} ${candidate.currency}` : '—',
          },
          {
            label: '建议售价',
            value: candidate.suggestPrice ? `${candidate.suggestPrice} ${candidate.currency}` : '—',
          },
          {
            label: '净利率',
            value: candidate.marginPct ? `${candidate.marginPct}%` : '—',
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <EditableDetailFields
          title="候选字段"
          columns={2}
          fields={[
            { key: 'id', label: 'ID', value: candidate.id, mono: true, readOnly: true, required: true },
            { key: 'categoryHint', label: '类目', value: candidate.categoryHint, readOnly: true },
            { key: 'url', label: '链接', value: candidate.url || '—', readOnly: true },
            { key: 'source', label: '来源', value: candidate.source, readOnly: true },
            { key: 'competition', label: '竞争', value: candidate.competition || '—', readOnly: true },
            { key: 'risk', label: '风险', value: candidate.risk || '—', readOnly: true },
            {
              key: 'marketPotential',
              label: '市场潜力',
              value: candidate.marketPotential || '—',
              readOnly: true,
            },
            {
              key: 'product',
              label: '关联商品',
              value: candidate.productSpu || candidate.productId || '未关联',
              readOnly: true,
            },
          ]}
        />

        <DetailSection title="审核">
          {candidate.dbStatus === 'new' ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>通过方式</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_draft">创建 SPU 草稿</SelectItem>
                    <SelectItem value="link_existing">关联已有 SPU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === 'link_existing' ? (
                <div className="space-y-1">
                  <Label>已有 SPU 编码</Label>
                  <Input value={productSpu} onChange={(e) => setProductSpu(e.target.value)} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={acceptMutation.isPending || (mode === 'link_existing' && !productSpu.trim())}
                  onClick={() =>
                    acceptMutation.mutate({
                      id: candidate.id,
                      mode,
                      productSpu: mode === 'link_existing' ? productSpu.trim() : undefined,
                    })
                  }
                >
                  通过
                </Button>
              </div>
              <div className="space-y-1">
                <Label>拒绝理由（必填）</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
              <Button
                size="sm"
                variant="destructive"
                disabled={!reason.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate({ id: candidate.id, reason: reason.trim() })}
              >
                拒绝
              </Button>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p>状态：{candidate.status}</p>
              <p>审核人：{candidate.reviewedBy || '—'}</p>
              <p>审核时间：{candidate.reviewedAt}</p>
              {candidate.rejectReason ? <p>拒绝理由：{candidate.rejectReason}</p> : null}
              {candidate.productSpu ? (
                <p>
                  关联 SPU：
                  <LocaleLink className="underline" href={`/console/products/${candidate.productSpu}`}>
                    {candidate.productSpu}
                  </LocaleLink>
                </p>
              ) : null}
            </div>
          )}
        </DetailSection>
      </div>

      <DetailSection title="理由摘要">
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
          {JSON.stringify(candidate.rationale ?? {}, null, 2)}
        </pre>
      </DetailSection>
    </div>
  )
}
