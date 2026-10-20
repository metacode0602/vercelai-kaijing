import { db } from '@/lib/db'
import {
  parseWorkbookBuffer,
  pickColumn,
  parseMoneyCell,
  type SheetRow,
} from '@/lib/server/dataaccess/finance/excel-parser'
import type {
  BillingTenantDetail,
  BillingTenantInternalSettingInput,
  BillingTenantListItem,
  BillingTenantListResult,
  BillingTenantUpdateInput,
  TenantImportResult,
} from '@/lib/types/billing-tenant'
import {
  billingTenant,
  customer,
  merchant,
  tenantContact,
} from '@workspace/db/schema'
import {
  buildTenantIdFilter,
  filterTenantGetById,
  loadVisibleTenantIds,
  type CrmDataScope,
} from '@/lib/server/auth/crm-data-scope'
import {
  legacyContactToInput,
  newContactId,
  normalizeContactInput,
} from '@/lib/server/dataaccess/shared/entity-contact-shared'
import { getGongjiMerchantId } from '@/lib/server/dataaccess/merchant/merchant-resolve'
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'

export type {
  BillingTenantDetail,
  BillingTenantInternalSettingInput,
  BillingTenantListItem,
  BillingTenantListResult,
  BillingTenantUpdateInput,
  TenantImportResult,
}

function newId() {
  return crypto.randomUUID()
}

function toNumber(val: string | null | undefined): number {
  if (val == null || val === '') return 0
  const n = Number(val)
  return Number.isNaN(n) ? 0 : n
}

function toIso(d: Date | null | undefined): string | undefined {
  if (!d) return undefined
  return d.toISOString()
}

