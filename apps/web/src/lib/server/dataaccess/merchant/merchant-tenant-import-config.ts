import { GONGJI_PLATFORM_MERCHANT_ID } from '@/lib/server/dataaccess/merchant/merchant-resolve'

/** 除共绩（0）外，额外跳过租户导入的平台商户 ID，逗号分隔 */
const ENV_KEY = 'MERCHANT_TENANT_IMPORT_EXCLUDED_PLATFORM_MERCHANT_IDS'

function parseAdditionalExcludedIds(): number[] {
  const raw = process.env[ENV_KEY]?.trim()
  if (!raw) return []

  const ids: number[] = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const n = Number(trimmed)
    if (!Number.isFinite(n) || !Number.isInteger(n)) continue
    ids.push(n)
  }
  return ids
}

let cachedSet: Set<number> | null = null

/** 始终包含共绩（platform_merchant_id=0），并合并环境变量中的额外 ID */
export function getTenantImportExcludedPlatformMerchantIdSet(): Set<number> {
  if (cachedSet) return cachedSet

  const set = new Set<number>([GONGJI_PLATFORM_MERCHANT_ID])
  for (const id of parseAdditionalExcludedIds()) {
    set.add(id)
  }
  cachedSet = set
  return set
}

export function getTenantImportExcludedPlatformMerchantIds(): number[] {
  return [...getTenantImportExcludedPlatformMerchantIdSet()].sort((a, b) => a - b)
}

export function isPlatformMerchantTenantImportExcluded(platformMerchantId: number): boolean {
  return getTenantImportExcludedPlatformMerchantIdSet().has(platformMerchantId)
}

export function clearTenantImportExcludedCache(): void {
  cachedSet = null
}
