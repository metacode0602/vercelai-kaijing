/**
 * 商户归属解析（设计 merchant-management-design.md v1.7）
 * - 平台 merchant_id 缺省视为 0 → 共绩科技
 * - 事实表写入以 tenant.merchant_id 为准
 */

import { db } from '@/lib/db'
import { merchant } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

export const GONGJI_PLATFORM_MERCHANT_ID = 0
/** 与 migration 0026 共绩 seed 一致；若库中已有其它 id 的共绩行，以查库为准 */
export const GONGJI_MERCHANT_ID_FALLBACK = 'merchant-gongji'

let cachedGongjiId: string | null = null

export async function getGongjiMerchantId(): Promise<string> {
  if (cachedGongjiId) return cachedGongjiId

  const byPlatform = await db.query.merchant.findFirst({
    where: eq(merchant.platformMerchantId, GONGJI_PLATFORM_MERCHANT_ID),
    columns: { id: true },
  })
  if (byPlatform?.id) {
    cachedGongjiId = byPlatform.id
    return byPlatform.id
  }

  const byDefault = await db.query.merchant.findFirst({
    where: eq(merchant.isDefault, true),
    columns: { id: true },
  })
  if (byDefault?.id) {
    cachedGongjiId = byDefault.id
    return byDefault.id
  }

  cachedGongjiId = GONGJI_MERCHANT_ID_FALLBACK
  return GONGJI_MERCHANT_ID_FALLBACK
}

/** 平台 merchant_id → 本地 merchant.id；缺省/未知映射为共绩 */
export async function resolveLocalMerchantId(
  platformMerchantId: number | null | undefined,
): Promise<string> {
  const pid =
    platformMerchantId == null || Number.isNaN(Number(platformMerchantId))
      ? GONGJI_PLATFORM_MERCHANT_ID
      : Number(platformMerchantId)

  if (pid === GONGJI_PLATFORM_MERCHANT_ID) {
    return getGongjiMerchantId()
  }

  const row = await db.query.merchant.findFirst({
    where: eq(merchant.platformMerchantId, pid),
    columns: { id: true },
  })
  if (!row?.id) {
    throw new Error(`merchant not found for platform_merchant_id=${pid}`)
  }
  return row.id
}

/** 读租户归属；若空则回落共绩（防御性，migration 后应非空） */
export async function getTenantMerchantId(tenantId: string): Promise<string> {
  const row = await db.query.billingTenant.findFirst({
    where: (t, { eq: e }) => e(t.id, tenantId),
    columns: { merchantId: true },
  })
  if (row?.merchantId) return row.merchantId
  return getGongjiMerchantId()
}

export function clearMerchantResolveCache() {
  cachedGongjiId = null
}
