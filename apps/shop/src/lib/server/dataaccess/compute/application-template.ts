import { eq, and, desc, asc, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { applicationTemplate, applicationTemplateVersion } from "@workspace/db"

export interface AppTemplateRecord {
  id: string
  name: string
  description: string | null
  category: string
  tags: string[]
  iconUrl: string | null
  imageRef: string
  minGPU: string | null
  minGPUCount: number | null
  minMemoryGB: number | null
  minDiskGB: number | null
  defaultPort: number | null
  defaultCommand: string | null
  defaultEnvVars: Record<string, unknown> | null
  healthCheckPath: string | null
  docsUrl: string | null
  sourceUrl: string | null
  deployType: string
  isFeatured: boolean
  sortOrder: number
  downloadCount: number
  tier: string
}

export interface AppTemplateWithVersions extends AppTemplateRecord {
  versions: AppTemplateVersionRecord[]
}

export interface AppTemplateVersionRecord {
  id: string
  templateId: string
  versionTag: string
  changelog: string | null
  imageRef: string
  command: string | null
  envVars: Record<string, unknown> | null
  isLatest: boolean
  status: string
  createdAt: Date
}

export async function listApplicationTemplates(filters?: {
  category?: string
  search?: string
  deployType?: string
  page?: number
  pageSize?: number
}): Promise<{ items: AppTemplateRecord[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters?.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))
  const conditions: SQL[] = [
    eq(applicationTemplate.status, "active"),
    eq(applicationTemplate.reviewStatus, "approved"),
  ]
  if (filters?.category) conditions.push(eq(applicationTemplate.category, filters.category))
  if (filters?.deployType) conditions.push(eq(applicationTemplate.deployType, filters.deployType))
  if (filters?.search) {
    conditions.push(sql`(${applicationTemplate.name} ILIKE ${'%' + filters.search + '%'} OR ${applicationTemplate.imageRef} ILIKE ${'%' + filters.search + '%'})`)
  }
  const where = and(...conditions)

  const [totalRow] = await db.select({ total: sql<number>`count(*)::int` }).from(applicationTemplate).where(where)
  const total = totalRow?.total ?? 0
  const offset = (page - 1) * pageSize

  const rows = await db
    .select()
    .from(applicationTemplate)
    .where(where)
    .orderBy(asc(applicationTemplate.sortOrder), desc(applicationTemplate.downloadCount))
    .limit(pageSize)
    .offset(offset)

  return {
    items: rows.map(r => ({
      ...r,
      defaultEnvVars: (r.defaultEnvVars ?? null) as Record<string, unknown> | null,
    })),
    total,
    page,
    pageSize,
  }
}

export async function getApplicationTemplateDetail(id: string): Promise<AppTemplateWithVersions | null> {
  const [row] = await db.select().from(applicationTemplate).where(eq(applicationTemplate.id, id)).limit(1)
  if (!row) return null

  const versions = await db
    .select()
    .from(applicationTemplateVersion)
    .where(eq(applicationTemplateVersion.templateId, id))
    .orderBy(desc(applicationTemplateVersion.createdAt))

  return {
    ...row,
    defaultEnvVars: (row.defaultEnvVars ?? null) as Record<string, unknown> | null,
    versions: versions.map(v => ({
      ...v,
      envVars: (v.envVars ?? null) as Record<string, unknown> | null,
    })),
  }
}
