import { toMoneyString } from '@/lib/finance/income-row-utils'
import type {
  TenantRegionGpuMonthlyImportBillReconcileRow,
  TenantRegionGpuMonthlyImportCommitResult,
  TenantRegionGpuMonthlyImportPreviewResult,
  TenantRegionGpuMonthlyImportPreviewRow,
} from '@/lib/types/tenant-region-gpu-monthly-import'
import { db } from '@/lib/db'
import { billingTenant, tenantBill, tenantBillDetail } from '@workspace/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  isTenantBillTotalRow,
  parseWorkbookDetailed,
  pickColumn,
} from '../excel-parser'
import { buildBareMetalMonthlyImportRows } from './bare-metal-monthly-import-rows'
import {
  parseImportCoreFields,
  parseImportMetrics,
  parseImportProductLine,
} from './import-parse-shared'
import { upsertTenantRegionGpuConsumptionMonthly } from './upsert-monthly'
import type { TenantRegionGpuConsumptionMonthlyRowInput } from './types'

/** Excel 弹性部署汇总 vs tenant_bill_detail（弹性部署+云主机+Job）允许误差 */
const BILL_RECONCILE_TOLERANCE = 0.02

/** tenant_bill_detail 中与「弹性部署服务」对账的产品线 */
const ELASTIC_BILL_DETAIL_PRODUCT_LINES = [
  'pod_deployment',
  'pod_development',
  'pod_job',
] as const

type ParsedMonthlyRow = {
  rowNo: number
  input: TenantRegionGpuConsumptionMonthlyRowInput
}

function monthlyMergeKey(row: TenantRegionGpuConsumptionMonthlyRowInput): string {
  return [
    row.tenantPlatformId,
    row.usageMonth,
    row.regionCode,
    row.gpuModel,
    row.productLine,
  ].join('\u0001')
}

function sumNullableMoney(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): string | null {
  if (a == null && b == null) return null
  return toMoneyString((Number(a) || 0) + (Number(b) || 0))
}

function mergeMonthlyRowInputs(rows: ParsedMonthlyRow[]): Array<{
  input: TenantRegionGpuConsumptionMonthlyRowInput
  sourceRowNos: number[]
}> {
  const map = new Map<
    string,
    {
      input: TenantRegionGpuConsumptionMonthlyRowInput
      sourceRowNos: number[]
    }
  >()

  for (const { rowNo, input } of rows) {
    const key = monthlyMergeKey(input)
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        input: {
          ...input,
          baseValue: input.baseValue == null ? null : toMoneyString(Number(input.baseValue) || 0),
          totalConsumption: toMoneyString(Number(input.totalConsumption) || 0),
          voucherConsumption: toMoneyString(Number(input.voucherConsumption ?? 0) || 0),
          balanceConsumption: toMoneyString(Number(input.balanceConsumption) || 0),
          totalCardHours: toMoneyString(Number(input.totalCardHours) || 0),
          voucherCardHours: toMoneyString(Number(input.voucherCardHours ?? 0) || 0),
          balanceCardHours: toMoneyString(Number(input.balanceCardHours) || 0),
        },
        sourceRowNos: [rowNo],
      })
      continue
    }

    existing.sourceRowNos.push(rowNo)
    existing.input = {
      ...existing.input,
      baseValue: sumNullableMoney(existing.input.baseValue, input.baseValue),
      totalConsumption: toMoneyString(
        (Number(existing.input.totalConsumption) || 0) + (Number(input.totalConsumption) || 0),
      ),
      voucherConsumption: toMoneyString(
        (Number(existing.input.voucherConsumption ?? 0) || 0) +
          (Number(input.voucherConsumption ?? 0) || 0),
      ),
      balanceConsumption: toMoneyString(
        (Number(existing.input.balanceConsumption) || 0) + (Number(input.balanceConsumption) || 0),
      ),
      totalCardHours: toMoneyString(
        (Number(existing.input.totalCardHours) || 0) + (Number(input.totalCardHours) || 0),
      ),
      voucherCardHours: toMoneyString(
        (Number(existing.input.voucherCardHours ?? 0) || 0) +
          (Number(input.voucherCardHours ?? 0) || 0),
      ),
      balanceCardHours: toMoneyString(
        (Number(existing.input.balanceCardHours) || 0) + (Number(input.balanceCardHours) || 0),
      ),
    }
  }

  return [...map.values()]
}

