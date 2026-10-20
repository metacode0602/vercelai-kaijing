import { db } from '@/lib/db'
import type { Contract } from '@/lib/data/types'
import { mapContractRow, toNumber } from '@/lib/server/mappers/crm'
import { contract, crmProject, customer } from '@workspace/db/schema'
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'

export type ContractListFilters = {
  search?: string
  type?: string
  status?: string
  page?: number
  pageSize?: number
}

export type ContractListResult = {
  items: Contract[]
  total: number
  page: number
  pageSize: number
  summary: {
    totalAmount: number
    paidAmount: number
    activeCount: number
    pendingCount: number
  }
}

function mapJoinedContractRow(row: {
  contract: typeof contract.$inferSelect
  projectName: string | null
  customerName: string | null
}): Contract {
  return mapContractRow({
    ...row.contract,
    startDate: String(row.contract.startDate),
    endDate: String(row.contract.endDate),
    projectName: row.projectName ?? '',
    customerName: row.customerName ?? '',
  })
}

export const contractsDataAccess = {
  async list(filters: ContractListFilters = {}): Promise<ContractListResult> {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const conditions: SQL[] = []
    if (filters.type && filters.type !== 'all') {
      conditions.push(eq(contract.type, filters.type))
    }
    if (filters.status && filters.status !== 'all') {
      conditions.push(eq(contract.status, filters.status))
    }
    if (filters.search?.trim()) {
      const q = `%${filters.search.trim()}%`
      conditions.push(
        or(
          ilike(contract.contractNo, q),
          ilike(customer.name, q),
          ilike(crmProject.name, q),
        )!,
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow, summaryRow, rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(contract)
        .leftJoin(crmProject, eq(contract.projectId, crmProject.id))
        .leftJoin(customer, eq(contract.customerId, customer.id))
        .where(where),
      db
        .select({
          totalAmount: sql<string>`coalesce(sum(${contract.totalAmount}), 0)`,
          paidAmount: sql<string>`coalesce(sum(${contract.paidAmount}), 0)`,
          activeCount: sql<number>`count(*) filter (where ${contract.status} = 'active')`,
          pendingCount: sql<number>`count(*) filter (where ${contract.status} = 'pending')`,
        })
        .from(contract),
      db
        .select({
          contract,
          projectName: crmProject.name,
          customerName: customer.name,
        })
        .from(contract)
        .leftJoin(crmProject, eq(contract.projectId, crmProject.id))
        .leftJoin(customer, eq(contract.customerId, customer.id))
        .where(where)
        .orderBy(desc(contract.createdAt))
        .limit(pageSize)
        .offset(offset),
    ])

    return {
      items: rows.map(mapJoinedContractRow),
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
      summary: {
        totalAmount: toNumber(summaryRow[0]?.totalAmount ?? 0),
        paidAmount: toNumber(summaryRow[0]?.paidAmount ?? 0),
        activeCount: Number(summaryRow[0]?.activeCount ?? 0),
        pendingCount: Number(summaryRow[0]?.pendingCount ?? 0),
      },
    }
  },

  async listByCustomerId(customerId: string): Promise<Contract[]> {
    const rows = await db
      .select({
        contract,
        projectName: crmProject.name,
        customerName: customer.name,
      })
      .from(contract)
      .leftJoin(crmProject, eq(contract.projectId, crmProject.id))
      .leftJoin(customer, eq(contract.customerId, customer.id))
      .where(eq(contract.customerId, customerId))
      .orderBy(desc(contract.createdAt))

    return rows.map(mapJoinedContractRow)
  },
}
