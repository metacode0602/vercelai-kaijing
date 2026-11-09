import { and, eq } from "drizzle-orm"
import { syncJobRuns, syncTasks } from "@workspace/db"
import { db } from "../db"

async function latestRun(syncTaskId: string) {
  const runs = await db
    .select()
    .from(syncJobRuns)
    .where(eq(syncJobRuns.syncTaskId, syncTaskId))
  return runs.sort((a, b) => b.runNo - a.runNo)[0] ?? null
}

function taskWhere(syncTaskId: string, organizationId?: string) {
  if (organizationId) {
    return and(
      eq(syncTasks.id, syncTaskId),
      eq(syncTasks.organizationId, organizationId)
    )
  }
  return eq(syncTasks.id, syncTaskId)
}

export async function markSyncTaskRunning(input: {
  syncTaskId: string
  organizationId?: string
  requestId?: string | null
  message?: string
}) {
  const now = new Date()
  await db
    .update(syncTasks)
    .set({
      status: "running",
      startedAt: now,
      lastRunAt: now,
      requestId: input.requestId ?? undefined,
      updatedAt: now,
    })
    .where(taskWhere(input.syncTaskId, input.organizationId))

  const run = await latestRun(input.syncTaskId)
  if (run) {
    await db
      .update(syncJobRuns)
      .set({
        status: "running",
        requestId: input.requestId ?? run.requestId,
        message: input.message ?? "正在调用平台 OpenAPI",
        startedAt: now,
      })
      .where(eq(syncJobRuns.id, run.id))
  }
}

export async function markSyncTaskFinished(input: {
  syncTaskId: string
  organizationId?: string
  ok: boolean
  progressDone?: number
  progressTotal?: number
  error?: string | null
  message?: string
  detail?: string
  requestId?: string | null
  httpStatus?: number
}) {
  const now = new Date()
  await db
    .update(syncTasks)
    .set({
      status: input.ok ? "success" : "failed",
      progressDone: input.progressDone ?? (input.ok ? 1 : 0),
      progressTotal: input.progressTotal ?? 1,
      error: input.ok ? null : (input.error ?? "sync failed"),
      finishedAt: now,
      lastRunAt: now,
      note: input.message,
      updatedAt: now,
      requestId: input.requestId ?? undefined,
    })
    .where(taskWhere(input.syncTaskId, input.organizationId))

  const run = await latestRun(input.syncTaskId)
  if (run) {
    await db
      .update(syncJobRuns)
      .set({
        status: input.ok ? "success" : "failed",
        httpStatus: input.httpStatus,
        message: input.message ?? (input.ok ? "同步完成" : "同步失败"),
        detail: input.detail ?? input.error ?? null,
        finishedAt: now,
        requestId: input.requestId ?? run.requestId,
      })
      .where(eq(syncJobRuns.id, run.id))
  }
}

export async function findSyncTask(syncTaskId: string) {
  const [row] = await db
    .select()
    .from(syncTasks)
    .where(eq(syncTasks.id, syncTaskId))
    .limit(1)
  return row ?? null
}
