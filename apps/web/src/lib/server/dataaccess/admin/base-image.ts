import { eq, and, desc, asc, count, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { baseImage } from '@workspace/db'

export interface BaseImageRecord {
  id: string
  name: string
  displayName: string
  description: string | null
  category: string
  tags: string[]
  iconUrl: string | null
  sortOrder: number
  recommendedConfig: Record<string, unknown>
  status: string
  createdAt: Date
  updatedAt: Date
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function mapRow(row: typeof baseImage.$inferSelect): BaseImageRecord {
  return { ...row, recommendedConfig: (row.recommendedConfig ?? {}) as Record<string, unknown> }
}

export const baseImageDataAccess = {
  async list(filters?: {
    search?: string
    category?: string
    status?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<BaseImageRecord>> {
    const page = Math.max(1, filters?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))
    const conditions: SQL[] = []

    if (filters?.search) {
      conditions.push(
        sql`(${baseImage.name} ILIKE ${'%' + filters.search + '%'} OR ${baseImage.displayName} ILIKE ${'%' + filters.search + '%'})`,
      )
    }
    if (filters?.category) {
      conditions.push(eq(baseImage.category, filters.category))
    }
    if (filters?.status) {
      conditions.push(eq(baseImage.status, filters.status))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(baseImage)
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select()
      .from(baseImage)
      .where(where)
      .orderBy(asc(baseImage.sortOrder), desc(baseImage.createdAt))
      .limit(pageSize)
      .offset(offset)

    return { items: rows.map(mapRow), total, page, pageSize }
  },

  async getById(id: string): Promise<BaseImageRecord | null> {
    const [row] = await db
      .select()
      .from(baseImage)
      .where(eq(baseImage.id, id))
      .limit(1)
    return row ? mapRow(row) : null
  },

  async create(input: {
    name: string
    displayName: string
    description?: string | null
    category: string
    tags?: string[]
    iconUrl?: string | null
    sortOrder?: number
    recommendedConfig?: Record<string, unknown>
    status?: string
  }): Promise<BaseImageRecord> {
    const id = crypto.randomUUID()
    const [row] = await db
      .insert(baseImage)
      .values({
        id,
        name: input.name,
        displayName: input.displayName,
        description: input.description ?? null,
        category: input.category,
        tags: input.tags ?? [],
        iconUrl: input.iconUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
        recommendedConfig: input.recommendedConfig ?? {},
        status: input.status ?? 'active',
      })
      .returning()
    if (!row) throw new Error('创建基础镜像失败')
    return mapRow(row)
  },

  async update(
    id: string,
    input: Partial<{
      name: string
      displayName: string
      description: string | null
      category: string
      tags: string[]
      iconUrl: string | null
      sortOrder: number
      recommendedConfig: Record<string, unknown>
      status: string
    }>,
  ): Promise<BaseImageRecord | null> {
    const [row] = await db
      .update(baseImage)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(baseImage.id, id))
      .returning()
    return row ? mapRow(row) : null
  },

  async delete(id: string): Promise<{ success: boolean }> {
    await db.delete(baseImage).where(eq(baseImage.id, id))
    return { success: true }
  },

  async listCategories(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ category: baseImage.category })
      .from(baseImage)
      .orderBy(asc(baseImage.category))
    return rows.map((r) => r.category).filter(Boolean)
  },
}
