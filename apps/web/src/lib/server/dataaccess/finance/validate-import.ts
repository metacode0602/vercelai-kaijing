import { db } from '@/lib/db'
import {
  billingPeriod,
  billingPeriodImportBatch,
  billingPeriodRawTenantBill,
  billingTenant,
} from '@workspace/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import type { ImportFileType } from './constants'
import type { ImportCellError } from './import-errors'
import { buildMarkedErrorWorkbookBuffer } from './import-errors'
import { parseWorkbookDetailed } from './excel-parser'
import { listTenantBillWindows } from './tenant-bill-windows'
export {
  findMissingBaremetalPlatformListPrice,
  findMissingTenantBillPricing,
  findMissingTenantBillPricingAtPeriodEnd,
  type MissingPricingIssue,
  type MissingPricingPair,
  type PricingFailureReason,
} from './tenant-bill-pricing'

async function importStorageLocal() {
  return import('./import-storage-local')
}

export type CrossFileValidation = {
  ok: boolean
  errorsByFileType: Partial<Record<ImportFileType, ImportCellError[]>>
}

async function loadKnownPlatformTenants(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db
    .select({ platformId: billingTenant.platformTenantId })
    .from(billingTenant)
    .where(inArray(billingTenant.platformTenantId, ids))
  return new Set(rows.map((r) => r.platformId).filter(Boolean) as string[])
}

/** 返回在 CRM billing_tenant 中存在的平台租户 ID 集合 */
export async function getKnownPlatformTenantIds(ids: string[]): Promise<Set<string>> {
  return loadKnownPlatformTenants(ids)
}

/** 裸金属 + 客户账单详情就绪后，列出账单中未在 CRM 主数据维护的租户行（仅作提示，不阻断成本计算） */
export async function validateCrossFileImports(
  periodId: string,
): Promise<CrossFileValidation> {
  const batches = await db.query.billingPeriodImportBatch.findMany({
    where: eq(billingPeriodImportBatch.billingPeriodId, periodId),
  })
  const okBatches = batches.filter((b) => b.parseStatus === 'ok')
  const hasBaremetal = okBatches.some((b) => b.fileType === 'baremetal_order')
  const tenantBillBatches = okBatches.filter((b) => b.fileType === 'tenant_bill')
  const windows = await listTenantBillWindows(periodId)
  const tenantBillOk =
    windows.length > 0 &&
    windows.every((w) => tenantBillBatches.some((b) => b.windowId === w.id))

  if (!hasBaremetal || !tenantBillOk) {
    return { ok: false, errorsByFileType: {} }
  }

  const tenantBillRowsNested = await Promise.all(
    tenantBillBatches.map(async (batch) => {
      const rows = await db
        .select()
        .from(billingPeriodRawTenantBill)
        .where(eq(billingPeriodRawTenantBill.batchId, batch.id))
      return { batchId: batch.id, rows }
    }),
  )
  const tenantBillRows = tenantBillRowsNested.flatMap((x) => x.rows)
  const platformIds = [...new Set(tenantBillRows.map((r) => r.tenantPlatformId))]
  const known = await loadKnownPlatformTenants(platformIds)
  const errorsByFileType: Partial<Record<ImportFileType, ImportCellError[]>> = {}

  for (const { batchId, rows } of tenantBillRowsNested) {
    for (const row of rows) {
      if (known.has(row.tenantPlatformId)) continue
      const list = errorsByFileType.tenant_bill ?? []
      list.push({
        rowNo: row.rowNo,
        columnAliases: ['租户ID', 'tenant_id'],
        message: '租户ID未在CRM租户主数据中维护，成本计算将忽略此行',
        cellValue: row.tenantPlatformId,
        batchId,
      })
      errorsByFileType.tenant_bill = list
    }
  }

  return { ok: Object.keys(errorsByFileType).length === 0, errorsByFileType }
}

