/**
 * Pure FX rate validation (no DB). Used by dataaccess + unit tests.
 */

export type FxRateInput = {
  platform?: string
  marketplaceCode?: string
  baseCurrency: string
  quoteCurrency: string
  rate: number | string
  effectiveDate: string
  source?: string
  note?: string
}

export function normalizeCurrencyCode(code: string): string {
  return code.trim().toUpperCase()
}

export function parsePositiveRate(rate: number | string): number {
  const n = typeof rate === 'number' ? rate : Number(String(rate).trim())
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('汇率必须为正数')
  }
  return n
}

export function assertFxPair(baseCurrency: string, quoteCurrency: string) {
  const base = normalizeCurrencyCode(baseCurrency)
  const quote = normalizeCurrencyCode(quoteCurrency)
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) {
    throw new Error('币种须为 3 位 ISO 代码')
  }
  if (base === quote) {
    throw new Error('原币与折算币不能相同')
  }
  return { base, quote }
}

export function assertEffectiveDate(effectiveDate: string): string {
  const d = effectiveDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('生效日须为 YYYY-MM-DD')
  }
  return d
}

export function convertWithFx(amount: number, rate: number): { amount: number; rate: number; converted: number } {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('折算金额或汇率无效')
  }
  return { amount, rate, converted: Number((amount * rate).toFixed(8)) }
}

export function validateFxRateInput(input: FxRateInput) {
  const { base, quote } = assertFxPair(input.baseCurrency, input.quoteCurrency)
  const rate = parsePositiveRate(input.rate)
  const effectiveDate = assertEffectiveDate(input.effectiveDate)
  return {
    platform: (input.platform || '').trim() || null,
    marketplaceCode: (input.marketplaceCode || '').trim() || null,
    baseCurrency: base,
    quoteCurrency: quote,
    rate: String(rate),
    effectiveDate,
    source: (input.source || 'manual').trim() || 'manual',
    note: (input.note || '').trim(),
  }
}
