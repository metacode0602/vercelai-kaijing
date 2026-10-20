import 'server-only'

import { db } from '@/lib/db'
import { slaBitableSyncConfigDataAccess } from '@/lib/server/dataaccess/integrations/feishu/sla-bitable-sync-config'
import { slaBitableImportDataAccess } from '@/lib/server/dataaccess/supplier/sla-bitable-import'
import { supplierError, supplierLog, supplierWarn } from '@/lib/server/dataaccess/supplier/logger'
import {
  computeNextCursor,
  filterRecordsByCursor,
} from '@/lib/server/integrations/feishu/sla-bitable-field-mapper'
import { listFeishuBitableRecords } from '@/lib/server/integrations/feishu/bitable-client'
import { loadFeishuRuntimeConfig } from '@/lib/server/integrations/feishu/config'
import { isFeishuBitableSyncEnabled } from '@/lib/server/jobs/feishu-bitable-sync/bitable-sync-config'
import type { SlaBitableSyncRunResult } from '@/lib/types/sla-bitable-import'
import { feishuIntegrationJobRun, slaBitableSyncConfig } from '@workspace/db/schema'
import { eq, sql } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

function syncLockKey(configId: string): number {
  const str = `feishu-sla-bitable:${configId}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

async function tryAcquireLock(key: number): Promise<boolean> {
  const result = await db.execute<{ acquired: boolean }>(
    sql`SELECT pg_try_advisory_lock(${key}) AS acquired`,
  )
  return Boolean(result.rows[0]?.acquired)
}

async function releaseLock(key: number): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_unlock(${key})`)
}