/** 交叉校验失败时，将错误写入对应 batch 的可下载 Excel（幂等） */
export async function ensureCrossFileErrorReports(
  periodId: string,
): Promise<CrossFileValidation> {
  const cross = await validateCrossFileImports(periodId)
  if (cross.ok) return cross

  const tenantErrors = cross.errorsByFileType.tenant_bill ?? []
  if (tenantErrors.length === 0) return cross

  const errorsByBatch = new Map<string, ImportCellError[]>()
  for (const err of tenantErrors) {
    if (!err.batchId) continue
    const list = errorsByBatch.get(err.batchId) ?? []
    list.push(err)
    errorsByBatch.set(err.batchId, list)
  }

  for (const [batchId, errors] of errorsByBatch) {
    const batch = await db.query.billingPeriodImportBatch.findFirst({
      where: eq(billingPeriodImportBatch.id, batchId),
    })
    if (!batch?.storagePath?.trim()) continue
    await persistBatchErrorReport({ batchId, errors })
  }

  return cross
}

/** 账期 status=import_error 时，生成可展示的具体阻断原因 */
export async function describeBillingPeriodImportBlocker(
  periodId: string,
): Promise<string | null> {
  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, periodId),
  })
  if (!period || period.status !== 'import_error') return null

  const batches = await db.query.billingPeriodImportBatch.findMany({
    where: eq(billingPeriodImportBatch.billingPeriodId, periodId),
  })
  const parseErrorBatches = batches.filter((b) => b.parseStatus === 'error')
  if (parseErrorBatches.length > 0) {
    const names = [...new Set(parseErrorBatches.map((b) => b.fileName))].join('、')
    return `导入文件解析失败（${names}），请下载错误报告修正后重新上传`
  }

  return '导入存在错误，请修正 Excel 后重新上传'
}

export async function persistBatchErrorReport(input: {
  batchId: string
  errors: ImportCellError[]
}): Promise<string> {
  const batch = await db.query.billingPeriodImportBatch.findFirst({
    where: eq(billingPeriodImportBatch.id, input.batchId),
  })
  if (!batch?.storagePath?.trim()) throw new Error('batch not found or missing source file')

  const { readStorageFile, deleteStorageFile, saveImportErrorReport } = await importStorageLocal()
  const source = await readStorageFile(batch.storagePath)
  const sheet = parseWorkbookDetailed(source, batch.fileName)
  const buffer = buildMarkedErrorWorkbookBuffer({ sheet, errors: input.errors })
  await deleteStorageFile(batch.errorReportPath)
  const errorPath = await saveImportErrorReport({
    billingPeriodId: batch.billingPeriodId,
    fileType: batch.fileType,
    batchId: batch.id,
    buffer,
  })
  await db
    .update(billingPeriodImportBatch)
    .set({
      parseErrorCount: input.errors.length,
      errorReportPath: errorPath,
    })
    .where(eq(billingPeriodImportBatch.id, input.batchId))
  return errorPath
}

export async function readErrorReportBySlot(input: {
  periodId: string
  fileType: ImportFileType
  windowId?: string
}): Promise<{ fileName: string; fileBase64: string } | null> {
  const conditions = [
    eq(billingPeriodImportBatch.billingPeriodId, input.periodId),
    eq(billingPeriodImportBatch.fileType, input.fileType),
  ]
  if (input.windowId) {
    conditions.push(eq(billingPeriodImportBatch.windowId, input.windowId))
  }
  const batch = await db.query.billingPeriodImportBatch.findFirst({
    where: and(...conditions),
  })
  if (!batch?.errorReportPath) return null
  const { readStorageFile } = await importStorageLocal()
  const buf = await readStorageFile(batch.errorReportPath)
  const base = batch.fileName.replace(/\.(xlsx|xls|csv)$/i, '')
  return {
    fileName: `${base}-导入错误.xlsx`,
    fileBase64: buf.toString('base64'),
  }
}
