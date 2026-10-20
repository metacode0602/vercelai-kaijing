import { db } from '@/lib/db'
import {
  billingPeriod,
  billingPeriodImportBatch,
  billingPeriodRawTenantBill,
} from '@workspace/db/schema'
import { eq } from 'drizzle-orm'
import { isPersonalImportFileType, type ImportFileType } from './constants'
import { FinanceError } from './errors'
import {
  isTenantBillTotalRow,
  parseMoneyCell,
  parseWorkbookDetailed,
  pickCellRaw,
  pickColumn,
  sha256Hex,
  type ParsedWorkbook,
} from './excel-parser'
import { resolveAndPersistEnrichment } from './enrichment'
import type { ImportCellError } from './import-errors'
import {
  buildMarkedErrorWorkbookBuffer,
  summarizeImportErrors,
} from './import-errors'
import { financeError, financeLog } from './logger'
import { getImportSlotStatuses } from './import-slot-status'
import { appendOperationLog, newId } from './operation-log'
import { listTenantBillWindows, syncTenantBillWindowsForPeriod } from './tenant-bill-windows'

async function importStorageLocal() {
  return import('./import-storage-local')
}

async function purgeBillingPeriodArtifacts(
  ...args: Parameters<
    (typeof import('./purge'))['purgeBillingPeriodArtifacts']
  >
) {
  const { purgeBillingPeriodArtifacts: purge } = await import('./purge')
  return purge(...args)
}

async function purgePersonalIncomeArtifacts(
  ...args: Parameters<
    (typeof import('./purge-personal'))['purgePersonalIncomeArtifacts']
  >
) {
  const { purgePersonalIncomeArtifacts: purge } = await import('./purge-personal')
  return purge(...args)
}

async function isPersonalImportReady(periodId: string): Promise<boolean> {
  const { getPersonalImportBatches } = await import('./purge-personal')
  const batches = await getPersonalImportBatches(periodId)
  return batches.tenantBill?.parseStatus === 'ok'
}

export type ImportFileResult = {
  ok: boolean
  batchId: string
  rowCount: number
  parseStatus: 'ok' | 'error'
  parseErrorCount: number
  message: string
  hasErrorReport: boolean
  allParsed: boolean
  periodStatus: string
}

async function getPeriodOrThrow(
  periodId: string,
  options?: { allowAdjusted?: boolean },
) {
  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, periodId),
  })
  if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
  if (period.status === 'published') {
    throw new FinanceError('CONFLICT', '已发布账期须先撤回发布后再上传')
  }
  if (period.status === 'adjusted' && !options?.allowAdjusted) {
    throw new FinanceError('CONFLICT', '已调账账期须先重新生成后再上传')
  }
  if (period.status === 'void') {
    throw new FinanceError('CONFLICT', '作废账期不可上传')
  }
  return period
}

