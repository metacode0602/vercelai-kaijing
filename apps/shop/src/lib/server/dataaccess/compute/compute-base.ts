/**
 * Compute base data access layer.
 * Provides CRUD for the unified compute_base table (Cloud VM + Serverless).
 */

import { eq, and, desc, count, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  computeBase,
  cloudVmDetail,
  serverlessDetail,
} from "@workspace/db"

export interface ComputeBaseRecord {
  id: string
  organizationId: string
  tenantId: string
  productLine: string
  billingMode: string
  commitment: string
  name: string | null
  status: string
  region: string | null
  idcName: string | null
  resourceSpec: Record<string, unknown>
  image: string | null
  paymentOrderId: string | null
  orderAmount: string | number | null
  balanceAmount: string | number
  couponAmount: string | number
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function mapRow(row: typeof computeBase.$inferSelect): ComputeBaseRecord {
  return {
    ...row,
    resourceSpec: (row.resourceSpec as Record<string, unknown>) ?? {},
  }
}

/**
 * List compute instances for an organization, with optional filters.
 */
export async function listComputeBases(
  organizationId: string,
  filters?: {
    productLine?: string
    status?: string
    page?: number
    pageSize?: number
  },
): Promise<PaginatedResult<ComputeBaseRecord>> {
  const page = Math.max(1, filters?.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))

  const conditions: SQL[] = [eq(computeBase.organizationId, organizationId)]
  if (filters?.productLine) {
    conditions.push(eq(computeBase.productLine, filters.productLine))
  }
  if (filters?.status) {
    conditions.push(eq(computeBase.status, filters.status))
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(computeBase)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select()
    .from(computeBase)
    .where(where)
    .orderBy(desc(computeBase.createdAt))
    .limit(pageSize)
    .offset(offset)

  return { items: rows.map(mapRow), total, page, pageSize }
}

/**
 * Get a single compute instance by ID, scoped to organization.
 */
export async function getComputeBaseById(
  id: string,
  organizationId: string,
): Promise<ComputeBaseRecord | null> {
  const [row] = await db
    .select()
    .from(computeBase)
    .where(and(eq(computeBase.id, id), eq(computeBase.organizationId, organizationId)))
    .limit(1)

  return row ? mapRow(row) : null
}

/**
 * Create a new compute_base record.
 */
export async function createComputeBase(
  input: Omit<typeof computeBase.$inferInsert, "id" | "createdAt" | "updatedAt"> & { id: string },
): Promise<ComputeBaseRecord> {
  const [row] = await db
    .insert(computeBase)
    .values(input)
    .returning()

  return mapRow(row)
}

/**
 * Update compute_base status.
 */
export async function updateComputeBaseStatus(
  id: string,
  organizationId: string,
  status: string,
): Promise<void> {
  await db
    .update(computeBase)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(computeBase.id, id), eq(computeBase.organizationId, organizationId)))
}

/**
 * Create cloud VM detail record.
 */
export async function createCloudVmDetail(
  input: typeof cloudVmDetail.$inferInsert,
): Promise<void> {
  await db.insert(cloudVmDetail).values(input)
}

/**
 * Create serverless detail record.
 */
export async function createServerlessDetail(
  input: typeof serverlessDetail.$inferInsert,
): Promise<void> {
  await db.insert(serverlessDetail).values(input)
}

/**
 * Get cloud VM detail by compute_base ID.
 */
export async function getCloudVmDetail(computeBaseId: string) {
  const [row] = await db
    .select()
    .from(cloudVmDetail)
    .where(eq(cloudVmDetail.computeBaseId, computeBaseId))
    .limit(1)

  return row ?? null
}

/**
 * Get serverless detail by compute_base ID.
 */
export async function getServerlessDetail(computeBaseId: string) {
  const [row] = await db
    .select()
    .from(serverlessDetail)
    .where(eq(serverlessDetail.computeBaseId, computeBaseId))
    .limit(1)

  return row ?? null
}
