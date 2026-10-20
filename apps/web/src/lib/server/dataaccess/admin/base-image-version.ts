import { eq, and, desc, asc, count, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { baseImageVersion } from '@workspace/db'

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
  digestSha256: string | null
  requiresGPU: boolean
  minGpuMemory: number | null
  isLatest: boolean
  releaseDate: string | null
  deprecationDate: string | null
  deprecationMessage: string | null
  status: string
  createdAt: Date
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function mapRow(row: typeof baseImageVersion.$inferSelect): BaseImageVersionRecord {
  return { ...row }
}

export const baseImageVersionDataAccess = {
  async listByBaseImage(baseImageId: string): Promise<BaseImageVersionRecord[]> {
    const rows = await db
      .select()
      .from(baseImageVersion)
      .where(eq(baseImageVersion.baseImageId, baseImageId))
      .orderBy(desc(baseImageVersion.createdAt))
    return rows.map(mapRow)
  },

  async getById(id: string): Promise<BaseImageVersionRecord | null> {
    const [row] = await db
      .select()
      .from(baseImageVersion)
      .where(eq(baseImageVersion.id, id))
      .limit(1)
    return row ? mapRow(row) : null
  },

  async create(input: {
    baseImageId: string
    versionTag: string
    displayLabel: string
    fullImageRef: string
    cudaVersion?: string | null
    osVersion?: string | null
    pythonVersion?: string | null
    sizeBytes?: number | null
    digestSha256?: string | null
    requiresGPU?: boolean
    minGpuMemory?: number | null
    isLatest?: boolean
    releaseDate?: string | null
    deprecationDate?: string | null
    deprecationMessage?: string | null
    status?: string
  }): Promise<BaseImageVersionRecord> {
    if (input.isLatest) {
      await db
        .update(baseImageVersion)
        .set({ isLatest: false })
        .where(eq(baseImageVersion.baseImageId, input.baseImageId))
    }

    const id = crypto.randomUUID()
    const [row] = await db
      .insert(baseImageVersion)
      .values({
        id,
        baseImageId: input.baseImageId,
        versionTag: input.versionTag,
        displayLabel: input.displayLabel,
        fullImageRef: input.fullImageRef,
        cudaVersion: input.cudaVersion ?? null,
        osVersion: input.osVersion ?? null,
        pythonVersion: input.pythonVersion ?? null,
        sizeBytes: input.sizeBytes ?? null,
        digestSha256: input.digestSha256 ?? null,
        requiresGPU: input.requiresGPU ?? true,
        minGpuMemory: input.minGpuMemory ?? null,
        isLatest: input.isLatest ?? false,
        releaseDate: input.releaseDate ?? null,
        deprecationDate: input.deprecationDate ?? null,
        deprecationMessage: input.deprecationMessage ?? null,
        status: input.status ?? 'active',
      })
      .returning()
    if (!row) throw new Error('创建镜像版本失败')
    return mapRow(row)
  },

  async update(
    id: string,
    input: Partial<{
      versionTag: string
      displayLabel: string
      fullImageRef: string
      cudaVersion: string | null
      osVersion: string | null
      pythonVersion: string | null
      sizeBytes: number | null
      digestSha256: string | null
      requiresGPU: boolean
      minGpuMemory: number | null
      isLatest: boolean
      releaseDate: string | null
      deprecationDate: string | null
      deprecationMessage: string | null
      status: string
    }>,
  ): Promise<BaseImageVersionRecord | null> {
    if (input.isLatest) {
      const existing = await this.getById(id)
      if (existing) {
        await db
          .update(baseImageVersion)
          .set({ isLatest: false })
          .where(eq(baseImageVersion.baseImageId, existing.baseImageId))
      }
    }

    const [row] = await db
      .update(baseImageVersion)
      .set({ ...input })
      .where(eq(baseImageVersion.id, id))
      .returning()
    return row ? mapRow(row) : null
  },

  async delete(id: string): Promise<{ success: boolean }> {
    await db.delete(baseImageVersion).where(eq(baseImageVersion.id, id))
    return { success: true }
  },
}