function mapTenantBillRows(sheet: ParsedWorkbook): {
  parsed: Omit<typeof billingPeriodRawTenantBill.$inferInsert, 'id' | 'batchId'>[]
  tenantPlatformIds: string[]
  errors: ImportCellError[]
} {
  const parsed: Omit<typeof billingPeriodRawTenantBill.$inferInsert, 'id' | 'batchId'>[] = []
  const tenantPlatformIds: string[] = []
  const errors: ImportCellError[] = []

  for (const { rowNo, row } of sheet.rows) {
    if (isTenantBillTotalRow(row)) continue
    const tenantId = pickColumn(row, ['租户ID', 'tenant_id'])
    if (!tenantId) continue
    const balanceHours = pickColumn(row, ['余额卡时', 'balance_card_hours'])
    const billLineType = pickColumn(row, ['类型', 'type', 'product_type', '产品线'])
    parsed.push({
      rowNo,
      tenantPlatformId: tenantId,
      billLineType: billLineType?.trim() || null,
      tenantTypeLabel: pickColumn(row, ['租户类型', 'tenant_type']),
      customerTypeLabel: pickColumn(row, ['客户类型', 'customer_type']),
      customerName: pickColumn(row, ['客户名', 'customer_name', '客户名称']),
      totalConsumption: parseMoneyCell(pickColumn(row, ['总消费', 'total_consumption'])),
      voucherConsumption: parseMoneyCell(pickColumn(row, ['券消费', 'voucher_consumption'])),
      balanceConsumption: parseMoneyCell(pickColumn(row, ['余额消费', 'balance_consumption'])),
      totalCardHours: parseMoneyCell(pickColumn(row, ['总卡时', 'total_card_hours'])),
      voucherCardHours: parseMoneyCell(pickColumn(row, ['券卡时', 'voucher_card_hours'])),
      balanceCardHours: parseMoneyCell(balanceHours ?? '0'),
      gpuModel: pickColumn(row, ['GPU型号', 'gpu_model']) ?? '',
      regionCode: (pickColumn(row, ['区域', 'region', 'region_code']) ?? '').toLowerCase(),
      rawJson: row,
    })
    tenantPlatformIds.push(tenantId)
  }
  if (parsed.length === 0) {
    errors.push({
      rowNo: 2,
      columnAliases: ['租户ID', 'tenant_id'],
      message: '账单详情无有效明细行',
    })
  }
  return { parsed, errors, tenantPlatformIds }
}

export async function syncBillingPeriodImportStatus(periodId: string): Promise<string> {
  const batches = await db.query.billingPeriodImportBatch.findMany({
    where: eq(billingPeriodImportBatch.billingPeriodId, periodId),
  })
  const windows = await listTenantBillWindows(periodId)
  const hasBaremetal = batches.some(
    (b) => b.fileType === 'baremetal_order' && b.parseStatus === 'ok',
  )
  const tenantBillOk =
    windows.length > 0 &&
    windows.every((w) =>
      batches.some(
        (b) =>
          b.fileType === 'tenant_bill' &&
          b.windowId === w.id &&
          b.parseStatus === 'ok',
      ),
    )

  const allOk = hasBaremetal && tenantBillOk

  let status = 'draft'
  if (allOk) {
    status = 'imported'
  } else if (batches.some((b) => b.parseStatus === 'error')) {
    status = 'import_error'
  }

  await db.update(billingPeriod).set({ status }).where(eq(billingPeriod.id, periodId))
  return status
}

/** 旧版交叉校验曾将账期标为 import_error；导入解析已成功时恢复为 imported */
export async function reconcileStaleImportErrorStatus(periodId: string): Promise<void> {
  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, periodId),
  })
  if (!period || period.status !== 'import_error') return

  const batches = await db.query.billingPeriodImportBatch.findMany({
    where: eq(billingPeriodImportBatch.billingPeriodId, periodId),
  })
  if (batches.some((b) => b.parseStatus === 'error')) return

  const windows = await listTenantBillWindows(periodId)
  const hasBaremetal = batches.some(
    (b) => b.fileType === 'baremetal_order' && b.parseStatus === 'ok',
  )
  const tenantBillOk =
    windows.length > 0 &&
    windows.every((w) =>
      batches.some(
        (b) =>
          b.fileType === 'tenant_bill' &&
          b.windowId === w.id &&
          b.parseStatus === 'ok',
      ),
    )

  if (hasBaremetal && tenantBillOk) {
    await db
      .update(billingPeriod)
      .set({ status: 'imported' })
      .where(eq(billingPeriod.id, periodId))
  }
}

