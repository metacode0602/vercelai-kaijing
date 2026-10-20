import {
  extractPrefixSegment,
  normalizeForMatch,
  normalizeSupplierSourceName,
} from '@/lib/supplier-quotes/parse-utils'

export type SupplierMatchStatus = 'matched' | 'ambiguous' | 'unmatched'

export type SupplierMatchCandidate = {
  supplierId: string
  name: string
  shortName?: string | null
  matchRule: string
}

export type SupplierMatchResult = {
  status: SupplierMatchStatus
  supplierId: string | null
  supplierDisplayName?: string
  matchRule?: string
  candidates: SupplierMatchCandidate[]
}

export type SupplierRecord = {
  id: string
  name: string
  shortName: string | null
}

export type SupplierAliasRecord = {
  sourceName: string
  supplierId: string
}

function buildCandidate(
  supplier: SupplierRecord,
  matchRule: string,
): SupplierMatchResult['candidates'][number] {
  return {
    supplierId: supplier.id,
    name: supplier.name,
    shortName: supplier.shortName,
    matchRule,
  }
}

function uniqueCandidates(candidates: SupplierMatchResult['candidates']) {
  const seen = new Set<string>()
  return candidates.filter((c) => {
    if (seen.has(c.supplierId)) return false
    seen.add(c.supplierId)
    return true
  })
}

export function matchSupplierName(input: {
  sourceName: string
  suppliers: SupplierRecord[]
  aliases: SupplierAliasRecord[]
}): SupplierMatchResult {
  const sourceName = normalizeSupplierSourceName(input.sourceName)
  if (!sourceName) {
    return { status: 'unmatched', supplierId: null, candidates: [] }
  }

  const alias = input.aliases.find((a) => a.sourceName === sourceName)
  if (alias) {
    const supplier = input.suppliers.find((s) => s.id === alias.supplierId)
    if (supplier) {
      const candidate = buildCandidate(supplier, 'alias')
      return {
        status: 'matched',
        supplierId: supplier.id,
        supplierDisplayName: supplier.name,
        matchRule: 'alias',
        candidates: [candidate],
      }
    }
  }

  const normalizedSource = normalizeForMatch(sourceName)
  const prefixSegment = extractPrefixSegment(sourceName)
  const normalizedPrefix = prefixSegment ? normalizeForMatch(prefixSegment) : null

  const candidates: SupplierMatchResult['candidates'] = []

  for (const supplier of input.suppliers) {
    const normalizedName = normalizeForMatch(supplier.name)
    const normalizedShort = supplier.shortName ? normalizeForMatch(supplier.shortName) : null

    if (normalizedName === normalizedSource || normalizedShort === normalizedSource) {
      candidates.push(buildCandidate(supplier, 'exact_name'))
      continue
    }

    if (normalizedPrefix) {
      if (normalizedName === normalizedPrefix || normalizedShort === normalizedPrefix) {
        candidates.push(buildCandidate(supplier, 'prefix_segment'))
        continue
      }
    }

    if (
      normalizedName &&
      (normalizedSource.startsWith(normalizedName) &&
        (normalizedSource.length === normalizedName.length ||
          ['-', '—', '_', ' '].includes(sourceName.charAt(supplier.name.length))))
    ) {
      candidates.push(buildCandidate(supplier, 'name_prefix'))
    }
  }

  const unique = uniqueCandidates(candidates)
  if (unique.length === 1) {
    const picked = unique[0]!
    return {
      status: 'matched',
      supplierId: picked.supplierId,
      supplierDisplayName: picked.name,
      matchRule: picked.matchRule,
      candidates: unique,
    }
  }

  if (unique.length > 1) {
    return {
      status: 'ambiguous',
      supplierId: null,
      candidates: unique,
    }
  }

  return { status: 'unmatched', supplierId: null, candidates: [] }
}
