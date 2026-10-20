import { eq, and, inArray, desc, count, type SQL } from "drizzle-orm"
import { db } from "@/lib/db"
import { customImage, computeBase } from "@workspace/db"

export interface CustomImageRecord {
  id: string
  tenantId: string
  tagName: string
  imageRef: string
  digest: string | null
  sizeBytes: number | null
  source: string
  sourceTaskId: string | null
  externalRef: string | null
  status: string
  scanStatus: string | null
  scanSummary: Record<string, unknown> | null
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

function mapRow(row: typeof customImage.$inferSelect): CustomImageRecord {
  return {
    ...row,
    scanSummary: (row.scanSummary as Record<string, unknown>) ?? null,
  }
}

export async function listCustomImages(
  tenantId: string,
  filters?: {
    status?: string
    page?: number
    pageSize?: number
  },
): Promise<PaginatedResult<CustomImageRecord>> {
  const page = Math.max(1, filters?.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 20))

  const conditions: SQL[] = [eq(customImage.tenantId, tenantId)]
  if (filters?.status) {
    conditions.push(eq(customImage.status, filters.status))
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(customImage)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select()
    .from(customImage)
    .where(where)
    .orderBy(desc(customImage.createdAt))
    .limit(pageSize)
    .offset(offset)

  return { items: rows.map(mapRow), total, page, pageSize }
}

export async function getCustomImageDetail(
  tenantId: string,
  imageId: string,
): Promise<CustomImageRecord | null> {
  const [row] = await db
    .select()
    .from(customImage)
    .where(and(eq(customImage.id, imageId), eq(customImage.tenantId, tenantId)))
    .limit(1)

  return row ? mapRow(row) : null
}

export async function deleteCustomImage(
  tenantId: string,
  imageId: string,
): Promise<{ success: boolean; error?: string }> {
  const image = await getCustomImageDetail(tenantId, imageId)
  if (!image) {
    return { success: false, error: "镜像不存在" }
  }

  const activeStatuses = ["creating", "running", "stopped"]
  const [inUseRow] = await db
    .select({ id: computeBase.id })
    .from(computeBase)
    .where(
      and(
        eq(computeBase.tenantId, tenantId),
        eq(computeBase.image, image.imageRef),
        inArray(computeBase.status, activeStatuses),
      ),
    )
    .limit(1)

  if (inUseRow) {
    return { success: false, error: "该镜像正在被运行中的实例使用，无法删除" }
  }

  await db
    .delete(customImage)
    .where(eq(customImage.id, imageId))

  return { success: true }
}
