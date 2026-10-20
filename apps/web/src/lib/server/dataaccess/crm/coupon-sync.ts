import {
  parsePlatformDateTime,
  platformBillingValueToMoneyString,
  type ApiQueryTimes,
} from '@/lib/crm/tenant-billing-import-utils'
import { db } from '@/lib/db'
import { crmLog } from '@/lib/server/dataaccess/crm/logger'
import {
  fetchPlatformDiscountRelations,
  type PlatformDiscountRelationRecord,
} from '@/lib/server/integrations/suanli-billing-api'
import type { TenantBillingImportCommitSectionResult } from '@/lib/types/tenant-billing-import'
import { getTenantMerchantId } from '@/lib/server/dataaccess/merchant/merchant-resolve'
import { coupon, discountTemplate } from '@workspace/db/schema'
import { eq, inArray } from 'drizzle-orm'

function newId(): string {
  return crypto.randomUUID()
}

function emptySection(): TenantBillingImportCommitSectionResult {
  return { created: 0, updated: 0, upserted: 0, errors: [] }
}

async function loadTemplateIdMap(
  platformTemplateIds: number[],
): Promise<Map<number, string>> {
  const unique = [...new Set(platformTemplateIds.filter((id) => Number.isFinite(id)))]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({
      id: discountTemplate.id,
      platformTemplateId: discountTemplate.platformTemplateId,
    })
    .from(discountTemplate)
    .where(inArray(discountTemplate.platformTemplateId, unique))
  return new Map(rows.map((r) => [r.platformTemplateId, r.id]))
}

export function buildCouponPayload(
  record: PlatformDiscountRelationRecord,
  input: { tenantId: string; merchantId: string; templateId: string | null },
) {
  const issuedAt = parsePlatformDateTime(record.create_time) ?? new Date()
  const expiredAt =
    parsePlatformDateTime(record.end_date) ??
    new Date(issuedAt.getTime() + 365 * 24 * 60 * 60 * 1000)

  return {
    platformRelationId: record.id,
    tenantId: input.tenantId,
    merchantId: input.merchantId,
    projectId: null as string | null,
    templateId: input.templateId,
    platformTemplateId: Number.isFinite(record.template_id) ? record.template_id : null,
    code: `DR-${record.id}`,
    name: record.template_title || `算力券 ${record.id}`,
    type: 'cash' as const,
    value: platformBillingValueToMoneyString(record.count),
    surplusAmount: platformBillingValueToMoneyString(record.surplus_count),
    minAmount: null as string | null,
    status: record.status || 'Unknown',
    remark: record.remark ?? null,
    validityDay: record.validity_day ?? record.template_validity_day ?? null,
    issuedAt,
    expiredAt,
    usedAt: null as Date | null,
    platformUpdatedAt: record.last_update_time
      ? parsePlatformDateTime(record.last_update_time)
      : null,
    adminNickname: record.admin_nickname ?? null,
    adminPhone: record.admin_phone ?? null,
    syncedAt: new Date(),
  }
}

export async function syncCouponsForTenant(input: {
  tenantId: string
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<TenantBillingImportCommitSectionResult> {
  const result = emptySection()

  let records: PlatformDiscountRelationRecord[] = []
  try {
    records = await fetchPlatformDiscountRelations({
      platformTenantId: input.platformTenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      traceId: input.traceId,
      queryTimes: input.queryTimes,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '算力券列表拉取失败'
    result.errors.push({ key: 'coupons', message })
    return result
  }

  const templateMap = await loadTemplateIdMap(records.map((r) => r.template_id))
  const merchantId = await getTenantMerchantId(input.tenantId)

  crmLog('coupon-sync', 'upsert', {
    traceId: input.traceId,
    tenantId: input.tenantId,
    count: records.length,
  })

  for (const record of records) {
    try {
      const payload = buildCouponPayload(record, {
        tenantId: input.tenantId,
        merchantId,
        templateId: templateMap.get(record.template_id) ?? null,
      })

      const existing = await db.query.coupon.findFirst({
        where: eq(coupon.platformRelationId, record.id),
        columns: { id: true },
      })

      if (existing) {
        await db.update(coupon).set(payload).where(eq(coupon.id, existing.id))
        result.updated += 1
      } else {
        await db.insert(coupon).values({ id: newId(), ...payload })
        result.created += 1
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '算力券写入失败'
      result.errors.push({ key: String(record.id), message })
    }
  }

  return result
}