async function recordParseFailure(input: {
  batchId: string
  billingPeriodId: string
  fileType: ImportFileType
  fileName: string
  storagePath: string
  sheet: ParsedWorkbook
  errors: ImportCellError[]
  fileSha256: string
  fileSizeBytes: number
  actorId?: string | null
  windowId?: string
}): Promise<ImportFileResult> {
  const errorBuffer = buildMarkedErrorWorkbookBuffer({
    sheet: input.sheet,
    errors: input.errors,
    /** 仅导出含错误的行，并在「错误说明」列逐条标注 */
    includeAllRows: false,
  })
  const { saveImportErrorReport } = await importStorageLocal()
  const errorReportPath = await saveImportErrorReport({
    billingPeriodId: input.billingPeriodId,
    fileType: input.fileType,
    batchId: input.batchId,
    buffer: errorBuffer,
  })

  await db.insert(billingPeriodImportBatch).values({
    id: input.batchId,
    billingPeriodId: input.billingPeriodId,
    windowId: input.windowId ?? null,
    fileType: input.fileType,
    fileName: input.fileName,
    storagePath: input.storagePath,
    errorReportPath,
    fileSha256: input.fileSha256,
    fileSizeBytes: input.fileSizeBytes,
    parseStatus: 'error',
    parseErrorCount: input.errors.length,
    rowCount: 0,
    uploadedBy: input.actorId ?? null,
  })

  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, input.billingPeriodId),
  })
  const periodStatus = isPersonalImportFileType(input.fileType)
    ? (period?.status ?? 'draft')
    : await syncBillingPeriodImportStatus(input.billingPeriodId)
  const message = summarizeImportErrors(input.errors)

  return {
    ok: false,
    batchId: input.batchId,
    rowCount: 0,
    parseStatus: 'error',
    parseErrorCount: input.errors.length,
    message,
    hasErrorReport: true,
    allParsed: false,
    periodStatus,
  }
}