function buildMonthlyImportRowInput(
  usageMonth: string,
  row: Record<string, string | number | null>,
): { input: TenantRegionGpuConsumptionMonthlyRowInput } | { error: string } {
  const core = parseImportCoreFields(row)
  if ('error' in core) return core

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
      usageMonth,
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
    },
  }
}

function parseMonthlySheetRows(input: {
  fileName: string
  buffer: Buffer
  usageMonth: string
}): {
  previewRows: TenantRegionGpuMonthlyImportPreviewRow[]
  parsedOk: ParsedMonthlyRow[]
  sheetHeaders: string[]
} {
  const sheet = parseWorkbookDetailed(input.buffer, input.fileName)
  const previewRows: TenantRegionGpuMonthlyImportPreviewRow[] = []
  const parsedOk: ParsedMonthlyRow[] = []

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

    const parsed = buildMonthlyImportRowInput(input.usageMonth, row)
    if ('error' in parsed) {
      previewRows.push({
        rowNo,
        parseStatus: 'error',
        parseMessage: parsed.error,
        tenantPlatformId: tenantPlatformId.trim(),
      })
      continue
    }

    parsedOk.push({ rowNo, input: parsed.input })
  }

  return { previewRows, parsedOk, sheetHeaders: sheet.headers }
}

async function reconcileExcelWithTenantBillDetail(input: {
  usageMonth: string
  mergedRows: Array<{ input: TenantRegionGpuConsumptionMonthlyRowInput }>
}): Promise<{
  mismatchTenantCount: number
  tenantCount: number
  rows: TenantRegionGpuMonthlyImportBillReconcileRow[]
}> {
  const excelByTenant = new Map<
    string,
    { totalConsumption: number; voucherConsumption: number; balanceConsumption: number }
  >()

  for (const { input: row } of input.mergedRows) {
    if (row.productLine !== 'elastic_deployment') continue
    const prev = excelByTenant.get(row.tenantPlatformId) ?? {
      totalConsumption: 0,
      voucherConsumption: 0,
      balanceConsumption: 0,
    }
    prev.totalConsumption += Number(row.totalConsumption) || 0
    prev.voucherConsumption += Number(row.voucherConsumption ?? 0) || 0
    prev.balanceConsumption += Number(row.balanceConsumption) || 0
    excelByTenant.set(row.tenantPlatformId, prev)
  }

  const tenantIds = [...excelByTenant.keys()]
  if (tenantIds.length === 0) {
    return { mismatchTenantCount: 0, tenantCount: 0, rows: [] }
  }

  const billRows = await db
    .select({
      platformTenantId: billingTenant.platformTenantId,
      tenantName: billingTenant.name,
      balanceAmount: sql<string>`coalesce(sum(${tenantBillDetail.balanceAmount}::numeric), 0)`,
      couponAmount: sql<string>`coalesce(sum(${tenantBillDetail.couponAmount}::numeric), 0)`,
      amount: sql<string>`coalesce(sum(${tenantBillDetail.amount}::numeric), 0)`,
    })
    .from(tenantBill)
    .innerJoin(billingTenant, eq(tenantBill.tenantId, billingTenant.id))
    .innerJoin(tenantBillDetail, eq(tenantBillDetail.billId, tenantBill.id))
    .where(
      and(
        eq(tenantBill.billMonth, input.usageMonth),
        inArray(billingTenant.platformTenantId, tenantIds),
        inArray(tenantBillDetail.productLine, [...ELASTIC_BILL_DETAIL_PRODUCT_LINES]),
      ),
    )
    .groupBy(billingTenant.platformTenantId, billingTenant.name)

  const billByTenant = new Map(
    billRows
      .filter((r): r is typeof r & { platformTenantId: string } => Boolean(r.platformTenantId))
      .map((r) => [
        r.platformTenantId,
        {
          tenantName: r.tenantName,
          balanceAmount: Number(r.balanceAmount) || 0,
          couponAmount: Number(r.couponAmount) || 0,
          amount: Number(r.amount) || 0,
        },
      ]),
  )

  const rows: TenantRegionGpuMonthlyImportBillReconcileRow[] = []
  let mismatchTenantCount = 0

  for (const tenantPlatformId of tenantIds.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))) {
    const excel = excelByTenant.get(tenantPlatformId)!
    const bill = billByTenant.get(tenantPlatformId)
    const billBalance = bill?.balanceAmount ?? 0
    const billTotal = bill?.amount ?? 0
    const billVoucher = bill?.couponAmount ?? 0
    const deltaBalance = excel.balanceConsumption - billBalance
    const hasBill = Boolean(bill)
    const matched =
      hasBill && Math.abs(deltaBalance) <= BILL_RECONCILE_TOLERANCE

    let status: TenantRegionGpuMonthlyImportBillReconcileRow['status']
    if (!hasBill) {
      status = 'missing_bill'
      mismatchTenantCount += 1
    } else if (!matched) {
      status = 'mismatch'
      mismatchTenantCount += 1
    } else {
      status = 'match'
    }

    rows.push({
      tenantPlatformId,
      tenantName: bill?.tenantName ?? null,
      excelTotalConsumption: toMoneyString(excel.totalConsumption),
      excelVoucherConsumption: toMoneyString(excel.voucherConsumption),
      excelBalanceConsumption: toMoneyString(excel.balanceConsumption),
      billTotalAmount: toMoneyString(billTotal),
      billCouponAmount: toMoneyString(billVoucher),
      billBalanceAmount: toMoneyString(billBalance),
      deltaBalanceConsumption: toMoneyString(deltaBalance),
      status,
    })
  }

  return {
    mismatchTenantCount,
    tenantCount: tenantIds.length,
    rows,
  }
}

