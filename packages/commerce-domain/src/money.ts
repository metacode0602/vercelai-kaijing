export type CurrencyMode = "single" | "mixed" | "empty"

export function uniqueCurrencies(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>()
  for (const value of values) {
    const currency = value?.trim().toUpperCase()
    if (currency) set.add(currency)
  }
  return [...set].sort()
}

export function currencyModeOf(currencies: Array<string | null | undefined>): {
  currencyMode: CurrencyMode
  currency: string | null
  currencies: string[]
} {
  const list = uniqueCurrencies(currencies)
  if (list.length === 0) return { currencyMode: "empty", currency: null, currencies: list }
  if (list.length === 1) return { currencyMode: "single", currency: list[0]!, currencies: list }
  return { currencyMode: "mixed", currency: null, currencies: list }
}

/** 混合币种禁止求和；只在 single 时返回合计。 */
export function sumMoneyByCurrency(
  rows: Array<{ currency?: string | null; amount?: number | string | null }>,
): {
  currencyMode: CurrencyMode
  currency: string | null
  currencies: string[]
  total: number | null
  byCurrency: Array<{ currency: string; total: number }>
} {
  const buckets = new Map<string, number>()
  for (const row of rows) {
    const currency = row.currency?.trim().toUpperCase()
    if (!currency) continue
    const amount = typeof row.amount === "number" ? row.amount : Number(row.amount)
    if (!Number.isFinite(amount)) continue
    buckets.set(currency, (buckets.get(currency) ?? 0) + amount)
  }
  const byCurrency = [...buckets.entries()].map(([currency, total]) => ({ currency, total }))
  const mode = currencyModeOf(byCurrency.map((item) => item.currency))
  return {
    ...mode,
    total: mode.currencyMode === "single" ? (byCurrency[0]?.total ?? 0) : null,
    byCurrency,
  }
}
