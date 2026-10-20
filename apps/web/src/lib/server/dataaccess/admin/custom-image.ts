import { eq, and, desc, count, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customImage, billingTenant } from '@workspace/db'

export interface CustomImageRecord {
  id: string
  tenantId: string
  tenantName: string | null
  tagName: string
  imageRef: string
  digest: string | null
  sizeBytes: number | null
  source: string
  status: string
  scanStatus: string | null
  description: string | null
  isPinned: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function mapRow(
  row: Record<string, unknown> & { id: string; tenantId: string; tagName: string; imageRef: string; source: string; status: string; isPinned: boolean; createdAt: Date; updatedAt: Date },
): CustomImageRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: (row.tenantName as string | null) ?? null,
    tagName: row.tagName,
    imageRef: row.imageRef,
    digest: (row.digest as string | null) ?? null,
    sizeBytes: (row.sizeBytes as number | null) ?? null,
    source: row.source,
    status: row.status,
    scanStatus: (row.scanStatus as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    isPinned: row.isPinned,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export const customImageDataAccess = {
  async list(filters?: {
    search?: string
    tenantId?: string
    status?: string
    source?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<CustomImageRecord>> {
    const page = Math.max(1, filters?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))
    const conditions: SQL[] = []

    if (filters?.search) {
      conditions.push(
        sql`(${customImage.tagName} ILIKE ${'%' + filters.search + '%'} OR ${customImage.imageRef} ILIKE ${'%' + filters.search + '%'})`,
      )
    }
    if (filters?.tenantId) {
      conditions.push(eq(customImage.tenantId, filters.tenantId))
    }
    if (filters?.status) {
      conditions.push(eq(customImage.status, filters.status))
    }
    if (filters?.source) {
      conditions.push(eq(customImage.source, filters.source))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(customImage)
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select({
        id: customImage.id,
        tenantId: customImage.tenantId,
        tenantName: billingTenant.name,
        tagName: customImage.tagName,
        imageRef: customImage.imageRef,
        digest: customImage.digest,
        sizeBytes: customImage.sizeBytes,
        source: customImage.source,
        status: customImage.status,
        scanStatus: customImage.scanStatus,
        description: customImage.description,
        isPinned: customImage.isPinned,
        createdAt: customImage.createdAt,
        updatedAt: customImage.updatedAt,
      })
      .from(customImage)
      .leftJoin(billingTenant, eq(customImage.tenantId, billingTenant.id))
      .where(where)
      .orderBy(desc(customImage.createdAt))
      .limit(pageSize)
      .offset(offset)

    return { items: rows.map(mapRow), total, page, pageSize }
  },

  async getById(id: string): Promise<CustomImageRecord | null> {
    const [row] = await db
      .select({
        id: customImage.id,
        tenantId: customImage.tenantId,
        tenantName: billingTenant.name,
        tagName: customImage.tagName,
        imageRef: customImage.imageRef,
        digest: customImage.digest,
        sizeBytes: customImage.sizeBytes,
        source: customImage.source,
        status: customImage.status,
        scanStatus: customImage.scanStatus,
        description: customImage.description,
        isPinned: customImage.isPinned,
        createdAt: customImage.createdAt,
        updatedAt: customImage.updatedAt,
      })
      .from(customImage)
      .leftJoin(billingTenant, eq(customImage.tenantId, billingTenant.id))
      .where(eq(customImage.id, id))
      .limit(1)
    return row ? mapRow(row) : null
  },

  async togglePin(
    id: string,
    isPinned: boolean,
  ): Promise<CustomImageRecord | null> {
    const [row] = await db
      .update(customImage)
      .set({ isPinned, updatedAt: new Date() })
      .where(eq(customImage.id, id))
      .returning()
    return row ? mapRow(row) : null
  },

  async delete(id: string): Promise<{ success: boolean }> {
    await db.delete(customImage).where(eq(customImage.id, id))
    return { success: true }
  },
}