function parseOverdueAt(raw: string | null): Date | null {
  if (!raw?.trim()) return null
  const s = raw.trim()
  const d = new Date(s.replace(/\//g, '-'))
  if (!Number.isNaN(d.getTime())) return d
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(s)
  if (!m) return null
  const [, y, mo, da, h = '0', mi = '0', se = '0'] = m
  const parsed = new Date(
    Number(y),
    Number(mo) - 1,
    Number(da),
    Number(h),
    Number(mi),
    Number(se),
  )
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function mapListRow(
  t: typeof billingTenant.$inferSelect,
  c: typeof customer.$inferSelect,
  m: { id: string; name: string },
  tenantPrimary?: { name: string; phone: string },
): BillingTenantListItem {
  return {
    id: t.id,
    customerId: t.customerId ?? '',
    platformTenantId: t.platformTenantId ?? undefined,
    name: t.name,
    phone: t.phone ?? undefined,
    status: t.status,
    type: t.type as BillingTenantListItem['type'],
    merchantId: m.id,
    merchantName: m.name,
    internalEffectiveFrom: t.internalEffectiveFrom ?? undefined,
    internalEffectiveTo: t.internalEffectiveTo ?? undefined,
    balance: toNumber(t.balance),
    overdueAt: toIso(t.overdue_at ?? undefined),
    creditLimit: t.credit_limit != null ? toNumber(t.credit_limit) : undefined,
    isDefault: t.isDefault,
    createdAt: t.createdAt.toISOString(),
    platformRegisteredAt: toIso(t.platformRegisteredAt ?? undefined),
    customerName: c.name,
    contactPerson: tenantPrimary?.name ?? c.contactPerson ?? undefined,
    contactPhone: tenantPrimary?.phone ?? c.contactPhone ?? undefined,
  }
}

/** 列表页所需字段，避免 SELECT tenant/customer/merchant 整行 */
function mapListQueryRow(row: {
  id: string
  customerId: string | null
  platformTenantId: string | null
  name: string
  phone: string | null
  status: string
  type: string
  merchantId: string
  merchantName: string
  internalEffectiveFrom: string | null
  internalEffectiveTo: string | null
  balance: string
  overdueAt: Date | null
  creditLimit: string | null
  isDefault: boolean
  createdAt: Date
  platformRegisteredAt: Date | null
  customerName: string
  customerContactPerson: string | null
  customerContactPhone: string | null
  primaryContactName: string | null
  primaryContactPhone: string | null
}): BillingTenantListItem {
  return {
    id: row.id,
    customerId: row.customerId ?? '',
    platformTenantId: row.platformTenantId ?? undefined,
    name: row.name,
    phone: row.phone ?? undefined,
    status: row.status,
    type: row.type as BillingTenantListItem['type'],
    merchantId: row.merchantId,
    merchantName: row.merchantName,
    internalEffectiveFrom: row.internalEffectiveFrom ?? undefined,
    internalEffectiveTo: row.internalEffectiveTo ?? undefined,
    balance: toNumber(row.balance),
    overdueAt: toIso(row.overdueAt ?? undefined),
    creditLimit: row.creditLimit != null ? toNumber(row.creditLimit) : undefined,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    platformRegisteredAt: toIso(row.platformRegisteredAt ?? undefined),
    customerName: row.customerName,
    contactPerson: row.primaryContactName ?? row.customerContactPerson ?? undefined,
    contactPhone:
      row.primaryContactName != null
        ? (row.primaryContactPhone ?? '')
        : (row.customerContactPhone ?? undefined),
  }
}

const IMPORT_PLATFORM_ID = ['租户ID', 'tenant_id', 'platform_tenant_id']
const IMPORT_PHONE = ['租户手机号']
const IMPORT_COMPANY = ['租户公司名']
const IMPORT_CONTACT = ['租户联系人']
const IMPORT_CONTACT_PHONE = ['租户联系人手机号']
const IMPORT_BALANCE = ['余额(元)', '余额']
const IMPORT_OVERDUE = ['欠费时间']
const IMPORT_CREDIT = ['授信额度(元)', '授信额度']

type ParsedImportRow = {
  rowNo: number
  platformTenantId: string
  phone: string | null
  companyName: string | null
  contactPerson: string | null
  contactPhone: string | null
  balance: string
  overdueAt: Date | null
  creditLimit: string | null
}

function parseImportRow(row: SheetRow, rowNo: number): ParsedImportRow | { error: string } {
  const platformTenantId = pickColumn(row, IMPORT_PLATFORM_ID)
  if (!platformTenantId) {
    return { error: '缺少租户ID' }
  }
  const balanceRaw = pickColumn(row, IMPORT_BALANCE)
  const creditRaw = pickColumn(row, IMPORT_CREDIT)
  const balance = parseMoneyCell(balanceRaw)
  if (balanceRaw && Number.isNaN(Number(balance.replace(/,/g, '')))) {
    return { error: '余额格式无效' }
  }
  let creditLimit: string | null = null
  if (creditRaw) {
    creditLimit = parseMoneyCell(creditRaw)
    if (Number.isNaN(Number(creditLimit))) {
      return { error: '授信额度格式无效' }
    }
  }
  return {
    rowNo,
    platformTenantId,
    phone: pickColumn(row, IMPORT_PHONE),
    companyName: pickColumn(row, IMPORT_COMPANY),
    contactPerson: pickColumn(row, IMPORT_CONTACT),
    contactPhone: pickColumn(row, IMPORT_CONTACT_PHONE),
    balance,
    overdueAt: parseOverdueAt(pickColumn(row, IMPORT_OVERDUE)),
    creditLimit,
  }
}

function tenantDisplayName(phone: string | null, platformTenantId: string): string {
  if (phone?.trim()) return phone.trim()
  return `租户-${platformTenantId}`
}

function customerDisplayName(
  companyName: string | null,
  phone: string | null,
  platformTenantId: string,
): string {
  if (companyName?.trim()) return companyName.trim()
  if (phone?.trim()) return phone.trim()
  return `租户-${platformTenantId}`
}

export const billingTenantsDataAccess = {
  async list(
    filters: {
      search?: string
      type?: BillingTenantListItem['type']
      merchantId?: string
      page?: number
      pageSize?: number
    } = {},
    scope?: CrmDataScope,
  ): Promise<BillingTenantListResult> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
    const offset = (page - 1) * pageSize
    const q = filters.search?.trim()
    const type = filters.type
    const merchantId = filters.merchantId?.trim()

    const visibleTenantIds = scope ? await loadVisibleTenantIds(scope) : null
    if (visibleTenantIds && visibleTenantIds.length === 0) {
      return { items: [], total: 0, page, pageSize }
    }

    const conditions: SQL[] = []
    if (q) {
      conditions.push(
        or(
          ilike(billingTenant.platformTenantId, `%${q}%`),
          ilike(billingTenant.name, `%${q}%`),
          ilike(billingTenant.phone, `%${q}%`),
          ilike(customer.name, `%${q}%`),
          ilike(customer.contactPhone, `%${q}%`),
        )!,
      )
    }
    const scopeFilter = buildTenantIdFilter(scope ?? { type: 'all' }, visibleTenantIds)
    if (scopeFilter) conditions.push(scopeFilter)
    if (type) conditions.push(eq(billingTenant.type, type))
    if (merchantId) conditions.push(eq(billingTenant.merchantId, merchantId))

    const where = conditions.length ? and(...conditions) : undefined

    // 单次查询：只取列表字段，并通过 left join 主联系人，避免二次 IN 查询与整行 SELECT *
    const [totalRow, rows] = await Promise.all([
      db
        .select({ value: count().as('total') })
        .from(billingTenant)
        .innerJoin(customer, eq(customer.id, billingTenant.customerId))
        .innerJoin(merchant, eq(merchant.id, billingTenant.merchantId))
        .where(where),
      db
        .select({
          id: billingTenant.id,
          customerId: billingTenant.customerId,
          platformTenantId: billingTenant.platformTenantId,
          name: billingTenant.name,
          phone: billingTenant.phone,
          status: billingTenant.status,
          type: billingTenant.type,
          merchantId: merchant.id,
          merchantName: merchant.name,
          internalEffectiveFrom: billingTenant.internalEffectiveFrom,
          internalEffectiveTo: billingTenant.internalEffectiveTo,
          balance: billingTenant.balance,
          overdueAt: billingTenant.overdue_at,
          creditLimit: billingTenant.credit_limit,
          isDefault: billingTenant.isDefault,
          createdAt: billingTenant.createdAt,
          platformRegisteredAt: billingTenant.platformRegisteredAt,
          customerName: customer.name,
          customerContactPerson: customer.contactPerson,
          customerContactPhone: customer.contactPhone,
          primaryContactName: tenantContact.name,
          primaryContactPhone: tenantContact.phone,
        })
        .from(billingTenant)
        .innerJoin(customer, eq(customer.id, billingTenant.customerId))
        .innerJoin(merchant, eq(merchant.id, billingTenant.merchantId))
        .leftJoin(
          tenantContact,
          and(eq(tenantContact.tenantId, billingTenant.id), eq(tenantContact.isPrimary, true)),
        )
        .where(where)
        .orderBy(desc(billingTenant.createdAt))
        .limit(pageSize)
        .offset(offset),
    ])

    return {
      items: rows.map(mapListQueryRow),
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
    }
  },

  async getById(id: string, scope?: CrmDataScope): Promise<BillingTenantDetail | null> {
    return filterTenantGetById(scope ?? { type: 'all' }, id, async () => {
      const row = await db
        .select({ tenant: billingTenant, cust: customer, merch: merchant })
        .from(billingTenant)
        .innerJoin(customer, eq(customer.id, billingTenant.customerId))
        .innerJoin(merchant, eq(merchant.id, billingTenant.merchantId))
        .where(eq(billingTenant.id, id))
        .limit(1)

      const hit = row[0]
      if (!hit) return null

      const base = mapListRow(hit.tenant, hit.cust, { id: hit.merch.id, name: hit.merch.name })
      return {
        ...base,
        customerType: hit.cust.type as 'B' | 'C',
        customerStatus: hit.cust.status,
        customerContactPerson: hit.cust.contactPerson ?? undefined,
        customerContactPhone: hit.cust.contactPhone ?? undefined,
        customerContactEmail: hit.cust.contactEmail ?? undefined,
        contactEmail: hit.cust.contactEmail ?? undefined,
        updatedAt: hit.tenant.updatedAt.toISOString(),
      }
    })
  },

  async update(id: string, input: BillingTenantUpdateInput): Promise<BillingTenantDetail> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('计费租户不存在')

    await db.transaction(async (tx) => {
      await tx
        .update(billingTenant)
        .set({
          name: input.tenant.name.trim(),
          phone: input.tenant.phone?.trim() || null,
          status: input.tenant.status,
          balance: input.tenant.balance.toFixed(4),
          overdue_at: input.tenant.overdueAt ? new Date(input.tenant.overdueAt) : null,
          credit_limit:
            input.tenant.creditLimit != null && input.tenant.creditLimit !== undefined
              ? input.tenant.creditLimit.toFixed(4)
              : null,
          isDefault: input.tenant.isDefault,
        })
        .where(eq(billingTenant.id, id))

      await tx
        .update(customer)
        .set({
          type: input.customer.type,
          status: input.customer.status,
        })
        .where(eq(customer.id, existing.customerId))

      if (input.tenant.isDefault && !existing.isDefault) {
        await tx
          .update(billingTenant)
          .set({ isDefault: false })
          .where(
            and(
              eq(billingTenant.customerId, existing.customerId),
              sql`${billingTenant.id} <> ${id}`,
            ),
          )
      }
    })

    const updated = await this.getById(id)
    if (!updated) throw new Error('更新失败')
    return updated
  },

  async updateInternalSetting(
    id: string,
    input: BillingTenantInternalSettingInput,
  ): Promise<BillingTenantDetail> {
    const existing = await this.getById(id)
    if (!existing) throw new Error('计费租户不存在')

    await db
      .update(billingTenant)
      .set({
        type: input.type,
        internalEffectiveFrom:
          input.type === 'internal' ? input.internalEffectiveFrom?.trim() || null : null,
        internalEffectiveTo:
          input.type === 'internal' ? input.internalEffectiveTo?.trim() || null : null,
      })
      .where(eq(billingTenant.id, id))

    const updated = await this.getById(id)
    if (!updated) throw new Error('更新失败')
    return updated
  },

  async importFromExcel(buffer: Buffer, fileName: string): Promise<TenantImportResult> {
    const sheetRows = parseWorkbookBuffer(buffer, fileName)
    const deduped = new Map<string, ParsedImportRow>()
    const errors: TenantImportResult['errors'] = []

    sheetRows.forEach((row, idx) => {
      const rowNo = idx + 2
      const parsed = parseImportRow(row, rowNo)
      if ('error' in parsed) {
        errors.push({
          row: rowNo,
          platformTenantId: pickColumn(row, IMPORT_PLATFORM_ID) ?? undefined,
          message: parsed.error,
        })
        return
      }
      deduped.set(parsed.platformTenantId, parsed)
    })

    let created = 0
    let updated = 0
    const gongjiMerchantId = await getGongjiMerchantId()

    for (const row of deduped.values()) {
      try {
        const existing = await db.query.billingTenant.findFirst({
          where: eq(billingTenant.platformTenantId, row.platformTenantId),
        })

        if (existing) {
          await db
            .update(billingTenant)
            .set({
              balance: row.balance,
              overdue_at: row.overdueAt,
              credit_limit: row.creditLimit,
            })
            .where(eq(billingTenant.id, existing.id))
          updated++
        } else {
          const customerId = newId()
          const tenantId = newId()
          const custName = customerDisplayName(
            row.companyName,
            row.phone,
            row.platformTenantId,
          )
          const tName = tenantDisplayName(row.phone, row.platformTenantId)

          await db.transaction(async (tx) => {
            await tx.insert(customer).values({
              id: customerId,
              name: custName,
              shortName: custName,
              type: 'C',
              status: 'active',
              contactPerson: null,
              contactPhone: null,
              contactEmail: null,
              industry: '',
              address: '',
            })
            await tx.insert(billingTenant).values({
              id: tenantId,
              customerId,
              name: tName,
              platformTenantId: row.platformTenantId,
              merchantId: gongjiMerchantId,
              phone: row.phone?.trim() || null,
              isDefault: true,
              status: 'active',
              balance: row.balance,
              overdue_at: row.overdueAt,
              credit_limit: row.creditLimit,
            })

            const tenantContactPayload = legacyContactToInput({
              contactPerson: row.contactPerson ?? undefined,
              contactPhone: row.contactPhone ?? undefined,
            })
            if (tenantContactPayload) {
              const normalized = normalizeContactInput(tenantContactPayload)
              const now = new Date()
              await tx.insert(tenantContact).values({
                id: newContactId(),
                tenantId,
                ...normalized,
                isPrimary: true,
                sortOrder: 0,
                createdAt: now,
                updatedAt: now,
              })
            }
          })
          created++
        }
      } catch (e) {
        errors.push({
          row: row.rowNo,
          platformTenantId: row.platformTenantId,
          message: e instanceof Error ? e.message : '导入失败',
        })
      }
    }

    return {
      total: sheetRows.length,
      created,
      updated,
      failed: errors.length,
      errors,
    }
  },
}
