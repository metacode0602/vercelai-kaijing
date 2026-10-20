import { db } from '@/lib/db'
import type { Customer, CustomerExpectedScale } from '@/lib/data/types'
import { customerContactsDataAccess } from '@/lib/server/dataaccess/crm/customer-contacts'
import { getGongjiMerchantId } from '@/lib/server/dataaccess/merchant/merchant-resolve'
import {
  mapCustomerRow,
  toIsoDateTime,
} from '@/lib/server/mappers/crm'
import {
  billingTenant,
  consumptionUsageDaily,
  crmProject,
  customer,
  recharge,
  userStaff,
} from '@workspace/db/schema'
function newId() {
  return crypto.randomUUID()
}
import {
  buildCustomerTableIdFilter,
  filterCustomerGetById,
  loadVisibleCustomerIds,
  type CrmDataScope,
} from '@/lib/server/auth/crm-data-scope'
import { and, count, desc, eq, ilike, or, sum, type SQL } from 'drizzle-orm'

export type CustomerListFilters = {
  search?: string
  type?: 'B' | 'C' | 'all'
  status?: string
  identityVerified?: 'verified' | 'unverified' | 'all'
  page?: number
  pageSize?: number
}

export type CustomerListResult = {
  items: Customer[]
  total: number
  page: number
  pageSize: number
  typeCounts: { B: number; C: number }
}

export type CustomerUpsertInput = {
  name: string
  shortName?: string
  type: 'B' | 'C'
  status?: 'active' | 'inactive' | 'suspended'
  contactPerson?: string
  contactPhone?: string
  contactEmail?: string
  industry: string
  address: string
  certCode?: string
  salesManagerId?: string
  expectedScale?: CustomerExpectedScale | null
}

function buildCustomerListConditions(
  filters: CustomerListFilters = {},
  options?: { includeType?: boolean },
) {
  const includeType = options?.includeType ?? true
  const conditions: SQL[] = []
  if (includeType && filters.type && filters.type !== 'all') {
    conditions.push(eq(customer.type, filters.type))
  }
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(customer.status, filters.status))
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(customer.name, q),
        ilike(customer.contactPerson, q),
        ilike(customer.certCode, q),
      )!,
    )
  }
  if (filters.identityVerified === 'verified') {
    conditions.push(eq(customer.identityVerified, true))
  } else if (filters.identityVerified === 'unverified') {
    conditions.push(eq(customer.identityVerified, false))
  }
  return conditions
}

function toMetricNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function mapListCustomer(
  row: {
    customer: typeof customer.$inferSelect
    salesManagerName: string | null
  },
): Customer {
  return mapCustomerRow(row.customer, {
    projectCount: 0,
    totalRecharge: 0,
    totalConsumption: 0,
    balance: 0,
    salesManagerName: row.salesManagerName ?? undefined,
    platformRegisteredAt: row.customer.platformRegisteredAt
      ? toIsoDateTime(row.customer.platformRegisteredAt)
      : undefined,
  })
}

/** 列表：不聚合项目数/充值/消费/余额，平台注册时间读自 customer 冗余列 */
async function queryCustomerListPage(
  listConditions: SQL[],
  typeCountConditions: SQL[],
  page: number,
  pageSize: number,
): Promise<CustomerListResult> {
  const where = listConditions.length ? and(...listConditions) : undefined
  const typeWhere = typeCountConditions.length ? and(...typeCountConditions) : undefined
  const offset = (page - 1) * pageSize

  const [totalRow, typeCountRows, baseRows] = await Promise.all([
    db.select({ value: count().as('total') }).from(customer).where(where),
    db
      .select({
        type: customer.type,
        value: count().as('cnt'),
      })
      .from(customer)
      .where(typeWhere)
      .groupBy(customer.type),
    db
      .select({
        customer: customer,
        salesManagerName: userStaff.displayName,
      })
      .from(customer)
      .leftJoin(userStaff, eq(customer.salesManagerId, userStaff.id))
      .where(where)
      .orderBy(desc(customer.createdAt))
      .limit(pageSize)
      .offset(offset),
  ])

  const typeCounts = { B: 0, C: 0 }
  for (const row of typeCountRows) {
    if (row.type === 'B' || row.type === 'C') {
      typeCounts[row.type] = Number(row.value ?? 0)
    }
  }

  return {
    items: baseRows.map(mapListCustomer),
    total: Number(totalRow[0]?.value ?? 0),
    page,
    pageSize,
    typeCounts,
  }
}

