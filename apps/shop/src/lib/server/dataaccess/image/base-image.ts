import { eq, asc, and, sql, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { baseImage, baseImageVersion } from "@workspace/db"

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
}

export interface BaseImageWithVersions extends BaseImageRecord {
  versions: BaseImageVersionRecord[]
}

export interface BaseImageVersionRecord {
  id: string
  baseImageId: string
  versionTag: string
  displayLabel: string
  fullImageRef: string
  cudaVersion: string | null
  osVersion: string | null
  pythonVersion: string | null
  sizeBytes: number | null
  requiresGPU: boolean
  isLatest: boolean
  status: string
}

export async function listBaseImages(filters?: {
  category?: string
  search?: string
}): Promise<BaseImageWithVersions[]> {
  const conditions: SQL[] = [eq(baseImage.status, "active")]
  if (filters?.category) conditions.push(eq(baseImage.category, filters.category))
  if (filters?.search) {
    conditions.push(sql`(${baseImage.name} ILIKE ${'%' + filters.search + '%'} OR ${baseImage.displayName} ILIKE ${'%' + filters.search + '%'})`)
  }
  const where = and(...conditions)

  const images = await db
    .select()
    .from(baseImage)
    .where(where)
    .orderBy(asc(baseImage.sortOrder))

  const imageIds = images.map(i => i.id)
  if (imageIds.length === 0) return []

  const versions = await db
    .select()
    .from(baseImageVersion)
    .where(and(
      sql`${baseImageVersion.baseImageId} IN ${imageIds}`,
      eq(baseImageVersion.status, "active")
    ))
    .orderBy(asc(baseImageVersion.createdAt))

  const versionsByImage = new Map<string, typeof versions>()
  for (const v of versions) {
    const list = versionsByImage.get(v.baseImageId) ?? []
    list.push(v)
    versionsByImage.set(v.baseImageId, list)
  }

  return images.map(img => ({
    id: img.id,
    name: img.name,
    displayName: img.displayName,
    description: img.description,
    category: img.category,
    tags: img.tags ?? [],
    iconUrl: img.iconUrl,
    sortOrder: img.sortOrder,
    recommendedConfig: (img.recommendedConfig ?? {}) as Record<string, unknown>,
    status: img.status,
    versions: (versionsByImage.get(img.id) ?? []).map(v => ({
      id: v.id,
      baseImageId: v.baseImageId,
      versionTag: v.versionTag,
      displayLabel: v.displayLabel,
      fullImageRef: v.fullImageRef,
      cudaVersion: v.cudaVersion,
      osVersion: v.osVersion,
      pythonVersion: v.pythonVersion,
      sizeBytes: v.sizeBytes,
      requiresGPU: v.requiresGPU,
      isLatest: v.isLatest,
      status: v.status,
    })),
  }))
}
