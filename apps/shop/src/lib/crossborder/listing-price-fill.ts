/**
 * 刊登页「填入建议零售价」决策：只改本地草稿字段，不自动发布、不自动写库。
 * 缺项估算必须额外确认。真正写入 listings.price_amount 仍走用户点击保存刊登。
 * @see docs/design/multi-platform-pricing-calculator-ux-2026-11-11.md §7.5 / §11
 */

export type ListingPriceFillIntent = {
  userClickedFill: boolean
  confirmedEstimate?: boolean
}

export type ListingPriceSuggestion = {
  suggestedRetail: number | null
  suggestedFreeShipping?: number | null
  isEstimate: boolean
  currency: string
}

export type ListingPriceFillResult = {
  action: 'none' | 'need_confirmation' | 'fill_draft'
  reason: 'not_clicked' | 'no_suggestion' | 'estimate' | 'filled'
  /** 仅本地表单字段，不是 listings.price_amount */
  draftPrice: number | null
  listingPriceWritten: false
  published: false
  calledMarketplaceWrite: false
  persistSuggestionDraft: boolean
}

export function applySuggestedRetailToListingDraft(args: {
  currentDraftPrice: number | null
  suggestion: ListingPriceSuggestion
  intent: ListingPriceFillIntent
}): ListingPriceFillResult {
  const base = {
    listingPriceWritten: false as const,
    published: false as const,
    calledMarketplaceWrite: false as const,
    draftPrice: args.currentDraftPrice,
    persistSuggestionDraft: false,
  }
  if (!args.intent.userClickedFill) {
    return { ...base, action: 'none', reason: 'not_clicked' }
  }
  const price = args.suggestion.suggestedRetail
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { ...base, action: 'none', reason: 'no_suggestion' }
  }
  if (args.suggestion.isEstimate && !args.intent.confirmedEstimate) {
    return { ...base, action: 'need_confirmation', reason: 'estimate' }
  }
  return {
    action: 'fill_draft',
    reason: 'filled',
    draftPrice: price,
    listingPriceWritten: false,
    published: false,
    calledMarketplaceWrite: false,
    persistSuggestionDraft: true,
  }
}