export async function importExcelFile(input: {
  billingPeriodId: string
  fileType: ImportFileType
  fileName: string
  buffer: Buffer
  actorId?: string | null
  windowId?: string
  /** 成本 Tab 重新生成上传：不清理收入派生 */
  preserveIncomeDerived?: boolean
}): Promise<ImportFileResult> {
  const period = await getPeriodOrThrow(input.billingPeriodId, {
    allowAdjusted:
      input.preserveIncomeDerived || isPersonalImportFileType(input.fileType),
  })
  financeLog('import', `start ${input.fileType}`, {
    periodId: input.billingPeriodId,
    fileName: input.fileName,
    windowId: input.windowId,
  })

  if (input.fileType === 'baremetal_order') {
    throw new FinanceError(
      'BAD_REQUEST',
      '裸金属订单已从 bare_metal_order 读库导入，不再支持 Excel 上传',
    )
  }

  if (input.fileType === 'personal_baremetal_order') {
    throw new FinanceError(
      'BAD_REQUEST',
      '个人裸金属订单已从 bare_metal_order 读库导入，不再支持 Excel 上传',
    )
  }

  if (input.fileType === 'tenant_bill') {
    if (!input.windowId) {
      throw new FinanceError('BAD_REQUEST', '上传客户账单详情须指定时间段 windowId')
    }
    const windows = await listTenantBillWindows(input.billingPeriodId)
    if (!windows.some((w) => w.id === input.windowId)) {
      throw new FinanceError('BAD_REQUEST', '无效的客户账单时间段')
    }
  }

  if (isPersonalImportFileType(input.fileType)) {
    await purgePersonalIncomeArtifacts({
      billingPeriodId: input.billingPeriodId,
      fileType: input.fileType,
      actorId: input.actorId,
    })
  } else {
    await purgeBillingPeriodArtifacts({
      billingPeriodId: input.billingPeriodId,
      scope: 'file_type',
      fileType: input.fileType,
      windowId: input.windowId,
      actorId: input.actorId,
      preserveIncomeDerived: input.preserveIncomeDerived,
    })
  }

  const sheet = parseWorkbookDetailed(input.buffer, input.fileName)
  const batchId = newId()
  const fileSha256 = sha256Hex(input.buffer)
  const { saveImportSourceFile } = await importStorageLocal()
  const storagePath = await saveImportSourceFile({
    billingPeriodId: input.billingPeriodId,
    fileType: input.fileType,
    batchId,
    fileName: input.fileName,
    buffer: input.buffer,
  })

  let tenantPlatformIdsForEnrichment: string[] = []
  let parseErrors: ImportCellError[] = []
  let rowCount = 0

  try {
    if (
      input.fileType === 'tenant_bill' ||
      input.fileType === 'personal_tenant_bill'
    ) {
      const { mapPersonalTenantBillRows } = await import('./personal-income-bill-rows')
      const mapped =
        input.fileType === 'personal_tenant_bill'
          ? mapPersonalTenantBillRows(sheet)
          : mapTenantBillRows(sheet)
      const { parsed, errors, tenantPlatformIds } = mapped
      parseErrors = errors
      if (errors.length === 0) {
        rowCount = parsed.length
        await db.transaction(async (tx) => {
          await tx.insert(billingPeriodImportBatch).values({
            id: batchId,
            billingPeriodId: input.billingPeriodId,
            windowId: input.windowId ?? null,
            fileType: input.fileType,
            fileName: input.fileName,
            storagePath,
            fileSha256,
            fileSizeBytes: input.buffer.length,
            parseStatus: 'ok',
            parseErrorCount: 0,
            rowCount: parsed.length,
            uploadedBy: input.actorId ?? null,
          })
          await tx.insert(billingPeriodRawTenantBill).values(
            parsed.map((r) => ({ ...r, id: newId(), batchId })),
          )
        })
        if (input.fileType === 'tenant_bill') {
          tenantPlatformIdsForEnrichment = tenantPlatformIds
        }
      }
    }

    if (parseErrors.length > 0) {
      return recordParseFailure({
        batchId,
        billingPeriodId: input.billingPeriodId,
        fileType: input.fileType,
        fileName: input.fileName,
        storagePath,
        sheet,
        errors: parseErrors,
        fileSha256,
        fileSizeBytes: input.buffer.length,
        actorId: input.actorId,
        windowId: input.windowId,
      })
    }

    if (input.fileType === 'tenant_bill' && tenantPlatformIdsForEnrichment.length > 0) {
      await resolveAndPersistEnrichment(
        input.billingPeriodId,
        tenantPlatformIdsForEnrichment,
        period.periodEnd,
      )
    }

    let periodStatus: string
    let allParsed: boolean

    if (isPersonalImportFileType(input.fileType)) {
      allParsed = await isPersonalImportReady(input.billingPeriodId)
      periodStatus = period.status
    } else {
      periodStatus = await syncBillingPeriodImportStatus(input.billingPeriodId)
      const slotStatuses = await getImportSlotStatuses(input.billingPeriodId)
      allParsed =
        Boolean(slotStatuses.baremetal?.parseStatus === 'ok') &&
        slotStatuses.tenantBillWindows.length > 0 &&
        slotStatuses.tenantBillWindows.every((w) => w.parseStatus === 'ok') &&
        periodStatus === 'imported'
    }

    await appendOperationLog({
      billingPeriodId: input.billingPeriodId,
      operation: 'import_batch',
      actorId: input.actorId,
      metadata: {
        fileType: input.fileType,
        fileName: input.fileName,
        rowCount,
      },
    })

    financeLog('import', 'done', {
      periodId: input.billingPeriodId,
      fileType: input.fileType,
      rowCount,
    })

    return {
      ok: true,
      batchId,
      rowCount,
      parseStatus: 'ok',
      parseErrorCount: 0,
      message: `解析成功（${rowCount} 行）`,
      hasErrorReport: false,
      allParsed,
      periodStatus,
    }
  } catch (e) {
    const { deleteStorageFile } = await importStorageLocal()
    await deleteStorageFile(storagePath)
    financeError('import', 'failed', e, { periodId: input.billingPeriodId })
    throw e
  }
}
