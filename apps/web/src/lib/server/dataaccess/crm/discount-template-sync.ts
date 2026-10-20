import {
  parsePlatformDateTime,
  parseSupportProductLines,
  platformBillingValueToMoneyString,
  supportProductLinesToStorage,
} from '@/lib/crm/tenant-billing-import-utils'
import { db } from '@/lib/db'
import { crmLog, crmWarn } from '@/lib/server/dataaccess/crm/logger'
import { fetchPlatformDiscountTemplates } from '@/lib/server/integrations/suanli-billing-api'
import { discountTemplate } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

export type DiscountTemplateSyncResult = {
  fetched: number
  created: number
  updated: number
  errors: string[]
}

function newId(): string {
  return crypto.randomUUID()
}

export async function syncDiscountTemplates(): Promise<DiscountTemplateSyncResult> {
  const traceId = crypto.randomUUID().slice(0, 8)
  const result: DiscountTemplateSyncResult = {
    fetched: 0,
    created: 0,
    updated: 0,
    errors: [],
  }

  crmLog('discount-template-sync', 'start', { traceId })

  let records: Awaited<ReturnType<typeof fetchPlatformDiscountTemplates>> = []
  try {
    records = await fetchPlatformDiscountTemplates({ traceId })
  } catch (e) {
    const message = e instanceof Error ? e.message : '算力券模板拉取失败'
    result.errors.push(message)
    crmWarn('discount-template-sync', 'fetch failed', { traceId, message })
    return result
  }

  result.fetched = records.length
  const syncedAt = new Date()

  for (const record of records) {
    try {
      const productLines = parseSupportProductLines(record.support_products)
      const payload = {
        platformTemplateId: record.id,
        title: record.title || `模板 ${record.id}`,
        supportProducts: record.support_products ?? null,
        supportProductLines: supportProductLinesToStorage(productLines),
        totalAmount:
          record.total != null ? platformBillingValueToMoneyString(record.total) : null,
        faceAmount: platformBillingValueToMoneyString(record.count),
        rule: record.rule ?? null,
        status: record.status || 'Unknown',
        validityDay: record.validity_day ?? null,
        startDate: record.start_date ? parsePlatformDateTime(record.start_date) : null,
        endDate: record.end_date ? parsePlatformDateTime(record.end_date) : null,
        remark: record.remark ?? null,
        mark: record.mark ?? null,
        platformCreatedAt: record.create_time
          ? parsePlatformDateTime(record.create_time)
          : null,
        platformUpdatedAt: record.last_update_time
          ? parsePlatformDateTime(record.last_update_time)
          : null,
        syncedAt,
      }

      const existing = await db.query.discountTemplate.findFirst({
        where: eq(discountTemplate.platformTemplateId, record.id),
        columns: { id: true },
      })

      if (existing) {
        await db
          .update(discountTemplate)
          .set(payload)
          .where(eq(discountTemplate.id, existing.id))
        result.updated += 1
      } else {
        await db.insert(discountTemplate).values({ id: newId(), ...payload })
        result.created += 1
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '模板写入失败'
      result.errors.push(`模板 ${record.id}: ${message}`)
    }
  }

  crmLog('discount-template-sync', 'done', { traceId, ...result })
  return result
}
