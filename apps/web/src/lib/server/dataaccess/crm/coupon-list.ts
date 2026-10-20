import {
  BILLING_PRODUCT_LINE_REGISTRY,
  formatCstDate,
} from '@/lib/crm/tenant-billing-import-utils'
import { db } from '@/lib/db'
import { projectsDataAccess } from '@/lib/server/dataaccess/crm/projects'
import { toNumber } from '@/lib/server/mappers/crm'
import { billingTenant, coupon, discountTemplate } from '@workspace/db/schema'
import { and, count, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'

export type CouponListItem = {
  id: string
  tenantId: string
  tenantName?: string
  projectId?: string
  platformRelationId?: number
  platformTemplateId?: number
  templateId?: string
  templateTitle?: string
  supportProductLines: string[]
  code: string
  name: string
  type: 'discount' | 'cash'
  value: number
  surplusAmount: number
  minAmount: number
  status: string
  remark?: string
  validityDay?: number
  issuedAt: string
  expiredAt: string
  usedAt?: string
  adminNickname?: string
}

export type CouponListFilters = {
  page?: number
  pageSize?: number
  /** YYYY-MM，按发放时间东八区自然月过滤 */
  month?: string
  status?: string
  /** CRM 产品线，如 maas_token */
  productLine?: string
}

export type CouponListResult = {
  items: CouponListItem[]
  total: number
  page: number
  pageSize: number
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function parseSupportLines(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function monthRangeCst(month: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  const [yRaw, mRaw] = month.split('-')
  const y = Number(yRaw)
  const m = Number(mRaw)
  if (!y || !m) return null
  const start = new Date(`${month}-01T00:00:00+08:00`)
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  const end = new Date(`${nextMonth}-01T00:00:00+08:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return { start, end }
}

function buildFilterConditions(filters: CouponListFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.status?.trim()) {
    conditions.push(eq(coupon.status, filters.status.trim()))
  }
  if (filters.month?.trim()) {
    const range = monthRangeCst(filters.month.trim())
    if (range) {
      conditions.push(gte(coupon.issuedAt, range.start))
      conditions.push(lt(coupon.issuedAt, range.end))
    }
  }
  if (filters.productLine?.trim()) {
    const pl = filters.productLine.trim()
    conditions.push(
      sql`position(${pl} in coalesce(${discountTemplate.supportProductLines}, '')) > 0`,
    )
  }
  return conditions
}

function mapRow(row: {
  id: string
  tenantId: string
  tenantName: string | null
  projectId: string | null
  platformRelationId: number | null
  platformTemplateId: number | null
  templateId: string | null
  templateTitle: string | null
  supportProductLines: string | null
  code: string | null
  name: string
  type: string
  value: string | number
  surplusAmount: string | number
  minAmount: string | number | null
  status: string
  remark: string | null
  validityDay: number | null
  issuedAt: Date
  expiredAt: Date
  usedAt: Date | null
  adminNickname: string | null
}): CouponListItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? undefined,
    projectId: row.projectId ?? undefined,
    platformRelationId: row.platformRelationId ?? undefined,
    platformTemplateId: row.platformTemplateId ?? undefined,
    templateId: row.templateId ?? undefined,
    templateTitle: row.templateTitle ?? undefined,
    supportProductLines: parseSupportLines(row.supportProductLines),
    code: row.code ?? '',
    name: row.name,
    type: (row.type as CouponListItem['type']) || 'cash',
    value: toNumber(row.value),
    surplusAmount: toNumber(row.surplusAmount),
    minAmount: toNumber(row.minAmount),
    status: row.status,
    remark: row.remark ?? undefined,
    validityDay: row.validityDay ?? undefined,
    issuedAt: toIso(row.issuedAt),
    expiredAt: toIso(row.expiredAt),
    usedAt: row.usedAt ? toIso(row.usedAt) : undefined,
    adminNickname: row.adminNickname ?? undefined,
  }
}

async function listCouponsForTenantIds(
  tenantIds: string[],
  filters: CouponListFilters = {},
): Promise<CouponListResult> {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
  if (tenantIds.length === 0) {
    return { items: [], total: 0, page, pageSize }
  }

  const conditions: SQL[] = [inArray(coupon.tenantId, tenantIds), ...buildFilterConditions(filters)]
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(coupon)
    .leftJoin(
      discountTemplate,
      eq(coupon.platformTemplateId, discountTemplate.platformTemplateId),
    )
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      id: coupon.id,
      tenantId: coupon.tenantId,
      tenantName: billingTenant.name,
      projectId: coupon.projectId,
      platformRelationId: coupon.platformRelationId,
      platformTemplateId: coupon.platformTemplateId,
      templateId: coupon.templateId,
      templateTitle: discountTemplate.title,
      supportProductLines: discountTemplate.supportProductLines,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      value: coupon.value,
      surplusAmount: coupon.surplusAmount,
      minAmount: coupon.minAmount,
      status: coupon.status,
      remark: coupon.remark,
      validityDay: coupon.validityDay,
      issuedAt: coupon.issuedAt,
      expiredAt: coupon.expiredAt,
      usedAt: coupon.usedAt,
      adminNickname: coupon.adminNickname,
    })
    .from(coupon)
    .leftJoin(
      discountTemplate,
      eq(coupon.platformTemplateId, discountTemplate.platformTemplateId),
    )
    .leftJoin(billingTenant, eq(coupon.tenantId, billingTenant.id))
    .where(where)
    .orderBy(desc(coupon.issuedAt))
    .limit(pageSize)
    .offset(offset)

  return {
    items: rows.map(mapRow),
    total,
    page,
    pageSize,
  }
}

export const couponListDataAccess = {
  async listByTenant(tenantId: string, filters?: CouponListFilters) {
    return listCouponsForTenantIds([tenantId], filters)
  },

  async listByCustomer(customerId: string, filters?: CouponListFilters) {
    const tenants = await db
      .select({ id: billingTenant.id })
      .from(billingTenant)
      .where(eq(billingTenant.customerId, customerId))
    return listCouponsForTenantIds(
      tenants.map((t) => t.id),
      filters,
    )
  },

  async listByProject(projectId: string, filters?: CouponListFilters) {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    return listCouponsForTenantIds(tenantIds, filters)
  },

  listFilterOptions() {
    return {
      productLines: BILLING_PRODUCT_LINE_REGISTRY,
      statuses: [
        { value: 'Open', label: '有效' },
        { value: 'Close', label: '已关闭' },
        { value: 'Exhausted', label: '已用尽' },
      ],
      currentMonth: formatCstDate(new Date()).slice(0, 7),
    }
  },
}
