import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { billingTenant, organization } from "@workspace/db"

/**
 * 与运营侧共绩缺省商户约定一致；tenant.merchant_id 无 DB FK。
 *
 * 这是「尚未归因到任何推广商户」时的兜底归属 —— 平台自营。
 * `attributePromoSignup()` 在推广归因落地后会把它改写成真实的推广商户。
 */
export const DEFAULT_MERCHANT_ID = "merchant-gongji"

/**
 * 确保计费租户存在（延迟绑定：不创建 customer）。
 *
 * gpus 自助注册约定 1:1：tenant.id === organization.id；
 * customer_id 在实名审核通过后再写入。
 */
export async function ensureBillingTenant(
  db: PostgresJsDatabase<Record<string, never>> | any,
  tenantId: string,
  options?: { name?: string; organizationId?: string; merchantId?: string | null },
): Promise<void> {
  const [existing] = await db
    .select({ id: billingTenant.id })
    .from(billingTenant)
    .where(eq(billingTenant.id, tenantId))
    .limit(1)

  if (existing) return

  let displayName = options?.name?.trim()
  if (!displayName) {
    const orgId = options?.organizationId ?? tenantId
    const [org] = await db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1)
    displayName = org?.name?.trim() || tenantId
  }

  const platformTenantId = options?.organizationId ?? tenantId

  // `??` 而不是 `!== undefined`：调用方（gpus 注册、身份认证）会显式传
  // `merchantId: null` 表达「暂未归因」，但 `tenant.merchant_id` 是 NOT NULL，
  // 写 null 会让 INSERT 直接失败 —— 新用户建租户整条链路报错（P1-21）。
  // 未归因统一落平台自营商户，待 promo 归因后再改写为真实商户。
  const merchantId = options?.merchantId ?? DEFAULT_MERCHANT_ID

  try {
    await db.insert(billingTenant).values({
      id: tenantId,
      customerId: null,
      name: displayName,
      platformTenantId,
      merchantId: merchantId,
      isDefault: true,
      status: "active",
      balance: "0",
      type: "external",
    })
  } catch (error) {
    const [again] = await db
      .select({ id: billingTenant.id })
      .from(billingTenant)
      .where(eq(billingTenant.id, tenantId))
      .limit(1)
    if (again) return
    throw error
  }
}
