import type { TenantRegionGpuMonthlyImportBillReconcileRow } from '@/lib/types/tenant-region-gpu-monthly-import'
import XLSX from 'xlsx-js-style'

const HEADERS = [
  '租户Id',
  '租户名称',
  '对账状态',
  'Excel总消费',
  'Excel券消费',
  'Excel余额消费',
  '账单总金额(弹性+云主机+Job)',
  '账单券消费(弹性+云主机+Job)',
  '账单余额消费(弹性+云主机+Job)',
  '余额消费差额(Excel-账单)',
] as const

const HEADER_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'E8EEF4' } },
}

const MISMATCH_FILL = {
  patternType: 'solid' as const,
  fgColor: { rgb: 'FFFFC7CE' },
}

const STATUS_LABEL: Record<TenantRegionGpuMonthlyImportBillReconcileRow['status'], string> = {
  match: '一致',
  mismatch: '不一致',
  missing_bill: '账单缺失',
}

function formatMoney(value: string): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function buildAoa(rows: TenantRegionGpuMonthlyImportBillReconcileRow[]): (string | number)[][] {
  return [
    [...HEADERS],
    ...rows.map((r) => [
      r.tenantPlatformId,
      r.tenantName ?? '',
      STATUS_LABEL[r.status],
      formatMoney(r.excelTotalConsumption),
      formatMoney(r.excelVoucherConsumption),
      formatMoney(r.excelBalanceConsumption),
      formatMoney(r.billTotalAmount),
      formatMoney(r.billCouponAmount),
      formatMoney(r.billBalanceAmount),
      formatMoney(r.deltaBalanceConsumption),
    ]),
  ]
}

function applySheetStyles(
  ws: ReturnType<typeof XLSX.utils.aoa_to_sheet>,
  rows: TenantRegionGpuMonthlyImportBillReconcileRow[],
) {
  const colCount = HEADERS.length
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) ws[addr].s = HEADER_STYLE
  }

  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.status === 'match') continue
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r: i + 1, c })
      if (!ws[addr]) continue
      ws[addr].s = { ...(ws[addr].s ?? {}), fill: MISMATCH_FILL }
    }
  }

  ws['!cols'] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 22 },
  ]
}

export function downloadTenantRegionGpuMonthlyBillReconcileExcel(params: {
  rows: TenantRegionGpuMonthlyImportBillReconcileRow[]
  usageMonth: string
  /** 仅导出有差异的租户；默认 true */
  mismatchOnly?: boolean
}): boolean {
  const mismatchOnly = params.mismatchOnly !== false
  const rows = mismatchOnly
    ? params.rows.filter((r) => r.status !== 'match')
    : params.rows

  if (rows.length === 0) return false

  const ws = XLSX.utils.aoa_to_sheet(buildAoa(rows))
  applySheetStyles(ws, rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '账单对账差异')
  const suffix = mismatchOnly ? '差异' : '全部'
  XLSX.writeFile(wb, `月度卡时导入-账单对账${suffix}-${params.usageMonth}.xlsx`)
  return true
}
