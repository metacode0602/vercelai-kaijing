import { db } from "./db"
import { apiTask, merchant, billingTenant } from "@workspace/db/schema"
import { eq, and, desc, sql } from "drizzle-orm"
import { nanoid } from "nanoid"

export interface CreateTaskInput {
  name: string
  type: "job" | "serverless" | "vm" | "spot"
  merchantId: string
  tenantId: string
  gpuCardType?: string
  gpuCount?: number
  imageId?: string
  command?: string
  config?: Record<string, unknown>
}

export interface UpdateTaskInput {
  status?: "cancelled"
  config?: Record<string, unknown>
}

export interface TaskFilter {
  merchantId?: string
  tenantId?: string
  status?: string
  limit?: number
  offset?: number
}

export type TaskType = "job" | "serverless" | "vm" | "spot"
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface Task {
  id: string
  name: string
  type: TaskType
  status: TaskStatus
  merchantId: string
  tenantId: string
  gpuCardType: string | null
  gpuCount: number | null
  imageId: string | null
  command: string | null
  config: Record<string, unknown>
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

async function validateMerchantTenant(merchantId: string, tenantId: string): Promise<boolean> {
  // 验证商户存在且 OEM 已启用
  const merchantRow = await db.query.merchant.findFirst({
    where: eq(merchant.id, merchantId),
    columns: {
      id: true,
      oemEnabled: true,
      status: true,
    },
  })

  if (!merchantRow) return false
  if (!merchantRow.oemEnabled) return false
  if (merchantRow.status !== "active") return false

  // 验证租户存在且归属该商户
  const tenantRow = await db.query.billingTenant.findFirst({
    where: eq(billingTenant.id, tenantId),
    columns: {
      id: true,
      merchantId: true,
    },
  })

  if (!tenantRow) return false
  if (tenantRow.merchantId !== merchantId) return false

  return true
}

/**
 * 创建任务
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  // 验证权限
  const isValid = await validateMerchantTenant(input.merchantId, input.tenantId)
  if (!isValid) {
    throw new Error("Invalid merchantId or tenant does not belong to merchant")
  }

  const taskId = `task_${nanoid()}`

  // TODO: 与计算后端集成（SkyPilot / Kubernetes）
  // const backendTaskId = await submitToBackend(input)

  const [task] = await db
    .insert(apiTask)
    .values({
      id: taskId,
      merchantId: input.merchantId,
      tenantId: input.tenantId,
      name: input.name,
      type: input.type,
      status: "pending",
      gpuCardType: input.gpuCardType ?? null,
      gpuCount: input.gpuCount ?? null,
      imageId: input.imageId ?? null,
      command: input.command ?? null,
      config: input.config ?? {},
      backendTaskId: null, // TODO: 设置实际的 backendTaskId
    })
    .returning()

  if (!task) {
    throw new Error("Failed to create task")
  }

  return mapTask(task)
}

/**
 * 查询任务列表
 */
export async function listTasks(filter: TaskFilter): Promise<{ tasks: Task[]; total: number }> {
  const conditions: ReturnType<typeof and>[] = []

  if (filter.merchantId) {
    conditions.push(eq(apiTask.merchantId, filter.merchantId))
  }
  if (filter.tenantId) {
    conditions.push(eq(apiTask.tenantId, filter.tenantId))
  }
  if (filter.status) {
    conditions.push(eq(apiTask.status, filter.status))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  // 查询总数
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(apiTask)
    .where(where)

  const total = totalRow?.count ?? 0

  // 查询任务列表
  const tasks = await db
    .select()
    .from(apiTask)
    .where(where)
    .orderBy(desc(apiTask.createdAt))
    .limit(filter.limit ?? 20)
    .offset(filter.offset ?? 0)

  return {
    tasks: tasks.map(mapTask),
    total,
  }
}

/**
 * 获取任务详情
 */
export async function getTask(taskId: string, merchantId?: string): Promise<Task | null> {
  const conditions = [eq(apiTask.id, taskId)]
  if (merchantId) {
    conditions.push(eq(apiTask.merchantId, merchantId))
  }

  const task = await db.query.apiTask.findFirst({
    where: and(...conditions),
  })

  if (!task) return null
  return mapTask(task)
}

/**
 * 更新任务
 */
export async function updateTask(
  taskId: string,
  merchantId: string,
  updates: UpdateTaskInput,
): Promise<Task | null> {
  const existing = await getTask(taskId, merchantId)
  if (!existing) return null

  const updateData: Partial<typeof apiTask.$inferInsert> = {}

  if (updates.status === "cancelled") {
    updateData.status = "cancelled"
    updateData.completedAt = new Date()
    // TODO: 调用后端取消任务
  }

  if (updates.config) {
    updateData.config = updates.config
  }

  if (Object.keys(updateData).length === 0) {
    return existing
  }

  const [updated] = await db
    .update(apiTask)
    .set(updateData)
    .where(and(eq(apiTask.id, taskId), eq(apiTask.merchantId, merchantId)))
    .returning()

  return updated ? mapTask(updated) : null
}

/**
 * 获取任务状态（轻量级）
 */
export async function getTaskStatus(
  taskId: string,
  merchantId?: string,
): Promise<{ id: string; status: TaskStatus; progress: number; message: string | null } | null> {
  const conditions = [eq(apiTask.id, taskId)]
  if (merchantId) {
    conditions.push(eq(apiTask.merchantId, merchantId))
  }

  const task = await db.query.apiTask.findFirst({
    where: and(...conditions),
    columns: {
      id: true,
      status: true,
      progress: true,
      message: true,
    },
  })

  if (!task) return null

  return {
    id: task.id,
    status: task.status as TaskStatus,
    progress: task.progress,
    message: task.message,
  }
}

function mapTask(row: typeof apiTask.$inferSelect): Task {
  return {
    id: row.id,
    name: row.name,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    merchantId: row.merchantId,
    tenantId: row.tenantId,
    gpuCardType: row.gpuCardType,
    gpuCount: row.gpuCount,
    imageId: row.imageId,
    command: row.command,
    config: row.config as Record<string, unknown>,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
