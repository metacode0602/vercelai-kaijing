import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applySuggestedRetailToListingDraft } from './listing-price-fill'

const suggestion = {
  suggestedRetail: 199.5,
  suggestedFreeShipping: 210,
  isEstimate: false,
  currency: 'LKR',
}

describe('listing fill suggested price', () => {
  it('页面加载或未点击时不改本地草稿价，更不写刊登价或发布', () => {
    const result = applySuggestedRetailToListingDraft({
      currentDraftPrice: 12.5,
      suggestion,
      intent: { userClickedFill: false },
    })
    assert.equal(result.action, 'none')
    assert.equal(result.reason, 'not_clicked')
    assert.equal(result.draftPrice, 12.5)
    assert.equal(result.listingPriceWritten, false)
    assert.equal(result.published, false)
    assert.equal(result.calledMarketplaceWrite, false)
    assert.equal(result.persistSuggestionDraft, false)
  })

  it('用户点击一次后只改本地草稿字段，不发布、不调用平台写接口、不直接写 listings.price_amount', () => {
    const result = applySuggestedRetailToListingDraft({
      currentDraftPrice: 12.5,
      suggestion,
      intent: { userClickedFill: true },
    })
    assert.equal(result.action, 'fill_draft')
    assert.equal(result.draftPrice, 199.5)
    assert.equal(result.listingPriceWritten, false)
    assert.equal(result.published, false)
    assert.equal(result.calledMarketplaceWrite, false)
    assert.equal(result.persistSuggestionDraft, true)
  })

  it('估算（缺项）必须额外确认后才能填入', () => {
    const estimate = { ...suggestion, isEstimate: true }
    const blocked = applySuggestedRetailToListingDraft({
      currentDraftPrice: 12.5,
      suggestion: estimate,
      intent: { userClickedFill: true, confirmedEstimate: false },
    })
    assert.equal(blocked.action, 'need_confirmation')
    assert.equal(blocked.reason, 'estimate')
    assert.equal(blocked.draftPrice, 12.5)
    assert.equal(blocked.listingPriceWritten, false)
    assert.equal(blocked.published, false)

    const confirmed = applySuggestedRetailToListingDraft({
      currentDraftPrice: 12.5,
      suggestion: estimate,
      intent: { userClickedFill: true, confirmedEstimate: true },
    })
    assert.equal(confirmed.action, 'fill_draft')
    assert.equal(confirmed.draftPrice, 199.5)
    assert.equal(confirmed.published, false)
    assert.equal(confirmed.listingPriceWritten, false)
  })

  it('没有建议价时即使点击也不填入', () => {
    const result = applySuggestedRetailToListingDraft({
      currentDraftPrice: 12.5,
      suggestion: { ...suggestion, suggestedRetail: null },
      intent: { userClickedFill: true },
    })
    assert.equal(result.action, 'none')
    assert.equal(result.reason, 'no_suggestion')
    assert.equal(result.draftPrice, 12.5)
  })
})
