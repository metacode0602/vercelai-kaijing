import { eq, and, desc, asc, count, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { applicationTemplate } from '@workspace/db'

export interface ApplicationTemplateRecord {
  id: string
  name: string
  description: string | null
  category: string
  tags: string[]
  iconUrl: string | null
  imageRef: string
  sourceType: string
  minGPU: string | null
  minGPUCount: number | null
  minMemoryGB: number | null
  minDiskGB: number | null
  defaultPort: number | null
  defaultCommand: string | null
  defaultEnvVars: unknown
  healthCheckPath: string | null
  docsUrl: string | null
  sourceUrl: string | null
  deployType: string
  isFeatured: boolean
  sortOrder: number
  downloadCount: number
  reviewStatus: string
  reviewedBy: string | null
  reviewedAt: Date | null
  tier: string
  status: string
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function mapRow(row: typeof applicationTemplate.$inferSelect): ApplicationTemplateRecord {
  return { ...row }
}

export const applicationTemplateDataAccess = {
  async list(filters?: {
    search?: string
    category?: string
    deployType?: string
    tier?: string
    reviewStatus?: string
    status?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResult<ApplicationTemplateRecord>> {
    const page = Math.max(1, filters?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))
    const conditions: SQL[] = []

    if (filters?.search) {
      conditions.push(
        sql`(${applicationTemplate.name} ILIKE ${'%' + filters.search + '%'} OR ${applicationTemplate.imageRef} ILIKE ${'%' + filters.search + '%'})`,
      )
    }
    if (filters?.category) {
      conditions.push(eq(applicationTemplate.category, filters.category))
    }
    if (filters?.deployType) {
      conditions.push(eq(applicationTemplate.deployType, filters.deployType))
    }
    if (filters?.tier) {
      conditions.push(eq(applicationTemplate.tier, filters.tier))
    }
    if (filters?.reviewStatus) {
      conditions.push(eq(applicationTemplate.reviewStatus, filters.reviewStatus))
    }
    if (filters?.status) {
      conditions.push(eq(applicationTemplate.status, filters.status))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(applicationTemplate)
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select()
      .from(applicationTemplate)
      .where(where)
      .orderBy(asc(applicationTemplate.sortOrder), desc(applicationTemplate.createdAt))
      .limit(pageSize)
      .offset(offset)

    return { items: rows.map(mapRow), total, page, pageSize }
  },

  async getById(id: string): Promise<ApplicationTemplateRecord | null> {
    const [row] = await db
      .select()
      .from(applicationTemplate)
      .where(eq(applicationTemplate.id, id))
      .limit(1)
    return row ? mapRow(row) : null
  },

  async create(input: {
    name: string
    description?: string | null
    category: string
    tags?: string[]
    iconUrl?: string | null
    imageRef: string
    sourceType?: string
    minGPU?: string | null
    minGPUCount?: number | null
    minMemoryGB?: number | null
    minDiskGB?: number | null
    defaultPort?: number | null
    defaultCommand?: string | null
    defaultEnvVars?: Record<string, unknown> | null
    healthCheckPath?: string | null
    docsUrl?: string | null
    sourceUrl?: string | null
    deployType?: string
    isFeatured?: boolean
    sortOrder?: number
    tier?: string
    status?: string
    createdBy?: string | null
  }): Promise<ApplicationTemplateRecord> {
    const id = crypto.randomUUID()
    const [row] = await db
      .insert(applicationTemplate)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        tags: input.tags ?? [],
        iconUrl: input.iconUrl ?? null,
        imageRef: input.imageRef,
        sourceType: input.sourceType ?? 'docker_hub',
        minGPU: input.minGPU ?? null,
        minGPUCount: input.minGPUCount ?? 1,
        minMemoryGB: input.minMemoryGB ?? null,
        minDiskGB: input.minDiskGB ?? 60,
        defaultPort: input.defaultPort ?? 8080,
        defaultCommand: input.defaultCommand ?? null,
        defaultEnvVars: input.defaultEnvVars ?? null,
        healthCheckPath: input.healthCheckPath ?? null,
        docsUrl: input.docsUrl ?? null,
        sourceUrl: input.sourceUrl ?? null,
        deployType: input.deployType ?? 'instance',
        isFeatured: input.isFeatured ?? false,
        sortOrder: input.sortOrder ?? 0,
        tier: input.tier ?? 'community',
        status: input.status ?? 'active',
        createdBy: input.createdBy ?? null,
      })
      .returning()
    if (!row) throw new Error('创建应用模板失败')
    return mapRow(row)
  },

  async update(
    id: string,
    input: Partial<{
      name: string
      description: string | null
      category: string
      tags: string[]
      iconUrl: string | null
      imageRef: string
      sourceType: string
      minGPU: string | null
      minGPUCount: number | null
      minMemoryGB: number | null
      minDiskGB: number | null
      defaultPort: number | null
      defaultCommand: string | null
  defaultEnvVars: unknown
      healthCheckPath: string | null
      docsUrl: string | null
      sourceUrl: string | null
      deployType: string
      isFeatured: boolean
      sortOrder: number
      tier: string
      status: string
    }>,
  ): Promise<ApplicationTemplateRecord | null> {
    const [row] = await db
      .update(applicationTemplate)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(applicationTemplate.id, id))
      .returning()
    return row ? mapRow(row) : null
  },

  async delete(id: string): Promise<{ success: boolean }> {
    await db.delete(applicationTemplate).where(eq(applicationTemplate.id, id))
    return { success: true }
  },

  async review(
    id: string,
    input: {
      reviewStatus: 'approved' | 'rejected'
      reviewedBy: string
    },
  ): Promise<ApplicationTemplateRecord | null> {
    const [row] = await db
      .update(applicationTemplate)
      .set({
        reviewStatus: input.reviewStatus,
        reviewedBy: input.reviewedBy,
        reviewedAt: new Date(),
      })
      .where(eq(applicationTemplate.id, id))
      .returning()
    return row ? mapRow(row) : null
  },

  async listCategories(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ category: applicationTemplate.category })
      .from(applicationTemplate)
      .orderBy(asc(applicationTemplate.category))
    return rows.map((r) => r.category).filter(Boolean)
  },
}
