import { matchGpuCardTypeByCode } from '@/lib/supplier/gpu-card-type-import-match'

export type GpuCardTypeRecord = {
  id: string
  name: string
  code: string
}

export type GpuCardTypeAliasRecord = {
  sourceName: string
  gpuCardTypeId: string
}

function normalizeProductName(name: string): string {
  return name.replace(/^\ufeff/, '').trim()
}

function normalizeCardName(name: string): string {
  return normalizeProductName(name).replace(/\s+/g, '').toLowerCase()
}

function cardNameVariants(name: string): string[] {
  const base = normalizeCardName(name)
  return [base, base.replace(/-/g, ''), base.replace(/\s/g, '-')]
}

export function matchGpuCardType(
  productName: string,
  cardTypes: GpuCardTypeRecord[],
  aliases: GpuCardTypeAliasRecord[] = [],
): { id: string | null; name: string | null; matchRule?: string } {
  const trimmed = normalizeProductName(productName)
  if (!trimmed) return { id: null, name: null }

  const alias = aliases.find((a) => a.sourceName === trimmed)
  if (alias) {
    const card = cardTypes.find((c) => c.id === alias.gpuCardTypeId)
    if (card) {
      return { id: card.id, name: card.name, matchRule: 'alias' }
    }
  }

  const byCode = matchGpuCardTypeByCode(trimmed, cardTypes)
  if (byCode) {
    return { id: byCode.id, name: byCode.name, matchRule: 'code' }
  }

  const variants = new Set(cardNameVariants(trimmed))

  for (const card of cardTypes) {
    const cardVariants = cardNameVariants(card.name)
    if (cardVariants.some((v) => variants.has(v))) {
      return { id: card.id, name: card.name, matchRule: 'fuzzy_name' }
    }
  }

  const exact = cardTypes.find((c) => c.name.trim() === trimmed)
  if (exact) return { id: exact.id, name: exact.name, matchRule: 'exact_name' }

  return { id: null, name: null }
}
