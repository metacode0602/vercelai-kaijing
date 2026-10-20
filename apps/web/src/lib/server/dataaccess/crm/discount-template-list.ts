import {
  BILLING_PRODUCT_LINE_REGISTRY,
  formatCstDate,
} from '@/lib/crm/tenant-billing-import-utils'
import { db } from '@/lib/db'
import { toNumber } from '@/lib/server/mappers/crm'
import { billingTenant, coupon, discountTemplate } from '@workspace/db/schema'
import { and, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm'

export type DiscountTemplateListItem = {
  id: string
  platformTemplateId: number
  title: string
  supportProductLines: string[]
  faceAmount: number
  totalAmount?: number
  status: string
  validityDay?: number
  remark?: string
  syncedAt: string
  /** 已同步的发放记录数 */
  issuedCount: number
  /** 发放面值合计（元） */
  issuedAmount: number
  /** 已使用金额合计（元）= value - surplus */
  usedAmount: number
}

export type DiscountTemplateDetail = DiscountTemplateListItem & {
  supportProducts?: string
  rule?: string
  mark?: string
  startDate?: string
  endDate?: string
  platformCreatedAt?: string
  platformUpdatedAt?: string
  createdAt: string
  updatedAt: string
}

export type DiscountTemplateListFilters = {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  productLine?: string
}

export type DiscountTemplateListResult = {
  items: DiscountTemplateListItem[]
  total: number
  page: number
  pageSize: number
}

export type DiscountTemplateIssuanceItem = {
  id: string
  tenantId: string
  tenantName?: string
  platformRelationId?: number
  code: string
  name: string
  value: number
  surplusAmount: number
  usedAmount: number
  status: string
  remark?: string
  issuedAt: string
  expiredAt: string
  adminNickname?: string
}

export type DiscountTemplateIssuanceFilters = {
  page?: number
  pageSize?: number
  month?: string
  status?: string
}

export type DiscountTemplateIssuanceResult = {
  items: DiscountTemplateIssuanceItem[]
  total: number
  page: number
  pageSize: number
  summary: {
    issuedCount: number
    issuedAmount: number
    usedAmount: number
  }
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

const couponAgg = {
  issuedCount: sql<number>`coalesce(count(${coupon.id}), 0)`.mapWith(Number),
  issuedAmount: sql<string>`coalesce(sum(${coupon.value}::numeric), 0)`,
  usedAmount: sql<string>`coalesce(sum((${coupon.value}::numeric - ${coupon.surplusAmount}::numeric)), 0)`,
}

function buildTemplateFilterConditions(filters: DiscountTemplateListFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.status?.trim()) {
    conditions.push(eq(discountTemplate.status, filters.status.trim()))
  }
  if (filters.productLine?.trim()) {
    const pl = filters.productLine.trim()
    conditions.push(
      sql`position(${pl} in coalesce(${discountTemplate.supportProductLines}, '')) > 0`,
    )
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim()
    const platformId = Number(q)
    const searchParts: SQL[] = [ilike(discountTemplate.title, `%${q}%`)]
    if (Number.isFinite(platformId) && String(platformId) === q) {
      searchParts.push(eq(discountTemplate.platformTemplateId, platformId))
    }
    conditions.push(or(...searchParts)!)
  }
  return conditions
}

function mapTemplateRow(row: {
  id: string
  platformTemplateId: number
  title: string
  supportProductLines: string | null
  faceAmount: string | number
  totalAmount: string | number | null
  status: string
  validityDay: number | null
  remark: string | null
  syncedAt: Date
  issuedCount: number
  issuedAmount: string | number
  usedAmount: string | number
}): DiscountTemplateListItem {
  return {
    id: row.id,
    platformTemplateId: row.platformTemplateId,
    title: row.title,
    supportProductLines: parseSupportLines(row.supportProductLines),
    faceAmount: toNumber(row.faceAmount),
    totalAmount: row.totalAmount != null ? toNumber(row.totalAmount) : undefined,
    status: row.status,
    validityDay: row.validityDay ?? undefined,
    remark: row.remark ?? undefined,
    syncedAt: toIso(row.syncedAt),
    issuedCount: Number(row.issuedCount ?? 0),
    issuedAmount: toNumber(row.issuedAmount),
    usedAmount: toNumber(row.usedAmount),
  }
}

export const discountTemplateListDataAccess = {
  async list(filters: DiscountTemplateListFilters = {}): Promise<DiscountTemplateListResult> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
    const conditions = buildTemplateFilterConditions(filters)
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(discountTemplate)
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select({
        id: discountTemplate.id,
        platformTemplateId: discountTemplate.platformTemplateId,
        title: discountTemplate.title,
        supportProductLines: discountTemplate.supportProductLines,
        faceAmount: discountTemplate.faceAmount,
        totalAmount: discountTemplate.totalAmount,
        status: discountTemplate.status,
        validityDay: discountTemplate.validityDay,
        remark: discountTemplate.remark,
        syncedAt: discountTemplate.syncedAt,
        issuedCount: couponAgg.issuedCount,
        issuedAmount: couponAgg.issuedAmount,
        usedAmount: couponAgg.usedAmount,
      })
      .from(discountTemplate)
      .leftJoin(
        coupon,
        eq(coupon.platformTemplateId, discountTemplate.platformTemplateId),
      )
      .where(where)
      .groupBy(discountTemplate.id)
      .orderBy(desc(discountTemplate.syncedAt), desc(discountTemplate.platformTemplateId))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map(mapTemplateRow),
      total,
      page,
      pageSize,
    }
  },

  async getById(id: string): Promise<DiscountTemplateDetail | null> {
    const [row] = await db
      .select({
        id: discountTemplate.id,
        platformTemplateId: discountTemplate.platformTemplateId,
        title: discountTemplate.title,
        supportProducts: discountTemplate.supportProducts,
        supportProductLines: discountTemplate.supportProductLines,
        faceAmount: discountTemplate.faceAmount,
        totalAmount: discountTemplate.totalAmount,
        rule: discountTemplate.rule,
        status: discountTemplate.status,
        validityDay: discountTemplate.validityDay,
        startDate: discountTemplate.startDate,
        endDate: discountTemplate.endDate,
        remark: discountTemplate.remark,
        mark: discountTemplate.mark,
        platformCreatedAt: discountTemplate.platformCreatedAt,
        platformUpdatedAt: discountTemplate.platformUpdatedAt,
        syncedAt: discountTemplate.syncedAt,
        createdAt: discountTemplate.createdAt,
        updatedAt: discountTemplate.updatedAt,
        issuedCount: couponAgg.issuedCount,
        issuedAmount: couponAgg.issuedAmount,
        usedAmount: couponAgg.usedAmount,
      })
      .from(discountTemplate)
      .leftJoin(
        coupon,
        eq(coupon.platformTemplateId, discountTemplate.platformTemplateId),
      )
      .where(eq(discountTemplate.id, id))
      .groupBy(discountTemplate.id)
      .limit(1)

    if (!row) return null

    return {
      ...mapTemplateRow(row),
      supportProducts: row.supportProducts ?? undefined,
      rule: row.rule ?? undefined,
      mark: row.mark ?? undefined,
      startDate: row.startDate ? toIso(row.startDate) : undefined,
      endDate: row.endDate ? toIso(row.endDate) : undefined,
      platformCreatedAt: row.platformCreatedAt ? toIso(row.platformCreatedAt) : undefined,
      platformUpdatedAt: row.platformUpdatedAt ? toIso(row.platformUpdatedAt) : undefined,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }
  },

  async listIssuances(
    templateId: string,
    filters: DiscountTemplateIssuanceFilters = {},
  ): Promise<DiscountTemplateIssuanceResult | null> {
    const template = await db.query.discountTemplate.findFirst({
      where: eq(discountTemplate.id, templateId),
      columns: { id: true, platformTemplateId: true },
    })
    if (!template) return null

    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))

    const conditions: SQL[] = [
      eq(coupon.platformTemplateId, template.platformTemplateId),
    ]
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
    const where = and(...conditions)

    const [summaryRow] = await db
      .select({
        issuedCount: couponAgg.issuedCount,
        issuedAmount: couponAgg.issuedAmount,
        usedAmount: couponAgg.usedAmount,
      })
      .from(coupon)
      .where(where)

    const issuedCount = Number(summaryRow?.issuedCount ?? 0)
    const issuedAmount = toNumber(summaryRow?.issuedAmount)
    const usedAmount = toNumber(summaryRow?.usedAmount)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select({
        id: coupon.id,
        tenantId: coupon.tenantId,
        tenantName: billingTenant.name,
        platformRelationId: coupon.platformRelationId,
        code: coupon.code,
        name: coupon.name,
        value: coupon.value,
        surplusAmount: coupon.surplusAmount,
        status: coupon.status,
        remark: coupon.remark,
        issuedAt: coupon.issuedAt,
        expiredAt: coupon.expiredAt,
        adminNickname: coupon.adminNickname,
      })
      .from(coupon)
      .leftJoin(billingTenant, eq(coupon.tenantId, billingTenant.id))
      .where(where)
      .orderBy(desc(coupon.issuedAt))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map((row) => {
        const value = toNumber(row.value)
        const surplusAmount = toNumber(row.surplusAmount)
        return {
          id: row.id,
          tenantId: row.tenantId,
          tenantName: row.tenantName ?? undefined,
          platformRelationId: row.platformRelationId ?? undefined,
          code: row.code ?? '',
          name: row.name,
          value,
          surplusAmount,
          usedAmount: Math.max(0, value - surplusAmount),
          status: row.status,
          remark: row.remark ?? undefined,
          issuedAt: toIso(row.issuedAt),
          expiredAt: toIso(row.expiredAt),
          adminNickname: row.adminNickname ?? undefined,
        }
      }),
      total: issuedCount,
      page,
      pageSize,
      summary: {
        issuedCount,
        issuedAmount,
        usedAmount,
      },
    }
  },

  listFilterOptions() {
    return {
      productLines: BILLING_PRODUCT_LINE_REGISTRY,
      statuses: [
        { value: 'Open', label: '有效' },
        { value: 'Close', label: '已关闭' },
      ],
      couponStatuses: [
        { value: 'Open', label: '有效' },
        { value: 'Close', label: '已关闭' },
        { value: 'Exhausted', label: '已用尽' },
      ],
      currentMonth: formatCstDate(new Date()).slice(0, 7),
    }
  },
}
