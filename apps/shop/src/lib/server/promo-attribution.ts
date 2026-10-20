/**
 * Promo code attribution service (server-side)
 * 
 * Handles merchant promo attribution when user signs up via promo link
 */

import { db } from '@/lib/db'
import {
  merchantPromoLink,
  merchantPromoAttribution,
  merchant,
  billingTenant,
} from '@workspace/db/schema'
import { eq, and, isNull, sql } from 'drizzle-orm'
import { getPromoCodeFromCookieHeader } from '../promo-code'

function generateId(): string {
  return crypto.randomUUID()
}

interface PromoMerchantInfo {
  merchantId: string
  promoLinkId: string
  promoCode: string
}

/**
 * Resolve promo code to merchant info
 * Returns null if code is invalid, expired, or merchant not eligible
 */
export async function resolvePromoMerchant(promoCode: string): Promise<PromoMerchantInfo | null> {
  const promoLink = await db.query.merchantPromoLink.findFirst({
    where: and(
      eq(merchantPromoLink.promoCode, promoCode),
      eq(merchantPromoLink.status, 'active'),
    ),
    with: {
      merchant: {
        columns: {
          id: true,
          fundingMode: true,
          status: true,
        },
      },
    },
  })

  if (!promoLink) {
    console.warn(`[promo-attribution] Promo code not found: ${promoCode}`)
    return null
  }

  // 推广链接只对佣金商户开放：资金模式 commission 才是「平台向商户付现佣金」的商户。
  // 权威字段为 funding_mode，不再读历史布尔 promo_enabled（DEC-F9）。
  if (promoLink.merchant.fundingMode !== 'commission') {
    console.warn(
      `[promo-attribution] Merchant is not a commission merchant (fundingMode=${promoLink.merchant.fundingMode}): ${promoLink.merchantId}`,
    )
    return null
  }
  
  if (promoLink.merchant.status !== 'active') {
    console.warn(`[promo-attribution] Merchant not active: ${promoLink.merchantId}`)
    return null
  }

  const now = new Date()
  if (promoLink.validTo && new Date(promoLink.validTo) < now) {
    console.warn(`[promo-attribution] Promo link expired: ${promoCode}`)
    return null
  }

  return {
    merchantId: promoLink.merchant.id,
    promoLinkId: promoLink.id,
    promoCode,
  }
}

/**
 * Attribute tenant to merchant and record attribution event
 * Called after tenant organization is created
 * 
 * IDEMPOTENT: Will not re-attribute if tenant already attributed to this merchant or promo link
 */
export async function attributePromoSignup(params: {
  tenantOrgId: string
  userId: string
  userEmail?: string
  userName?: string
  userPhone?: string
  promoCode: string
  ipAddress?: string
  userAgent?: string
}): Promise<boolean> {
  try {
    const promoInfo = await resolvePromoMerchant(params.promoCode)
    if (!promoInfo) {
      console.log(`[promo-attribution] Promo code invalid or expired: ${params.promoCode}`)
      return false
    }

    // Find billing tenant by organization ID
    // ensureBillingTenant(db, orgId, ...) creates tenant with id === orgId
    const tenant = await db.query.billingTenant.findFirst({
      where: eq(billingTenant.id, params.tenantOrgId),
      columns: {
        id: true,
        merchantId: true,
      },
    })

    if (!tenant) {
      console.warn(`[promo-attribution] Billing tenant not found: ${params.tenantOrgId}`)
      return false
    }

    // IDEMPOTENT CHECK 1: Tenant already attributed to this merchant
    if (tenant.merchantId === promoInfo.merchantId) {
      console.log(`[promo-attribution] Tenant ${tenant.id} already attributed to merchant ${promoInfo.merchantId}`)
      return false
    }

    // IDEMPOTENT CHECK 2: Attribution record already exists for this tenant + promo link
    const existingAttribution = await db.query.merchantPromoAttribution.findFirst({
      where: and(
        eq(merchantPromoAttribution.tenantId, tenant.id),
        eq(merchantPromoAttribution.promoLinkId, promoInfo.promoLinkId),
        eq(merchantPromoAttribution.eventType, 'signup'),
      ),
      columns: { id: true },
    })

    if (existingAttribution) {
      console.log(`[promo-attribution] Attribution already exists for tenant ${tenant.id} + promo link ${promoInfo.promoLinkId}`)
      return false
    }

    // Set tenant.merchant_id to the promoting merchant (Q3=A)
    await db
      .update(billingTenant)
      .set({
        merchantId: promoInfo.merchantId,
        updatedAt: new Date(),
      })
      .where(eq(billingTenant.id, tenant.id))

    // Insert promo attribution record
    await db.insert(merchantPromoAttribution).values({
      id: generateId(),
      merchantId: promoInfo.merchantId,
      promoLinkId: promoInfo.promoLinkId,
      promoCode: promoInfo.promoCode,
      tenantId: tenant.id, // Use billing tenant id (FK constraint)
      userId: params.userId,
      eventType: 'signup',
      eventData: {
        name: params.userName,
        email: params.userEmail,
        phoneNumber: params.userPhone,
      },
      occurredAt: new Date(),
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    })

    // Increment signup count on promo link (only on first attribution)
    await db
      .update(merchantPromoLink)
      .set({
        signupCount: sql`${merchantPromoLink.signupCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(merchantPromoLink.id, promoInfo.promoLinkId))

    console.log(`[promo-attribution] Attributed tenant ${tenant.id} to merchant ${promoInfo.merchantId} via promo ${params.promoCode}`)
    return true
  } catch (error) {
    console.error('[promo-attribution] Failed to attribute promo signup:', error)
    return false
  }
}

/**
 * Get promo code from request cookie header
 */
export function getPromoCodeFromRequest(cookieHeader: string | null | undefined): string | null {
  return getPromoCodeFromCookieHeader(cookieHeader)
}
