import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../lib/db'
import {
  deviceOnboardingTask,
  supplierDevice,
  dataCenter,
  agentRegistry,
} from '@workspace/db/schema'
import { eq, and, or } from 'drizzle-orm'
import { env } from '../lib/env'
import { autoListDevice } from '../lib/auto-listing'

const agent = new Hono()

/**
 * Agent API 鉴权：请求头 X-Agent-API-Key 必须与环境变量 AGENT_API_KEY 一致
 */
agent.use('*', async (c, next) => {
  const apiKey = c.req.header('X-Agent-API-Key')
  if (!apiKey) {
    return c.json({ error: 'Missing X-Agent-API-Key header' }, 401)
  }
  if (apiKey !== env.AGENT_API_KEY) {
    return c.json({ error: 'Invalid X-Agent-API-Key' }, 401)
  }
  await next()
})

/**
 * POST /api/agent/register
 * Agent 注册，绑定 data_center
 */
agent.post(
  '/register',
  zValidator(
    'json',
    z.object({
      agentId: z.string().min(1),
      agentVersion: z.string().min(1),
      dataCenterCode: z.string().min(1),
      hostname: z.string().optional(),
      osInfo: z.string().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')

    // 查询机房
    const dcResult = await db
      .select({ id: dataCenter.id })
      .from(dataCenter)
      .where(eq(dataCenter.code, body.dataCenterCode))
      .limit(1)

    const [dc] = dcResult
    if (!dc) {
      return c.json({ error: `Data center not found: ${body.dataCenterCode}` }, 404)
    }

    const now = new Date()
    const existing = await db
      .select({ id: agentRegistry.id })
      .from(agentRegistry)
      .where(eq(agentRegistry.agentId, body.agentId))
      .limit(1)

    if (existing.length) {
      await db
        .update(agentRegistry)
        .set({
          agentVersion: body.agentVersion,
          dataCenterId: dc.id,
          hostname: body.hostname,
          osInfo: body.osInfo,
          status: 'online',
          lastHeartbeatAt: now,
          updatedAt: now,
        })
        .where(eq(agentRegistry.agentId, body.agentId))
    } else {
      await db.insert(agentRegistry).values({
        id: crypto.randomUUID(),
        agentId: body.agentId,
        agentVersion: body.agentVersion,
        dataCenterId: dc.id,
        hostname: body.hostname,
        osInfo: body.osInfo,
        status: 'online',
        lastHeartbeatAt: now,
      })
    }

    return c.json({
      success: true,
      agentId: body.agentId,
      dataCenterId: dc.id,
      message: 'Agent registered successfully',
    })
  },
)

/**
 * POST /api/agent/heartbeat
 * Agent 心跳上报（30s）
 */
agent.post(
  '/heartbeat',
  zValidator(
    'json',
    z.object({
      agentId: z.string().min(1),
      status: z.enum(['online', 'busy', 'offline']),
      runningTasks: z.array(z.string()).optional(),
      metrics: z
        .object({
          cpuPercent: z.number().optional(),
          memoryPercent: z.number().optional(),
        })
        .optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')

    const now = new Date()
    const updated = await db
      .update(agentRegistry)
      .set({
        status: body.status,
        runningTaskIds: body.runningTasks ?? [],
        metrics: body.metrics,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(agentRegistry.agentId, body.agentId))
      .returning({ id: agentRegistry.id })

    if (!updated.length) {
      // 未注册过的 Agent：以心跳隐式注册（dataCenter 未知，仅记存活）
      await db.insert(agentRegistry).values({
        id: crypto.randomUUID(),
        agentId: body.agentId,
        agentVersion: 'unknown',
        status: body.status,
        runningTaskIds: body.runningTasks ?? [],
        metrics: body.metrics,
        lastHeartbeatAt: now,
      })
    }

    return c.json({
      success: true,
      agentId: body.agentId,
      timestamp: now.toISOString(),
    })
  },
)

/**
 * GET /api/agent/tasks/pending
 * 拉取该 data_center 的待执行任务
 */
agent.get('/tasks/pending', async (c) => {
  const agentId = c.req.query('agentId')
  const dataCenterCode = c.req.query('dataCenterCode')

  if (!agentId || !dataCenterCode) {
    return c.json({ error: 'Missing agentId or dataCenterCode query parameter' }, 400)
  }

  // 查询机房
  const dcResult = await db
    .select({ id: dataCenter.id })
    .from(dataCenter)
    .where(eq(dataCenter.code, dataCenterCode))
    .limit(1)

  if (!dcResult.length) {
    return c.json({ error: `Data center not found: ${dataCenterCode}` }, 404)
  }

  const dataCenterId = dcResult[0]!.id

  // 查询待执行任务（pending 阶段且关联该机房的设备）
  const tasks = await db
    .select({
      task: deviceOnboardingTask,
      device: supplierDevice,
    })
    .from(deviceOnboardingTask)
    .innerJoin(supplierDevice, eq(deviceOnboardingTask.supplierDeviceId, supplierDevice.id))
    .where(
      and(
        eq(deviceOnboardingTask.stage, 'pending'),
        eq(supplierDevice.dataCenterId, dataCenterId),
        or(
          eq(deviceOnboardingTask.agentId, agentId),
          eq(deviceOnboardingTask.agentId, ''),
        ),
      ),
    )
    .limit(10)

  return c.json({
    tasks: tasks.map((t) => ({
      id: t.task.id,
      supplierDeviceId: t.task.supplierDeviceId,
      batchId: t.task.batchId,
      stage: t.task.stage,
      policyJson: t.task.policyJson,
      payload: t.task.payload,
      retryCount: t.task.retryCount,
      maxRetries: t.task.maxRetries,
      device: {
        sn: t.device.sn,
        internalIp: t.device.internalIp,
        externalIp: t.device.externalIp,
        loginUsername: t.device.loginUsername,
        gpuCount: t.device.gpuCount,
        gpuCardTypeId: t.device.gpuCardTypeId,
      },
    })),
  })
})

/**
 * PATCH /api/agent/tasks/:taskId
 * 上报任务结果（阶段/完成/失败）
 */
agent.patch(
  '/tasks/:taskId',
  zValidator(
    'json',
    z.object({
      agentId: z.string().min(1),
      stage: z
        .enum([
          'pending',
          'ssh_verify',
          'gpu_detect',
          'env_init',
          'k8s_join',
          'gpu_label',
          'completed',
          'failed',
        ])
        .optional(),
      stageStatus: z.enum(['waiting', 'running', 'success', 'error']).optional(),
      stageError: z.string().optional(),
      nodeName: z.string().optional(),
      stageResults: z.any().optional(),
    }),
  ),
  async (c) => {
    const taskId = c.req.param('taskId')
    const body = c.req.valid('json')

    // 查询任务
    const taskResult = await db
      .select()
      .from(deviceOnboardingTask)
      .where(eq(deviceOnboardingTask.id, taskId))
      .limit(1)

    if (!taskResult.length) {
      return c.json({ error: `Task not found: ${taskId}` }, 404)
    }

    const task = taskResult[0]!

    // 更新任务状态
    const updateData: any = {
      updatedAt: new Date(),
    }

    if (body.stage) {
      updateData.stage = body.stage
    }

    if (body.stageStatus) {
      updateData.stageStatus = body.stageStatus
    }

    if (body.stageError) {
      updateData.stageError = body.stageError
    }

    if (body.nodeName) {
      updateData.nodeName = body.nodeName
    }

    if (body.stage === 'completed') {
      updateData.completedAt = new Date()
      // 更新设备状态
      await db
        .update(supplierDevice)
        .set({
          opsStatus: '在集群中',
          lifecycleStatus: 'online',
          updatedAt: new Date(),
        })
        .where(eq(supplierDevice.id, task.supplierDeviceId))

      // 即时上架评估（失败不影响任务上报成功）
      try {
        const listed = await autoListDevice(task.supplierDeviceId)
        if (listed) {
          console.info('[agent] auto-listed device after task completed', {
            taskId,
            deviceId: task.supplierDeviceId,
          })
        }
      } catch (err) {
        console.error('[agent] auto-list after task completed failed', {
          taskId,
          deviceId: task.supplierDeviceId,
          err,
        })
      }
    } else if (body.stage === 'failed') {
      updateData.completedAt = new Date()
      // 失败后可能需要重试
      if (task.retryCount < task.maxRetries) {
        updateData.retryCount = task.retryCount + 1
        updateData.stage = 'pending'
        updateData.stageStatus = 'waiting'
      }
    }

    await db
      .update(deviceOnboardingTask)
      .set(updateData)
      .where(eq(deviceOnboardingTask.id, taskId))

    return c.json({
      success: true,
      taskId,
      stage: updateData.stage || task.stage,
      message: 'Task updated successfully',
    })
  },
)

/**
 * GET /api/agent/version
 * 最新 Agent 版本号
 */
agent.get('/version', async (c) => {
  const version = env.AGENT_VERSION
  const cdnBase = env.AGENT_CDN_BASE_URL?.replace(/\/$/, '')
  const file = 'agent-linux-amd64'
  const downloadUrl = cdnBase
    ? `${cdnBase}/${version}/${file}`
    : `/api/agent/downloads/${version}/${file}`
  return c.json({
    version,
    downloadUrl,
    cdnConfigured: Boolean(cdnBase),
  })
})

/**
 * GET /api/agent/downloads/:version/:file
 * 下载 Agent 二进制
 */
agent.get('/downloads/:version/:file', async (c) => {
  const version = c.req.param('version')
  const file = c.req.param('file')

  // 安全：仅允许字母数字、点、短横线、下划线
  if (!/^[a-zA-Z0-9._-]+$/.test(version) || !/^[a-zA-Z0-9._-]+$/.test(file)) {
    return c.json({ error: 'Invalid version or file name' }, 400)
  }

  const cdnBase = env.AGENT_CDN_BASE_URL?.replace(/\/$/, '')
  if (cdnBase) {
    return c.redirect(`${cdnBase}/${version}/${file}`, 302)
  }

  // Stub：未配置 CDN 时返回可机读说明，避免 Agent 误把 HTML 当二进制
  return c.json(
    {
      error: 'Agent binary CDN not configured',
      message:
        'Set AGENT_CDN_BASE_URL to an HTTPS origin that hosts agent binaries under /{version}/{file}.',
      version,
      file,
      expectedPath: `/{version}/{file}`,
    },
    501,
  )
})

export default agent
