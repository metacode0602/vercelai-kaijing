import 'server-only'

import { db } from '@/lib/db'
import {
  autoMatchSlaBitableFields,
  getCanonicalHeadersForSlaSyncKind,
} from '@/lib/server/integrations/feishu/sla-bitable-field-mapper'
import { listFeishuBitableFields } from '@/lib/server/integrations/feishu/bitable-client'
import { loadFeishuRuntimeConfig } from '@/lib/server/integrations/feishu/config'
import type {
  SlaBitableFieldMapping,
  SlaBitableFieldMatchSuggestion,
  SlaBitableSyncConfigDto,
  SlaBitableSyncCursor,
  SlaBitableSyncKind,
} from '@/lib/types/sla-bitable-import'
import { SLA_BITABLE_SYNC_KINDS } from '@/lib/types/sla-bitable-import'
import { slaBitableSyncConfig } from '@workspace/db/schema'
import { desc, eq } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

function parseSyncKind(raw: string): SlaBitableSyncKind {
  if ((SLA_BITABLE_SYNC_KINDS as readonly string[]).includes(raw)) {
    return raw as SlaBitableSyncKind
  }
  throw new Error(`无效的 syncKind：${raw}`)
}

function parseFieldMapping(raw: unknown): SlaBitableFieldMapping {
  if (!raw || typeof raw !== 'object') return {}
  const mapping: SlaBitableFieldMapping = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) {
      mapping[key] = value.trim()
    }
  }
  return mapping
}

function mapConfigRow(row: typeof slaBitableSyncConfig.$inferSelect): SlaBitableSyncConfigDto {
  return {
    id: row.id,
    syncKind: parseSyncKind(row.syncKind),
    name: row.name,
    appToken: row.appToken,
    tableId: row.tableId,
    viewId: row.viewId,
    fieldMappingJson: parseFieldMapping(row.fieldMappingJson),
    filterFormula: row.filterFormula,
    cronExpr: row.cronExpr,
    autoCommit: row.autoCommit,
    cursorJson: (row.cursorJson as SlaBitableSyncCursor) ?? {},
    enabled: row.enabled,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const slaBitableSyncConfigDataAccess = {
  async listConfigs(): Promise<SlaBitableSyncConfigDto[]> {
    const rows = await db
      .select()
      .from(slaBitableSyncConfig)
      .orderBy(desc(slaBitableSyncConfig.updatedAt))
    return rows.map(mapConfigRow)
  },

  async getConfig(configId: string): Promise<SlaBitableSyncConfigDto | null> {
    const [row] = await db
      .select()
      .from(slaBitableSyncConfig)
      .where(eq(slaBitableSyncConfig.id, configId))
      .limit(1)
    return row ? mapConfigRow(row) : null
  },

  async upsertConfig(input: {
    id?: string
    syncKind: SlaBitableSyncKind
    name: string
    appToken: string
    tableId: string
    viewId?: string | null
    fieldMappingJson: SlaBitableFieldMapping
    filterFormula?: string | null
    cronExpr?: string
    autoCommit?: boolean
    enabled?: boolean
  }): Promise<SlaBitableSyncConfigDto> {
    const id = input.id ?? newId()
    const existing = input.id
      ? await db
          .select({ id: slaBitableSyncConfig.id })
          .from(slaBitableSyncConfig)
          .where(eq(slaBitableSyncConfig.id, input.id))
          .limit(1)
          .then((rows) => rows[0])
      : null

    const values = {
      syncKind: input.syncKind,
      name: input.name.trim(),
      appToken: input.appToken.trim(),
      tableId: input.tableId.trim(),
      viewId: input.viewId?.trim() || null,
      fieldMappingJson: input.fieldMappingJson,
      filterFormula: input.filterFormula?.trim() || null,
      cronExpr: input.cronExpr?.trim() || '30 * * * *',
      autoCommit: input.autoCommit ?? false,
      enabled: input.enabled ?? true,
    }

    if (existing) {
      await db.update(slaBitableSyncConfig).set(values).where(eq(slaBitableSyncConfig.id, id))
    } else {
      await db.insert(slaBitableSyncConfig).values({ id, ...values })
    }

    const dto = await this.getConfig(id)
    if (!dto) throw new Error('保存后读取配置失败')
    return dto
  },

  async deleteConfig(configId: string): Promise<void> {
    await db.delete(slaBitableSyncConfig).where(eq(slaBitableSyncConfig.id, configId))
  },

  async listBitableTableFields(input: {
    syncKind: SlaBitableSyncKind
    appToken: string
    tableId: string
  }): Promise<{
    fields: SlaBitableFieldMatchSuggestion[]
    suggestedMapping: SlaBitableFieldMapping
    canonicalHeaders: string[]
  }> {
    const runtimeConfig = loadFeishuRuntimeConfig()
    if (!runtimeConfig?.enabled) {
      throw new Error('飞书集成未配置或未启用')
    }

    const bitableFields = await listFeishuBitableFields(
      runtimeConfig,
      input.appToken.trim(),
      input.tableId.trim(),
    )
    const suggestedMapping = autoMatchSlaBitableFields(bitableFields, input.syncKind)
    const canonicalHeaders = getCanonicalHeadersForSlaSyncKind(input.syncKind)

    const reverseSuggested = new Map<string, string>()
    for (const [header, fieldId] of Object.entries(suggestedMapping)) {
      if (fieldId) reverseSuggested.set(fieldId, header)
    }

    const fields: SlaBitableFieldMatchSuggestion[] = bitableFields.map((field) => ({
      fieldId: field.field_id,
      fieldName: field.field_name,
      type: field.type,
      suggestedCanonicalHeader: reverseSuggested.get(field.field_id) ?? null,
    }))

    return { fields, suggestedMapping, canonicalHeaders }
  },
}
