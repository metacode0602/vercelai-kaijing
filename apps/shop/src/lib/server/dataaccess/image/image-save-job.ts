import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { imageSaveJob, customImage } from "@workspace/db"

export interface ImageSaveJobRecord {
  id: string
  tenantId: string
  sourceTaskId: string
  tagName: string
  imageRef: string
  status: string
  digest: string | null
  sizeBytes: number | null
  errorMessage: string | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

/**
 * Create an image save job from a running instance.
 * In a real implementation, this would trigger a docker commit + push via SkyPilot API.
 * For now, we create the DB record and mark it as completed (simulating the async process).
 */
export async function createImageSaveJob(
  tenantId: string,
  input: {
    sourceTaskId: string
    tagName: string
  },
): Promise<ImageSaveJobRecord> {
  const id = crypto.randomUUID()
  const imageRef = `registry.gongji.cloud/${tenantId}/${input.tagName}`

  const [row] = await db
    .insert(imageSaveJob)
    .values({
      id,
      tenantId,
      sourceTaskId: input.sourceTaskId,
      tagName: input.tagName,
      imageRef,
      status: "completed",
      completedAt: new Date(),
    })
    .returning()

  if (!row) throw new Error("创建镜像保存任务失败")

  await db
    .insert(customImage)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      tagName: input.tagName,
      imageRef,
      source: "commit",
      sourceTaskId: input.sourceTaskId,
      status: "ready",
    })
    .onConflictDoNothing()

  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceTaskId: row.sourceTaskId,
    tagName: row.tagName,
    imageRef: row.imageRef,
    status: row.status,
    digest: row.digest,
    sizeBytes: row.sizeBytes,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }
}

export async function getImageSaveJobStatus(
  tenantId: string,
  jobId: string,
): Promise<ImageSaveJobRecord | null> {
  const [row] = await db
    .select()
    .from(imageSaveJob)
    .where(eq(imageSaveJob.id, jobId))
    .limit(1)

  if (!row || row.tenantId !== tenantId) return null

  return {
    id: row.id,
    tenantId: row.tenantId,
    sourceTaskId: row.sourceTaskId,
    tagName: row.tagName,
    imageRef: row.imageRef,
    status: row.status,
    digest: row.digest,
    sizeBytes: row.sizeBytes,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  }
}
