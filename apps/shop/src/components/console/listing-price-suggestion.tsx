'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { trpc } from '@/lib/trpc/client'
import { applySuggestedRetailToListingDraft } from '@/lib/crossborder/listing-price-fill'

const COUNTRY_ALIAS: Record<string, string> = {
  LK: 'LK',
  斯里兰卡: 'LK',
  SRI: 'LK',
  'SRI LANKA': 'LK',
  MY: 'MY',
  马来西亚: 'MY',
  MALAYSIA: 'MY',
  SG: 'SG',
  新加坡: 'SG',
  SINGAPORE: 'SG',
  ID: 'ID',
  印度尼西亚: 'ID',
  TH: 'TH',
  泰国: 'TH',
  PH: 'PH',
  菲律宾: 'PH',
  VN: 'VN',
  越南: 'VN',
  PK: 'PK',
  巴基斯坦: 'PK',
  BD: 'BD',
  孟加拉: 'BD',
}

export function normalizePricingCountry(raw: string | null | undefined): string {
  const value = (raw || '').trim()
  if (!value || value === '—') return ''
  return COUNTRY_ALIAS[value.toUpperCase()] ?? COUNTRY_ALIAS[value] ?? (value.length === 2 ? value.toUpperCase() : '')
}

export function normalizePricingPlatform(raw: string | null | undefined): string {
  const value = (raw || '').trim().toLowerCase()
  if (value === 'daraz') return 'daraz'
  if (value === 'lazada') return 'lazada'
  if (value === 'tiktok' || value === 'tiktok_shop') return 'tiktok_shop'
  return value
}

function money(value: number | null | undefined, currency: string) {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(2)} ${currency}`
}

export function ListingPriceSuggestion(props: {
  sku?: string
  platform?: string
  country?: string
  currentPrice?: number | null
  currency?: string
  onFill: (price: number) => void
}) {
  const sku = (props.sku || '').trim()
  const platform = normalizePricingPlatform(props.platform)
  const country = normalizePricingCountry(props.country)
  const currency = (props.currency || '').toUpperCase()
  const currentPrice = props.currentPrice ?? null
  const enabled = Boolean(sku && platform && country)
  const [confirmEstimate, setConfirmEstimate] = React.useState(false)

  const suggestQuery = trpc.pricing.suggest.useQuery(
    {
      sku,
      platform,
      country,
      currentSellPrice: currentPrice != null && Number.isFinite(currentPrice) ? currentPrice : undefined,
      currentSellCurrency: currency || undefined,
    },
    { enabled, retry: false },
  )
  const saveDraft = trpc.pricing.saveDraft.useMutation({
    onError: (err) => toast.error(`草稿未保存：${err.message}`),
  })

  const data = suggestQuery.data
  const retail = data?.primary.suggestedRetailSell ?? data?.primary.suggestedRetailCost ?? null
  const freeShipping = data?.primary.suggestedFreeShippingSell ?? data?.primary.suggestedFreeShippingCost ?? null
  const sellCurrency = data?.primary.suggestedRetailSell != null ? data.context.sellCurrency : data?.context.costCurrency ?? currency
  const isEstimate = Boolean(data?.primary.isEstimate)
  const currentMargin = data?.primary.currentMarginPct

  const fill = (confirmedEstimate: boolean) => {
    const decision = applySuggestedRetailToListingDraft({
      currentDraftPrice: currentPrice,
      suggestion: {
        suggestedRetail: retail,
        suggestedFreeShipping: freeShipping,
        isEstimate,
        currency: sellCurrency,
      },
      intent: { userClickedFill: true, confirmedEstimate },
    })
    if (decision.action === 'need_confirmation') {
      setConfirmEstimate(true)
      return
    }
    if (decision.action !== 'fill_draft' || decision.draftPrice == null) {
      toast.error(decision.reason === 'no_suggestion' ? '暂无建议零售价可填入' : '未填入建议价')
      return
    }
    props.onFill(decision.draftPrice)
    setConfirmEstimate(false)
    toast.success('已填入建议零售价（仅本地草稿，不会自动保存刊登或发布到平台）')
    if (decision.persistSuggestionDraft && retail != null) {
      saveDraft.mutate({
        sku,
        platform,
        site: country,
        suggestedRetail: retail,
        suggestedFreeShipping: freeShipping,
        currency: sellCurrency,
        isEstimate,
        source: 'listing_fill',
        snapshot: {
          gaps: data?.readiness.gaps ?? [],
          currentSellPrice: currentPrice,
        },
      })
    }
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">按成本估算</p>
        {isEstimate ? <Badge variant="secondary">估算</Badge> : null}
      </div>
      {!enabled ? (
        <p className="mt-1 text-xs text-muted-foreground">选择内部 SKU 和店铺后，将按该刊登的平台与站点测算建议价。不会在打开时自动填入售价。</p>
      ) : suggestQuery.isLoading ? (
        <p className="mt-1 text-xs text-muted-foreground">正在按成本估算…</p>
      ) : suggestQuery.error ? (
        <p className="mt-1 text-xs text-destructive">{suggestQuery.error.message}</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            建议零售 {money(retail, sellCurrency)}
            {'　'}包邮建议 {money(freeShipping, sellCurrency)}
            {'　'}当前毛利 {currentPrice != null && currentMargin != null ? `${currentMargin.toFixed(1)}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data?.context.feeSourceNote || '费用来源：本组织费用模板（非平台实时同步）'}。填入后只改本表单售价，需再保存刊登；不会自动发布到平台。
          </p>
          {data?.primary.error ? <p className="mt-1 text-xs text-destructive">{data.primary.error}</p> : null}
          {confirmEstimate ? (
            <div className="mt-2 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              <p>当前为估算（尚有缺项）。确认仍要填入建议零售价？此操作不会发布到平台，也不会自动保存刊登。</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => fill(true)}>
                  确认填入
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmEstimate(false)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={retail == null}
                onClick={() => fill(false)}
              >
                填入建议零售价
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => void suggestQuery.refetch()}>
                重新估算
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
