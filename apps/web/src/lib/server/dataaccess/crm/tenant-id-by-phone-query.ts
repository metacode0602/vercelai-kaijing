import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'
import {
  fetchPlatformUsersByPhone,
  isPlatformUserRealNameVerified,
  SuanliUserOpenApiError,
} from '@/lib/server/integrations/suanli-user-api'
import {
  summarizeTenantIdByPhoneRows,
  type TenantIdByPhoneQueryResult,
  type TenantIdByPhoneQueryRow,
} from '@/lib/types/tenant-id-by-phone-query'
import { normalizePhone } from '@/lib/utils/phone'

function assertValidPhone(phone: string): string {
  const normalized = normalizePhone(phone.trim())
  if (normalized.length !== 11) {
    throw new Error('请输入 11 位手机号')
  }
  return normalized
}

function mapRecord(record: Awaited<ReturnType<typeof fetchPlatformUsersByPhone>>[number]): TenantIdByPhoneQueryRow {
  return {
    userId: record.id,
    phone: record.phone ?? '',
    nickname: record.nickname,
    tenantIds: record.tenant_ids ?? [],
    tenantNames: record.tenant_names ?? [],
    tenantTypes: record.tenant_types ?? [],
    realNameVerified: isPlatformUserRealNameVerified(record),
  }
}

export const tenantIdByPhoneQueryDataAccess = {
  async query(phone: string): Promise<TenantIdByPhoneQueryResult> {
    const normalizedPhone = assertValidPhone(phone)
    const traceId = crypto.randomUUID().slice(0, 8)

    crmLog('tenant-id-by-phone-query', 'query start', { traceId, phone: normalizedPhone })

    try {
      const records = await fetchPlatformUsersByPhone(normalizedPhone)
      const rows = records.map(mapRecord)
      const summary = summarizeTenantIdByPhoneRows(rows)

      crmLog('tenant-id-by-phone-query', 'query done', { traceId, ...summary })

      return {
        phone: normalizedPhone,
        rows,
        summary,
      }
    } catch (e) {
      crmError('tenant-id-by-phone-query', 'query failed', e, { traceId })
      if (e instanceof SuanliUserOpenApiError) {
        throw new Error(e.message)
      }
      throw e
    }
  },
}
