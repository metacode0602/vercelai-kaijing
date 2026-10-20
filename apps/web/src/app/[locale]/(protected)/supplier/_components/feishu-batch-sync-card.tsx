'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible'
import { cn } from '@workspace/ui/lib/utils'

type FeishuStatusHistoryEntry = {
  at: string
  from_status?: string
  to_status: string
  batch_status_before: string
  batch_status_after: string
  inbound_channel: 'bitable_automation' | 'event_subscription'
  idempotency_key: string
  fields_snapshot_digest?: string
  operator_hint?: string
}

type FeishuBatchFeishuMeta = {
  create_status?: 'pending' | 'created' | 'failed'
  last_webhook_at?: string
  last_feishu_status?: string
  last_sync_at?: string
  inbound_channel?: 'bitable_automation' | 'event_subscription'
  status_history?: FeishuStatusHistoryEntry[]
}

const INBOUND_CHANNEL_LABELS: Record<string, string> = {
  bitable_automation: 'Bitable 自动化',
  event_subscription: '事件订阅',
}

function formatDt(value: string | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('zh-CN')
}

function isLikelyDeduped(current: FeishuStatusHistoryEntry, previous: FeishuStatusHistoryEntry | undefined) {
  if (!previous) return false
  if (current.to_status !== previous.to_status) return false
  const currentAt = new Date(current.at).getTime()
  const previousAt = new Date(previous.at).getTime()
  if (Number.isNaN(currentAt) || Number.isNaN(previousAt)) return false
  return Math.abs(currentAt - previousAt) <= 60_000
}

export function FeishuBatchSyncCard({ metadata }: { metadata: unknown }) {
  const [historyOpen, setHistoryOpen] = useState(false)

  const feishu = useMemo(() => {
    if (!metadata || typeof metadata !== 'object') return null
    return ((metadata as { feishu?: FeishuBatchFeishuMeta }).feishu ?? null)
  }, [metadata])

  const history = feishu?.status_history ?? []
  const hasFeishuData = Boolean(
    feishu &&
      (feishu.create_status ||
        feishu.last_feishu_status ||
        feishu.last_webhook_at ||
        feishu.last_sync_at ||
        feishu.inbound_channel ||
        history.length > 0),
  )

  if (!hasFeishuData) return null

  const lastSyncAt = feishu?.last_sync_at ?? feishu?.last_webhook_at
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">飞书同步</CardTitle>
        <CardDescription>入站状态与审计时间线（只读）</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">最后飞书状态</p>
            <p className="font-medium">{feishu?.last_feishu_status ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">最后同步时间</p>
            <p className="font-medium">{formatDt(lastSyncAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">入站通道</p>
            <p className="font-medium">
              {feishu?.inbound_channel
                ? (INBOUND_CHANNEL_LABELS[feishu.inbound_channel] ?? feishu.inbound_channel)
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">建单状态</p>
            <p className="font-medium">{feishu?.create_status ?? '—'}</p>
          </div>
        </div>

        {sortedHistory.length > 0 ? (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span>状态变更历史（{sortedHistory.length}）</span>
                <ChevronDown
                  className={cn('size-4 transition-transform', historyOpen && 'rotate-180')}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <ol className="relative space-y-4 border-l pl-4">
                {sortedHistory.map((entry, index) => {
                  const previous = sortedHistory[index + 1]
                  const deduped = isLikelyDeduped(entry, previous)
                  return (
                    <li key={`${entry.at}-${entry.idempotency_key}`} className="relative">
                      <span className="absolute -left-[1.35rem] top-1.5 size-2 rounded-full bg-primary" />
                      <div className="space-y-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{formatDt(entry.at)}</span>
                          {deduped ? (
                            <Badge variant="outline" className="text-[10px]">
                              已去重
                            </Badge>
                          ) : null}
                          <Badge variant="secondary" className="text-[10px]">
                            {INBOUND_CHANNEL_LABELS[entry.inbound_channel] ?? entry.inbound_channel}
                          </Badge>
                        </div>
                        <p>
                          飞书状态：{entry.from_status ? `${entry.from_status} → ` : ''}
                          {entry.to_status}
                        </p>
                        <p className="text-muted-foreground">
                          批次状态：{entry.batch_status_before} → {entry.batch_status_after}
                        </p>
                        {entry.operator_hint ? (
                          <p className="text-xs text-muted-foreground">{entry.operator_hint}</p>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <p className="text-sm text-muted-foreground">暂无入站状态历史；飞书回写后将在此展示。</p>
        )}
      </CardContent>
    </Card>
  )
}