export async function previewTenantRegionGpuMonthlyImportFile(input: {
  fileName: string
  buffer: Buffer
  usageMonth: string
}): Promise<TenantRegionGpuMonthlyImportPreviewResult> {
  const { previewRows, parsedOk, sheetHeaders } = parseMonthlySheetRows(input)
  const merged = mergeMonthlyRowInputs(parsedOk)
  const mergedSourceRowNos = new Set(merged.flatMap((m) => m.sourceRowNos))

  for (const { input: rowInput, sourceRowNos } of merged) {
    const primaryRowNo = sourceRowNos[0]!
    const mergeMessage =
      sourceRowNos.length > 1
        ? `由第 ${sourceRowNos.join('、')} 行合并（同租户×机房×卡型×产品线）`
        : undefined

    previewRows.push({
      rowNo: primaryRowNo,
      parseStatus: 'ok',
      parseMessage: mergeMessage,
      usageMonth: input.usageMonth,
      productLine: rowInput.productLine,
      tenantPlatformId: rowInput.tenantPlatformId,
      regionCode: rowInput.regionCode,
      gpuModel: rowInput.gpuModel,
      balanceConsumption: String(rowInput.balanceConsumption),
      balanceCardHours: String(rowInput.balanceCardHours),
      totalConsumption: String(rowInput.totalConsumption),
      mergedFromRowNos: sourceRowNos.length > 1 ? sourceRowNos : undefined,
    })
  }

  // 被合并掉的源行在预览中标记为 skip，避免误以为丢失
  for (const { rowNo } of parsedOk) {
    if (mergedSourceRowNos.has(rowNo) && !merged.some((m) => m.sourceRowNos[0] === rowNo)) {
      const owner = merged.find((m) => m.sourceRowNos.includes(rowNo))
      previewRows.push({
        rowNo,
        parseStatus: 'skip',
        parseMessage: owner
          ? `已合并至第 ${owner.sourceRowNos[0]} 行（同租户×机房×卡型×产品线）`
          : '已合并',
        tenantPlatformId: owner?.input.tenantPlatformId,
        regionCode: owner?.input.regionCode,
        gpuModel: owner?.input.gpuModel,
        productLine: owner?.input.productLine,
      })
    }
  }

  previewRows.sort((a, b) => {
    // 裸金属自动行（负 rowNo）排在后面；其余按行号
    if (a.rowNo < 0 && b.rowNo >= 0) return 1
    if (b.rowNo < 0 && a.rowNo >= 0) return -1
    return a.rowNo - b.rowNo
  })

  const { rows: bareMetalRows, errors: bareMetalErrors } =
    await buildBareMetalMonthlyImportRows(input.usageMonth)

  const fileErrors: string[] = [...bareMetalErrors]
  let importableCount = bareMetalErrors.length > 0 ? 0 : merged.length

  // 裸金属硬错误：不展示可导入的自动行，整次导入阻断
  if (bareMetalErrors.length === 0) {
    let autoRowNo = 0
    for (const row of bareMetalRows) {
      autoRowNo += 1
      importableCount += 1
      previewRows.push({
        rowNo: -autoRowNo,
        parseStatus: 'ok',
        parseMessage: '裸金属订单自动生成（rent_starts_at 与结算月相交）',
        usageMonth: input.usageMonth,
        productLine: row.productLine,
        tenantPlatformId: row.tenantPlatformId,
        regionCode: row.regionCode,
        gpuModel: row.gpuModel,
        balanceConsumption: String(row.balanceConsumption),
        balanceCardHours: String(row.balanceCardHours),
        totalConsumption: String(row.totalConsumption),
      })
    }
  } else {
    fileErrors.unshift(
      `裸金属月表自动生成失败（${bareMetalErrors.length} 项），已中断导入。请按下列提示修复后重试：`,
    )
  }

  if (
    bareMetalErrors.length === 0 &&
    importableCount === 0 &&
    previewRows.every((r) => r.parseStatus === 'skip')
  ) {
    fileErrors.push('未解析到有效数据行（需包含：租户Id、区域、GPU型号，或同期裸金属订单）')
  }

  const ok =
    bareMetalErrors.length > 0
      ? 0
      : previewRows.filter((r) => r.parseStatus === 'ok').length
  const error = previewRows.filter((r) => r.parseStatus === 'error').length
  const skip = previewRows.filter((r) => r.parseStatus === 'skip').length

  const billReconcile =
    bareMetalErrors.length > 0
      ? { mismatchTenantCount: 0, tenantCount: 0, rows: [] as TenantRegionGpuMonthlyImportBillReconcileRow[] }
      : await reconcileExcelWithTenantBillDetail({
          usageMonth: input.usageMonth,
          mergedRows: merged,
        })

  return {
    fileName: input.fileName,
    usageMonth: input.usageMonth,
    originalHeaders: sheetHeaders,
    rows: previewRows,
    summary: {
      total: previewRows.length,
      ok,
      error: bareMetalErrors.length > 0 ? error + bareMetalErrors.length : error,
      skip,
    },
    fileErrors,
    bareMetalAutoCount: bareMetalErrors.length > 0 ? 0 : bareMetalRows.length,
    billReconcile: {
      mismatchTenantCount: billReconcile.mismatchTenantCount,
      tenantCount: billReconcile.tenantCount,
      tolerance: BILL_RECONCILE_TOLERANCE,
      rows: billReconcile.rows,
    },
  }
}

