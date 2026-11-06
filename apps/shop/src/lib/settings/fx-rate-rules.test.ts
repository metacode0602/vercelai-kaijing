import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertFxPair,
  convertWithFx,
  parsePositiveRate,
  validateFxRateInput,
} from './fx-rate-rules'

describe('fx-rate-rules', () => {
  it('rejects non-positive rate', () => {
    assert.throws(() => parsePositiveRate(0), /正数/)
    assert.throws(() => parsePositiveRate(-1), /正数/)
  })

  it('rejects same base and quote', () => {
    assert.throws(() => assertFxPair('USD', 'usd'), /不能相同/)
  })

  it('normalizes and validates create input', () => {
    const v = validateFxRateInput({
      baseCurrency: 'usd',
      quoteCurrency: 'lkr',
      rate: '300.5',
      effectiveDate: '2026-10-31',
      platform: 'Daraz',
    })
    assert.equal(v.baseCurrency, 'USD')
    assert.equal(v.quoteCurrency, 'LKR')
    assert.equal(v.rate, '300.5')
  })

  it('convertWithFx keeps amount/rate/converted triple', () => {
    assert.deepEqual(convertWithFx(100, 300), { amount: 100, rate: 300, converted: 30000 })
  })
})