export async function runSlaBitableSync(input: {
  configId: string
  trigger: 'scheduled' | 'manual'
  forceFullSync?: boolean
  operatorStaffId?: string | null
  previewOnly?: boolean
}): Promise<SlaBitableSyncRunResult> {
  const config = await slaBitableSyncConfigDataAccess.getConfig(input.configId)
  if (!config) {
    throw new Error('同步配置不存在')
  }

  const runtimeConfig = loadFeishuRuntimeConfig()
  const jobRunId = newId()
  const now = new Date()
  const lockKey = syncLockKey(config.id)

  await db.insert(feishuIntegrationJobRun).values({
    id: jobRunId,
    jobKind: 'sla_bitable_sync',
    status: 'running',
    refDomain: 'sla_bitable_sync_config',
    refId: config.id,
    requestSummary: {
      trigger: input.trigger,
      syncKind: config.syncKind,
      forceFullSync: Boolean(input.forceFullSync),
      previewOnly: Boolean(input.previewOnly),
    },
    startedAt: now,
  })

  await db
    .update(slaBitableSyncConfig)
    .set({ lastRunAt: now })
    .where(eq(slaBitableSyncConfig.id, config.id))

  if (!isFeishuBitableSyncEnabled() || !runtimeConfig?.enabled) {
    await db
      .update(feishuIntegrationJobRun)
      .set({
        status: 'skipped',
        finishedAt: new Date(),
        errorMessage: '飞书集成或 Bitable 同步未启用',
      })
      .where(eq(feishuIntegrationJobRun.id, jobRunId))
    return { jobRunId, status: 'skipped', message: '飞书集成或 Bitable 同步未启用' }
  }

  if (!config.enabled && input.trigger === 'scheduled') {
    await db
      .update(feishuIntegrationJobRun)
      .set({
        status: 'skipped',
        finishedAt: new Date(),
        errorMessage: '同步配置已禁用',
      })
      .where(eq(feishuIntegrationJobRun.id, jobRunId))
    return { jobRunId, status: 'skipped', message: '同步配置已禁用' }
  }

  const acquired = await tryAcquireLock(lockKey)
  if (!acquired) {
    await db
      .update(feishuIntegrationJobRun)
      .set({
        status: 'skipped',
        finishedAt: new Date(),
        errorMessage: '其他实例正在同步该配置',
      })
      .where(eq(feishuIntegrationJobRun.id, jobRunId))
    return { jobRunId, status: 'skipped', message: '其他实例正在同步该配置' }
  }

  try {
    const cursor = input.forceFullSync ? {} : config.cursorJson
    const allRecords = await listFeishuBitableRecords({
      config: runtimeConfig,
      appToken: config.appToken,
      tableId: config.tableId,
      viewId: config.viewId,
      filterFormula: config.filterFormula,
    })
    const records = filterRecordsByCursor(allRecords, cursor)

    if (records.length === 0) {
      const emptyPreview = {
        batchId: newId(),
        syncKind: config.syncKind,
        configId: config.id,
        configName: config.name,
        recordCount: 0,
        sourceRowCount: 0,
        okCount: 0,
        warningCount: 0,
        errorCount: 0,
        unmatchedMasterDataCount: 0,
        parseError: null,
        missingRequiredHeaders: [],
        rows: [],
      }
      await db
        .update(feishuIntegrationJobRun)
        .set({
          status: 'success',
          finishedAt: new Date(),
          responseSummary: { preview: emptyPreview, message: '无增量记录' },
        })
        .where(eq(feishuIntegrationJobRun.id, jobRunId))
      await db
        .update(slaBitableSyncConfig)
        .set({ lastSuccessAt: new Date() })
        .where(eq(slaBitableSyncConfig.id, config.id))
      return { jobRunId, status: 'success', message: '无增量记录', preview: emptyPreview }
    }

    const batchId = newId()
    const preview = await slaBitableImportDataAccess.buildPreviewFromRecords({
      config,
      records,
      batchId,
      operatorStaffId: input.operatorStaffId,
    })

    if (preview.parseError) {
      await db
        .update(feishuIntegrationJobRun)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          responseSummary: { preview },
          errorMessage: preview.parseError,
        })
        .where(eq(feishuIntegrationJobRun.id, jobRunId))
      return { jobRunId, status: 'failed', preview, message: preview.parseError }
    }

    const shouldCommit = config.autoCommit && !input.previewOnly && preview.errorCount === 0

    if (!shouldCommit) {
      await db
        .update(feishuIntegrationJobRun)
        .set({
          status: 'success',
          finishedAt: new Date(),
          responseSummary: { preview, autoCommit: false },
        })
        .where(eq(feishuIntegrationJobRun.id, jobRunId))
      await db
        .update(slaBitableSyncConfig)
        .set({ lastSuccessAt: new Date(), cursorJson: computeNextCursor(allRecords) })
        .where(eq(slaBitableSyncConfig.id, config.id))
      supplierLog('sla-bitable-sync', 'parsed only', {
        configId: config.id,
        syncKind: config.syncKind,
        rows: preview.sourceRowCount,
      })
      return {
        jobRunId,
        status: 'success',
        preview,
        message: input.previewOnly ? '试跑完成' : '已解析，未自动入库（auto_commit=false）',
      }
    }

    const importableRows = preview.rows.filter((r) => r.selectable)
    const commit = await slaBitableImportDataAccess.commitPreview({
      batchId: preview.batchId,
      syncKind: config.syncKind,
      rows: importableRows,
      operatorStaffId: input.operatorStaffId,
    })

    const status =
      commit.failed > 0 && commit.created + commit.updated > 0
        ? 'partial'
        : commit.failed > 0
          ? 'failed'
          : 'success'

    await db
      .update(feishuIntegrationJobRun)
      .set({
        status,
        finishedAt: new Date(),
        responseSummary: { preview, commit },
        errorMessage: commit.failed > 0 ? `部分失败：${commit.failed} 条` : null,
      })
      .where(eq(feishuIntegrationJobRun.id, jobRunId))

    await db
      .update(slaBitableSyncConfig)
      .set({ lastSuccessAt: new Date(), cursorJson: computeNextCursor(allRecords) })
      .where(eq(slaBitableSyncConfig.id, config.id))

    return {
      jobRunId,
      status,
      preview,
      commit,
      message: `同步完成，新建 ${commit.created}、更新 ${commit.updated} 条 SLA 中台数据`,
    }
  } catch (error) {
    supplierError('sla-bitable-sync', 'run failed', error, { configId: config.id })
    await db
      .update(feishuIntegrationJobRun)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : '同步失败',
      })
      .where(eq(feishuIntegrationJobRun.id, jobRunId))
    throw error
  } finally {
    await releaseLock(lockKey)
  }
}

export async function runAllEnabledSlaBitableSyncs(input: {
  trigger: 'scheduled' | 'manual'
}): Promise<void> {
  const configs = await slaBitableSyncConfigDataAccess.listConfigs()
  const enabled = configs.filter((c) => c.enabled)

  for (const config of enabled) {
    try {
      await runSlaBitableSync({ configId: config.id, trigger: input.trigger })
    } catch (error) {
      supplierWarn('sla-bitable-sync', 'scheduled config failed', {
        configId: config.id,
        syncKind: config.syncKind,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export async function previewSlaBitableSync(input: {
  configId: string
  forceFullSync?: boolean
  operatorStaffId?: string | null
}): Promise<SlaBitableSyncRunResult> {
  return runSlaBitableSync({
    ...input,
    trigger: 'manual',
    previewOnly: true,
  })
}
