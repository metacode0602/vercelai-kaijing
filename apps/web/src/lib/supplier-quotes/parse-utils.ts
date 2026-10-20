/** 解析飞书报价表中的金额与百分比 */

export function parseOptionalQuoteMoney(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  const parsed = parseQuoteMoney(trimmed)
  if (!parsed || Number(parsed) <= 0) return null
  return parsed
}

export function parseQuoteMoney(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const cleaned = raw
    .replace(/^\ufeff/, '')
    .replace(/[¥$,\s]/g, '')
    .trim()
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return num.toFixed(4)
}

export function parseQuotePercent(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const cleaned = raw.replace(/%/g, '').trim()
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return num.toFixed(4)
}

export function computeGrossMarginPercent(cost: string, standard: string): string | null {
  const costNum = Number(cost)
  const standardNum = Number(standard)
  if (!Number.isFinite(costNum) || !Number.isFinite(standardNum) || costNum <= 0) {
    return null
  }
  return (((standardNum - costNum) / costNum) * 100).toFixed(4)
}

export function normalizeSupplierSourceName(name: string): string {
  return name.replace(/^\ufeff/, '').trim()
}

export function extractPrefixSegment(sourceName: string): string | null {
  const normalized = normalizeSupplierSourceName(sourceName)
  const match = normalized.match(/^([^\-—_\s]+)/)
  return match?.[1]?.trim() || null
}

export function normalizeForMatch(name: string): string {
  return normalizeSupplierSourceName(name).replace(/\s+/g, '').toLowerCase()
}