export async function commitTenantRegionGpuMonthlyImportFile(input: {
  fileName: string
  buffer: Buffer
  usageMonth: string
}): Promise<TenantRegionGpuMonthlyImportCommitResult> {
  const { previewRows, parsedOk } = parseMonthlySheetRows(input)
  const errors: string[] = previewRows
    .filter((r) => r.parseStatus === 'error')
    .map((r) => `第 ${r.rowNo} 行：${r.parseMessage ?? '解析错误'}`)

  const merged = mergeMonthlyRowInputs(parsedOk)
  const importableRows = merged.map((m) => m.input)

  const { rows: bareMetalRows, errors: bareMetalErrors } =
    await buildBareMetalMonthlyImportRows(input.usageMonth)

  if (bareMetalErrors.length > 0) {
    return {
      importedCount: 0,
      bareMetalAutoCount: 0,
      errors: [
        `裸金属月表自动生成失败（${bareMetalErrors.length} 项），已中断导入，未写入任何数据。请按下列提示修复后重试：`,
        ...bareMetalErrors,
      ],
    }
  }

  // Excel 行级解析错误也阻断整次写入，避免部分成功
  if (errors.length > 0) {
    return {
      importedCount: 0,
      bareMetalAutoCount: 0,
      errors: [
        `Excel 存在 ${errors.length} 行解析错误，已中断导入，未写入任何数据：`,
        ...errors,
      ],
    }
  }

  const allRows = [...importableRows, ...bareMetalRows]

  if (allRows.length === 0) {
    return {
      importedCount: 0,
      bareMetalAutoCount: 0,
      errors: ['没有可导入的有效行（Excel 或裸金属订单）'],
    }
  }

  let importedCount = 0
  let bareMetalAutoCount = 0
  for (const row of allRows) {
    try {
      await upsertTenantRegionGpuConsumptionMonthly(row)
      importedCount += 1
      if (row.productLine === 'bare_metal' && row.source === 'backfill') {
        bareMetalAutoCount += 1
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '写入失败'
      // 写入中途失败：已写入部分无法回滚，但停止后续并明确提示
      return {
        importedCount,
        bareMetalAutoCount,
        errors: [
          `写入中断：租户 ${row.tenantPlatformId} / ${row.usageMonth} / ${row.regionCode} / ${row.gpuModel} / ${row.productLine}：${message}`,
          '请修复后重新导入（已成功写入的行会按幂等键覆盖更新）。',
        ],
      }
    }
  }
  return { importedCount, bareMetalAutoCount, errors: [] }
}