/** 详情：按客户聚合项目数 / 充值 / 消费 / 余额 */
async function queryCustomerWithMetrics(customerId: string): Promise<Customer | null> {
  const [base] = await db
    .select({
      customer: customer,
      salesManagerName: userStaff.displayName,
    })
    .from(customer)
    .leftJoin(userStaff, eq(customer.salesManagerId, userStaff.id))
    .where(eq(customer.id, customerId))
    .limit(1)

  if (!base) return null

  const customerIdFilter = eq(billingTenant.customerId, customerId)

  const [projectCountRows, balanceRows, rechargeRows, consumptionRows] = await Promise.all([
    db
      .select({ value: count().as('project_count') })
      .from(crmProject)
      .where(eq(crmProject.customerId, customerId)),
    db
      .select({ value: sum(billingTenant.balance).as('balance') })
      .from(billingTenant)
      .where(customerIdFilter),
    db
      .select({ value: sum(recharge.amount).as('total_recharge') })
      .from(billingTenant)
      .innerJoin(recharge, eq(recharge.tenantId, billingTenant.id))
      .where(and(customerIdFilter, eq(recharge.status, 'paid'))),
    db
      .select({ value: sum(consumptionUsageDaily.amount).as('total_consumption') })
      .from(billingTenant)
      .innerJoin(consumptionUsageDaily, eq(consumptionUsageDaily.tenantId, billingTenant.id))
      .where(customerIdFilter),
  ])

  return mapCustomerRow(base.customer, {
    projectCount: toMetricNumber(projectCountRows[0]?.value),
    totalRecharge: toMetricNumber(rechargeRows[0]?.value),
    totalConsumption: toMetricNumber(consumptionRows[0]?.value),
    balance: toMetricNumber(balanceRows[0]?.value),
    salesManagerName: base.salesManagerName ?? undefined,
    platformRegisteredAt: base.customer.platformRegisteredAt
      ? toIsoDateTime(base.customer.platformRegisteredAt)
      : undefined,
  })
}

export const customersDataAccess = {
  async list(
    filters: CustomerListFilters = {},
    scope?: CrmDataScope,
  ): Promise<CustomerListResult> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
    const conditions = buildCustomerListConditions(filters)
    const typeCountConditions = buildCustomerListConditions(filters, { includeType: false })
    const visibleCustomerIds = scope ? await loadVisibleCustomerIds(scope) : null
    const scopeFilter = buildCustomerTableIdFilter(visibleCustomerIds)
    if (scopeFilter) {
      conditions.push(scopeFilter)
      typeCountConditions.push(scopeFilter)
    }
    if (visibleCustomerIds && visibleCustomerIds.length === 0) {
      return { items: [], total: 0, page, pageSize, typeCounts: { B: 0, C: 0 } }
    }
    return queryCustomerListPage(conditions, typeCountConditions, page, pageSize)
  },

  async getById(id: string, scope?: CrmDataScope): Promise<Customer | null> {
    return filterCustomerGetById(scope ?? { type: 'all' }, id, async () =>
      queryCustomerWithMetrics(id),
    )
  },

  async create(input: CustomerUpsertInput): Promise<Customer> {
    const id = newId()
    const tenantId = newId()
    const displayName = input.shortName?.trim() || input.name.trim()
    const gongjiMerchantId = await getGongjiMerchantId()

    await db.transaction(async (tx) => {
      await tx.insert(customer).values({
        id,
        name: input.name.trim(),
        type: input.type,
        status: input.status ?? 'active',
        contactPerson: input.contactPerson?.trim() || null,
        contactPhone: input.contactPhone?.trim() || null,
        contactEmail: input.contactEmail?.trim() || null,
        industry: input.industry,
        address: input.address.trim(),
        certCode: input.certCode?.trim() || null,
        salesManagerId: input.salesManagerId || null,
        expectedScale: input.expectedScale ?? null,
        shortName: input.shortName?.trim() || null,
      })
      await tx.insert(billingTenant).values({
        id: tenantId,
        customerId: id,
        name: displayName,
        merchantId: gongjiMerchantId,
        isDefault: true,
        status: input.status ?? 'active',
        balance: '0',
      })
      await customerContactsDataAccess.syncPrimaryFromLegacyFields(tx, id, input)
    })

    const created = await this.getById(id)
    if (!created) throw new Error('创建客户失败')
    return created
  },

  async update(id: string, input: CustomerUpsertInput): Promise<Customer> {
    await db.transaction(async (tx) => {
      await tx
        .update(customer)
        .set({
          name: input.name.trim(),
          type: input.type,
          status: input.status ?? 'active',
          contactPerson: input.contactPerson?.trim() || null,
          contactPhone: input.contactPhone?.trim() || null,
          contactEmail: input.contactEmail?.trim() || null,
          industry: input.industry,
          address: input.address.trim(),
          certCode: input.certCode?.trim() || null,
          salesManagerId: input.salesManagerId || null,
          expectedScale: input.expectedScale ?? null,
          shortName: input.shortName?.trim() || null,
        })
        .where(eq(customer.id, id))
      await customerContactsDataAccess.syncPrimaryFromLegacyFields(tx, id, input)
    })

    const updated = await this.getById(id)
    if (!updated) throw new Error('客户不存在')
    return updated
  },
}
