/**
 * 进货价同步逻辑 (Q15=B)
 *
 * 平台侧推送进货价更新到品牌站。
 * 品牌站接收端在独立仓库实现。
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { merchant, merchantBranding, merchantPurchasePrice } from "./schema"
import { eq, and, isNull } from "drizzle-orm"
import crypto from "node:crypto"

export interface PurchasePriceSyncPayload {
  merchantId: string
  prices: Array<{
    dataCenterId: string
    gpuCardTypeId: string
    productLine: string
    billingUnit: string
    purchasePrice: string
    currency: string
    effectiveFrom: string
    effectiveTo: string | null
    status: string
  }>
  syncedAt: string
}

/**
 * 生成 HMAC-SHA256 签名
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex")
}

/**
 * 推送进货价到单个品牌站
 */
async function pushPricesToBrandSite(
  db: PostgresJsDatabase<Record<string, never>> | any,
  merchantId: string,
  syncEndpoint: string,
  secret: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 查询该商户的活跃进货价
    const prices = await db
      .select({
        dataCenterId: merchantPurchasePrice.dataCenterId,
        gpuCardTypeId: merchantPurchasePrice.gpuCardTypeId,
        productLine: merchantPurchasePrice.productLine,
        billingUnit: merchantPurchasePrice.billingUnit,
        purchasePrice: merchantPurchasePrice.purchasePrice,
        currency: merchantPurchasePrice.currency,
        effectiveFrom: merchantPurchasePrice.effectiveFrom,
        effectiveTo: merchantPurchasePrice.effectiveTo,
        status: merchantPurchasePrice.status,
      })
      .from(merchantPurchasePrice)
      .where(
        and(
          eq(merchantPurchasePrice.merchantId, merchantId),
          eq(merchantPurchasePrice.status, "active"),
          isNull(merchantPurchasePrice.effectiveTo),
        ),
      )

    const payload: PurchasePriceSyncPayload = {
      merchantId,
      prices: prices.map((p: PurchasePriceSyncPayload["prices"][number]) => ({
        dataCenterId: p.dataCenterId,
        gpuCardTypeId: p.gpuCardTypeId,
        productLine: p.productLine,
        billingUnit: p.billingUnit,
        purchasePrice: p.purchasePrice,
        currency: p.currency,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
        status: p.status,
      })),
      syncedAt: new Date().toISOString(),
    }

    const payloadStr = JSON.stringify(payload)
    const signature = generateSignature(payloadStr, secret)

    const response = await fetch(syncEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform-Signature": signature,
      },
      body: payloadStr,
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      }
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { success: false, error: message }
  }
}

/**
 * 同步进货价到所有启用 OEM 的商户品牌站
 *
 * @param db - Database instance
 * @param dryRun - 仅检查不实际推送（用于测试）
 */
export async function syncPurchasePricesToBrandSites(
  db: PostgresJsDatabase<Record<string, never>> | any,
  dryRun = false,
): Promise<{
  total: number
  success: number
  failed: number
  results: Array<{ merchantId: string; success: boolean; error?: string }>
}> {
  // 查询所有启用 OEM 的活跃商户
  const merchants = await db
    .select({
      id: merchant.id,
      name: merchant.name,
    })
    .from(merchant)
    .where(and(eq(merchant.oemEnabled, true), eq(merchant.status, "active")))

  const results: Array<{ merchantId: string; success: boolean; error?: string }> = []

  for (const m of merchants) {
    // 查询品牌配置中的同步端点
    const branding = await db.query.merchantBranding.findFirst({
      where: eq(merchantBranding.merchantId, m.id),
      columns: {
        customDomain: true,
        themeConfig: true,
      },
    })

    if (!branding || !branding.customDomain) {
      results.push({
        merchantId: m.id,
        success: false,
        error: "No custom domain configured",
      })
      continue
    }

    // 从 themeConfig 中获取同步端点和密钥
    // TODO: 实际实施时应在 merchant_branding 表添加专门的 sync_endpoint 和 sync_secret 字段
    const themeConfig = (branding.themeConfig as Record<string, unknown>) ?? {}
    const syncEndpoint =
      (themeConfig.syncEndpoint as string) ??
      `https://${branding.customDomain}/api/sync/purchase-prices`
    const syncSecret = (themeConfig.syncSecret as string) ?? ""

    if (!syncSecret) {
      results.push({
        merchantId: m.id,
        success: false,
        error: "No sync secret configured",
      })
      continue
    }

    if (dryRun) {
      results.push({
        merchantId: m.id,
        success: true,
        error: "[DRY RUN] Would push to " + syncEndpoint,
      })
      continue
    }

    const result = await pushPricesToBrandSite(db, m.id, syncEndpoint, syncSecret)
    results.push({
      merchantId: m.id,
      ...result,
    })
  }

  const successCount = results.filter((r) => r.success).length
  const failedCount = results.length - successCount

  return {
    total: results.length,
    success: successCount,
    failed: failedCount,
    results,
  }
}

/**
 * 同步单个商户的进货价
 */
export async function syncPurchasePricesForMerchant(
  db: PostgresJsDatabase<Record<string, never>> | any,
  merchantId: string,
  dryRun = false,
): Promise<{ success: boolean; error?: string }> {
  const result = await syncPurchasePricesToBrandSites(db, dryRun)
  const merchantResult = result.results.find((r) => r.merchantId === merchantId)

  if (!merchantResult) {
    return { success: false, error: "Merchant not found or OEM not enabled" }
  }

  return {
    success: merchantResult.success,
    error: merchantResult.error,
  }
}
