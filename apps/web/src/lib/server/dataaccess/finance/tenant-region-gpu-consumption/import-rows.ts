import type {
  TenantRegionGpuImportCommitResult,
  TenantRegionGpuImportPreviewResult,
  TenantRegionGpuImportPreviewRow,
} from '@/lib/types/tenant-region-gpu-import'
import { createHash } from 'node:crypto'
import {
  isTenantBillTotalRow,
  parseWorkbookDetailed,
  pickColumn,
} from '../excel-parser'
import {
  parseImportCoreFields,
  parseImportMetrics,
  parseImportProductLine,
} from './import-parse-shared'
import { upsertTenantRegionGpuConsumptionDaily } from './upsert-daily'
import type { TenantRegionGpuConsumptionRowInput } from './types'

function normalizeUsageDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const asDate = new Date(trimmed)
  if (Number.isNaN(asDate.getTime())) return null
  const y = asDate.getFullYear()
  const m = String(asDate.getMonth() + 1).padStart(2, '0')
  const d = String(asDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildImportIdempotencyKey(input: {
  fileName: string
  rowNo: number
  tenantPlatformId: string
  usageDate: string
  regionCode: string
  gpuModel: string
  productLine: string
}): string {
  const batchId = createHash('sha256').update(input.fileName).digest('hex').slice(0, 12)
  return `trg-daily-import-${batchId}-${input.rowNo}`
}

function buildImportRowInput(
  fileName: string,
  rowNo: number,
  row: Record<string, string | number | null>,
): { input: TenantRegionGpuConsumptionRowInput } | { error: string } {
  const core = parseImportCoreFields(row)
  if ('error' in core) return core

  const usageDate = normalizeUsageDate(pickColumn(row, ['日期', 'usage_date', 'usageDate']))
  if (!usageDate) {
    return { error: '缺少或无效日期' }
  }

  const productLineParsed = parseImportProductLine(row)
  if ('error' in productLineParsed) return productLineParsed

  const metricsParsed = parseImportMetrics(row)
  if ('error' in metricsParsed) return metricsParsed

  const { tenantPlatformId, regionCode, gpuModel } = core
  const { productLine } = productLineParsed
  const { metrics } = metricsParsed

  return {
    input: {
      tenantPlatformId,
      usageDate,
      regionCode,
      gpuModel,
      productLine,
      baseValue: metrics.baseValue,
      totalConsumption: metrics.totalConsumption,
      voucherConsumption: metrics.voucherConsumption,
      balanceConsumption: metrics.balanceConsumption,
      totalCardHours: metrics.totalCardHours,
      voucherCardHours: metrics.voucherCardHours,
      balanceCardHours: metrics.balanceCardHours,
      source: 'manual_import',
      platformIdempotencyKey: buildImportIdempotencyKey({
        fileName,
        rowNo,
        tenantPlatformId,
        usageDate,
        regionCode,
        gpuModel,
        productLine,
      }),
      rawJson: row as Record<string, unknown>,
    },
  }
}

export function previewTenantRegionGpuImportFile(input: {
  fileName: string
  buffer: Buffer
}): TenantRegionGpuImportPreviewResult {
  const sheet = parseWorkbookDetailed(input.buffer, input.fileName)
  const previewRows: TenantRegionGpuImportPreviewRow[] = []
  const importableRows: TenantRegionGpuConsumptionRowInput[] = []

  for (const { rowNo, row } of sheet.rows) {
    if (isTenantBillTotalRow(row)) {
      previewRows.push({
        rowNo,
        parseStatus: 'skip',
        parseMessage: '合计行已跳过',
      })
      continue
    }

    const tenantPlatformId = pickColumn(row, ['租户Id', '租户ID', 'tenant_id', 'tenant_platform_id'])
    if (!tenantPlatformId) {
      previewRows.push({
        rowNo,
        parseStatus: 'skip',
        parseMessage: '空行或无租户 Id',
      })
      continue
    }

    const parsed = buildImportRowInput(input.fileName, rowNo, row)
    if ('error' in parsed) {
      previewRows.push({
        rowNo,
        parseStatus: 'error',
        parseMessage: parsed.error,
        tenantPlatformId: tenantPlatformId.trim(),
      })
      continue
    }

    const { input: rowInput } = parsed
    previewRows.push({
      rowNo,
      parseStatus: 'ok',
      tenantPlatformId: rowInput.tenantPlatformId,
      usageDate: rowInput.usageDate,
      usageMonth: rowInput.usageDate.slice(0, 7),
      productLine: rowInput.productLine,
      regionCode: rowInput.regionCode,
      gpuModel: rowInput.gpuModel,
      balanceConsumption: String(rowInput.balanceConsumption),
      balanceCardHours: String(rowInput.balanceCardHours),
      totalConsumption: String(rowInput.totalConsumption),
    })
    importableRows.push(rowInput)
  }

  const fileErrors: string[] = []
  if (importableRows.length === 0 && previewRows.every((r) => r.parseStatus === 'skip')) {
    fileErrors.push('未解析到有效数据行（需包含：日期、租户Id、区域、GPU型号）')
  }

  const ok = previewRows.filter((r) => r.parseStatus === 'ok').length
  const error = previewRows.filter((r) => r.parseStatus === 'error').length
  const skip = previewRows.filter((r) => r.parseStatus === 'skip').length

  return {
    fileName: input.fileName,
    originalHeaders: sheet.headers,
    rows: previewRows,
    summary: {
      total: previewRows.length,
      ok,
      error,
      skip,
    },
    fileErrors,
  }
}

export async function commitTenantRegionGpuImportFile(input: {
  fileName: string
  buffer: Buffer
}): Promise<TenantRegionGpuImportCommitResult> {
  const sheet = parseWorkbookDetailed(input.buffer, input.fileName)
  const errors: string[] = []
  const importableRows: TenantRegionGpuConsumptionRowInput[] = []

  for (const { rowNo, row } of sheet.rows) {
    if (isTenantBillTotalRow(row)) continue
    const tenantPlatformId = pickColumn(row, ['租户Id', '租户ID', 'tenant_id', 'tenant_platform_id'])
    if (!tenantPlatformId) continue

    const parsed = buildImportRowInput(input.fileName, rowNo, row)
    if ('error' in parsed) {
      errors.push(`第 ${rowNo} 行：${parsed.error}`)
      continue
    }
    importableRows.push(parsed.input)
  }

  if (importableRows.length === 0) {
    if (errors.length === 0) {
      errors.push('没有可导入的有效行')
    }
    return { importedCount: 0, errors }
  }

  let importedCount = 0
  for (const row of importableRows) {
    try {
      await upsertTenantRegionGpuConsumptionDaily(row)
      importedCount += 1
    } catch (e) {
      const message = e instanceof Error ? e.message : '写入失败'
      errors.push(
        `租户 ${row.tenantPlatformId} / ${row.usageDate} / ${row.regionCode} / ${row.gpuModel} / ${row.productLine}：${message}`,
      )
    }
  }
  return { importedCount, errors }
}

/** @deprecated 请使用 preview + commit 流程 */
export async function importTenantRegionGpuConsumptionExcel(input: {
  fileName: string
  buffer: Buffer
}): Promise<{ importedCount: number; errors: string[] }> {
  return commitTenantRegionGpuImportFile(input)
}
