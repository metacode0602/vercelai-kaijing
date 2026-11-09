/**
 * commerce_import_templates（模块15）。
 * 导入模板配置落库；实际批处理执行仍待导入流水表/作业。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceImportTemplates } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatDateOnly,
  formatStamp,
  toDbActiveStatus,
  toUiActiveStatus,
  type UiActiveStatus,
} from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
import {
  assertImportTemplateKind,
  validateImportTemplateFields,
} from '@/lib/settings/import-template-rules'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type ImportTemplateDto = {
  id: string
  kind: string
  version: string
  fields: string
  duplicateStrategy: string
  rollbackStrategy: string
  status: UiActiveStatus
  dbStatus: string
  note: string
  updatedAt: string
  createdAt: string
}

function mapRow(row: typeof commerceImportTemplates.$inferSelect): ImportTemplateDto {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    fields: row.fields ?? '',
    duplicateStrategy: row.duplicateStrategy ?? '',
    rollbackStrategy: row.rollbackStrategy ?? '',
    status: toUiActiveStatus(row.status),
    dbStatus: row.status,
    note: row.note ?? '',
    updatedAt: formatDateOnly(row.updatedAt),
    createdAt: formatStamp(row.createdAt),
  }
}

export async function listImportTemplates(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string } = {},
): Promise<PaginatedResult<ImportTemplateDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(commerceImportTemplates.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(commerceImportTemplates.kind, q), ilike(commerceImportTemplates.version, q))!)
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(commerceImportTemplates).where(where)
  const rows = await db
    .select()
    .from(commerceImportTemplates)
    .where(where)
    .orderBy(desc(commerceImportTemplates.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items: rows.map(mapRow), total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function getImportTemplate(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(commerceImportTemplates)
    .where(and(eq(commerceImportTemplates.organizationId, organizationId), eq(commerceImportTemplates.id, id)))
    .limit(1)
  return row ? mapRow(row) : null
}

export async function createImportTemplate(
  db: DbLike,
  organizationId: string,
  input: {
    kind: string
    version?: string
    fields?: string
    duplicateStrategy?: string
    rollbackStrategy?: string
    status?: string
    note?: string
    actorUserId?: string
    actorLabel?: string
  },
) {
  const kind = assertImportTemplateKind(input.kind)
  const fieldsParsed = validateImportTemplateFields(input.fields?.trim() || '', kind)
  const id = createId()
  const now = new Date()
  await db.insert(commerceImportTemplates).values({
    id,
    organizationId,
    kind,
    version: input.version?.trim() || 'v1',
    fields: fieldsParsed.normalized,
    duplicateStrategy: input.duplicateStrategy?.trim() || '',
    rollbackStrategy: input.rollbackStrategy?.trim() || '',
    status: toDbActiveStatus(input.status),
    note: input.note?.trim() || '',
    createdAt: now,
    updatedAt: now,
  })
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'import_template.create',
    entityType: 'import_template',
    entityId: id,
    result: 'ok',
    detail: `${kind} ${input.version?.trim() || 'v1'}`,
  })
  return getImportTemplate(db as AppDatabase, organizationId, id)
}

export async function updateImportTemplate(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    kind?: string
    version?: string
    fields?: string
    duplicateStrategy?: string
    rollbackStrategy?: string
    status?: string
    note?: string
    actorUserId?: string
    actorLabel?: string
  },
) {
  const existing = await getImportTemplate(db as AppDatabase, organizationId, input.id)
  if (!existing) throw new Error('导入模板不存在')
  const kind = assertImportTemplateKind(input.kind?.trim() ?? existing.kind)
  const fieldsRaw = input.fields ?? existing.fields
  const fieldsParsed = validateImportTemplateFields(fieldsRaw, kind)
  await db
    .update(commerceImportTemplates)
    .set({
      kind,
      version: input.version?.trim() ?? existing.version,
      fields: fieldsParsed.normalized,
      duplicateStrategy: input.duplicateStrategy ?? existing.duplicateStrategy,
      rollbackStrategy: input.rollbackStrategy ?? existing.rollbackStrategy,
      status: input.status != null ? toDbActiveStatus(input.status) : existing.dbStatus,
      note: input.note ?? existing.note,
      updatedAt: new Date(),
    })
    .where(and(eq(commerceImportTemplates.organizationId, organizationId), eq(commerceImportTemplates.id, input.id)))
  await appendAuditEvent(db, organizationId, {
    actorUserId: input.actorUserId,
    actorLabel: input.actorLabel,
    action: 'import_template.update',
    entityType: 'import_template',
    entityId: input.id,
    result: 'ok',
    detail: `更新 ${kind} · ${input.status ?? existing.status}`,
    before: { kind: existing.kind, fields: existing.fields, status: existing.status },
    after: { kind, fields: fieldsParsed.normalized, status: input.status ?? existing.status },
  })
  return getImportTemplate(db as AppDatabase, organizationId, input.id)
}
