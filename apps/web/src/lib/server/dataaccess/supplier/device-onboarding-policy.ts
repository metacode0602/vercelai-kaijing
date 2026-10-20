import { db } from '@/lib/db'
import {
  deviceOnboardingPolicy,
  deviceOnboardingPolicyBatch,
  deviceOnboardingTask,
  supplierDevice,
  onboardingBatch,
  type DeviceOnboardingPolicy,
  type NewDeviceOnboardingPolicy,
  type DeviceOnboardingPolicyBatch,
  type NewDeviceOnboardingPolicyBatch,
  type DeviceOnboardingTask,
  type NewDeviceOnboardingTask,
} from '@workspace/db/schema'
import { eq, and, desc, count, sql, inArray } from 'drizzle-orm'

export interface PolicyListInput {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export const deviceOnboardingPolicyDataAccess = {
  /**
   * 列表查询（分页）
   */
  async list(input: PolicyListInput): Promise<PaginatedResult<DeviceOnboardingPolicy>> {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const [totalRow] = await db.select({ total: count() }).from(deviceOnboardingPolicy)

    const total = Number(totalRow?.total ?? 0)

    const rows = await db
      .select()
      .from(deviceOnboardingPolicy)
      .orderBy(desc(deviceOnboardingPolicy.createdAt))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows,
      total,
      page,
      pageSize,
    }
  },

  /**
   * 获取单个策略
   */
  async getById(id: string): Promise<DeviceOnboardingPolicy | null> {
    const rows = await db
      .select()
      .from(deviceOnboardingPolicy)
      .where(eq(deviceOnboardingPolicy.id, id))
      .limit(1)

    return rows[0] ?? null
  },

  /**
   * 创建策略模板
   */
  async create(
    input: Omit<NewDeviceOnboardingPolicy, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<DeviceOnboardingPolicy> {
    const now = new Date()

    const [policy] = await db
      .insert(deviceOnboardingPolicy)
      .values({
        name: input.name,
        description: input.description ?? null,
        policyJson: input.policyJson,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    if (!policy) {
      throw new Error('Failed to create onboarding policy')
    }

    return policy
  },

  /**
   * 更新策略模板
   */
  async update(
    id: string,
    input: Partial<Pick<DeviceOnboardingPolicy, 'name' | 'description' | 'policyJson'>>,
  ): Promise<DeviceOnboardingPolicy | null> {
    const [updated] = await db
      .update(deviceOnboardingPolicy)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(deviceOnboardingPolicy.id, id))
      .returning()

    return updated ?? null
  },

  /**
   * 删除策略模板
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(deviceOnboardingPolicy)
      .where(eq(deviceOnboardingPolicy.id, id))

    return true
  },

  /**
   * 应用策略到批次（创建关联 + 生成任务）
   */
  async applyToBatch(
    batchId: string,
    policyId: string,
    appliedBy: string,
    deviceOverrides?: any[],
  ): Promise<{ policyBatch: DeviceOnboardingPolicyBatch; tasksCreated: number }> {
    return await db.transaction(async (tx) => {
      // 1. 查询策略
      const [policy] = await tx
        .select()
        .from(deviceOnboardingPolicy)
        .where(eq(deviceOnboardingPolicy.id, policyId))
        .limit(1)

      if (!policy) {
        throw new Error(`Policy not found: ${policyId}`)
      }

      // 2. 查询批次
      const [batch] = await tx
        .select()
        .from(onboardingBatch)
        .where(eq(onboardingBatch.id, batchId))
        .limit(1)

      if (!batch) {
        throw new Error(`Batch not found: ${batchId}`)
      }

      // 3. 创建策略-批次关联
      const [policyBatch] = await tx
        .insert(deviceOnboardingPolicyBatch)
        .values({
          policyId,
          batchId,
          deviceOverrides: deviceOverrides ?? [],
          appliedBy,
          appliedAt: new Date(),
        })
        .returning()

      if (!policyBatch) {
        throw new Error('Failed to bind policy to onboarding batch')
      }

      // 4. 查询批次下审核通过的设备
      const devices = await tx
        .select()
        .from(supplierDevice)
        .where(
          and(
            eq(supplierDevice.onboardingBatchId, batchId),
            eq(supplierDevice.reviewStatus, 'approved'),
          ),
        )

      // 5. 为每台设备创建任务
      const tasksToCreate: NewDeviceOnboardingTask[] = devices.map((device) => ({
        supplierDeviceId: device.id,
        batchId,
        agentId: null,
        policyJson: policy.policyJson,
        stage: 'pending',
        stageStatus: 'waiting',
        stageStartedAt: null,
        stageCompletedAt: null,
        stageError: null,
        retryCount: 0,
        maxRetries: 3,
        payload: {
          ip: device.internalIp,
          username: device.loginUsername,
          password: device.loginPassword,
          gpu_card_type: device.gpuCardTypeId,
          gpu_count: device.gpuCount,
          // TODO: 补充更多编排信息
        },
        nodeName: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      if (tasksToCreate.length > 0) {
        await tx.insert(deviceOnboardingTask).values(tasksToCreate)
      }

      return {
        policyBatch,
        tasksCreated: tasksToCreate.length,
      }
    })
  },

  /**
   * 获取批次关联的策略
   */
  async getPolicyByBatchId(batchId: string): Promise<DeviceOnboardingPolicyBatch | null> {
    const rows = await db
      .select()
      .from(deviceOnboardingPolicyBatch)
      .where(eq(deviceOnboardingPolicyBatch.batchId, batchId))
      .limit(1)

    return rows[0] ?? null
  },

  /**
   * 获取批次下的任务列表
   */
  async getTasksByBatchId(batchId: string): Promise<DeviceOnboardingTask[]> {
    const tasks = await db
      .select()
      .from(deviceOnboardingTask)
      .where(eq(deviceOnboardingTask.batchId, batchId))
      .orderBy(desc(deviceOnboardingTask.createdAt))

    return tasks
  },

  /**
   * 手动重试失败任务
   */
  async retryFailedTask(taskId: string): Promise<boolean> {
    const [updated] = await db
      .update(deviceOnboardingTask)
      .set({
        stage: 'pending',
        stageStatus: 'waiting',
        stageError: null,
        retryCount: 0,
        updatedAt: new Date(),
      })
      .where(and(eq(deviceOnboardingTask.id, taskId), eq(deviceOnboardingTask.stage, 'failed')))
      .returning()

    return !!updated
  },
}
