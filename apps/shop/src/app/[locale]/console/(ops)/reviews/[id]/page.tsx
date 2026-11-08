'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.reviews.get.useQuery({ id })
  const row = query.data
  const [reply, setReply] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const saveReply = trpc.reviews.saveManualReply.useMutation({
    onSuccess: async () => {
      setNotice('已保存手工回复（仅 ERP 内，未发往平台）。')
      setReply('')
      await utils.reviews.get.invalidate({ id })
      await utils.reviews.list.invalidate()
      await utils.reviews.stats.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const stubReply = trpc.reviews.queuePlatformReplyStub.useMutation({
    onSuccess: async (res) => {
      setNotice(res.note)
      await utils.reviews.get.invalidate({ id })
      await utils.reviews.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  React.useEffect(() => {
    if (row?.replyContent) setReply(row.replyContent)
  }, [row?.replyContent])

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/reviews" title="加载中…" description="读取 product_reviews…" />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/reviews"
          title="未找到评论"
          description={`评论 ${id} 不存在或无权访问。`}
        />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration items={[{ label: '商品评论', href: '/console/reviews' }, { label: row.id }]} />
      <DetailPageHeader
        backHref="/console/reviews"
        title={`${row.rating} ★ · ${row.sentiment}`}
        description={`${row.shop} · ${row.buyer} · ${row.at}`}
        badges={
          <>
            <Badge variant="outline">{row.replyStatus}</Badge>
            <Badge variant={row.sentiment === '负面' ? 'destructive' : 'secondary'}>{row.sentiment}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {row.listingId ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/listings/${encodeURIComponent(row.listingId)}`}>刊登</LocaleLink>
              </Button>
            ) : null}
            {row.internalSku && row.internalSku !== '—' ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/master-skus/${encodeURIComponent(row.internalSku)}`}>SKU</LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />
      <UedPrototypeNotice>
        回复状态会保存；手工回复仅保存在本站，「排队平台回复」暂未接通平台接口，不会同步到平台。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '星级', value: String(row.rating) },
          { label: '情感', value: row.sentiment },
          { label: '图片数', value: String(row.images) },
          { label: '回复', value: row.replyStatus },
          { label: '来源', value: row.source },
        ]}
      />
      <DetailFieldGrid
        title="评论正文"
        description="原文与译文"
        fields={[
          { label: '评论 ID', value: row.id, mono: true },
          { label: '原文', value: row.content },
          { label: '译文', value: row.contentZh || '—' },
          { label: '平台变体', value: row.platformSku },
          { label: 'Item ID', value: row.itemId, mono: true },
          { label: '内部 SKU', value: row.internalSku, mono: true },
          { label: '刊登', value: row.listingId || '—', mono: true },
          { label: '抓取时间', value: row.fetchedAt || '—' },
          { label: '标签', value: row.tags.length ? row.tags.join('、') : '—' },
          { label: '已存回复', value: row.replyContent || '—' },
          { label: '回复时间', value: row.repliedAt || '—' },
        ]}
      />
      <div className="space-y-2 rounded-md border p-4">
        <p className="text-sm font-medium">回复</p>
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="回复内容（ERP 内或作为 stub 草稿）" rows={4} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={saveReply.isPending || !reply.trim()}
            onClick={() => saveReply.mutate({ id: row.id, content: reply })}
          >
            保存手工回复
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={stubReply.isPending}
            onClick={() => stubReply.mutate({ id: row.id, content: reply || undefined })}
          >
            排队平台回复（stub）
          </Button>
        </div>
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      </div>
    </div>
  )
}
