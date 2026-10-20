import { parseMoney } from '@/lib/finance/income-row-utils'
import {
  personalIncomeSummaryKindLabel,
  type PersonalIncomeSummaryKind,
} from '@/lib/finance/personal-income-labels'
import type { PersonalIncomeReconciliationDto } from '@/lib/server/dataaccess/finance/compute-personal-income'
import type { PersonalIncomeTenantLineDto } from '@/lib/server/dataaccess/finance/list-personal-income-tenant-lines'
import XLSX from 'xlsx-js-style'

export type PersonalIncomeSummaryRow = {
  summary_kind: PersonalIncomeSummaryKind
  balance_consumption: string
  bare_metal_consumption: string
  total_consumption: string
  matched_tenant_count: number
}

const SUMMARY_HEADERS = [
  '汇总类型',
  '余额消费',
  '线上裸金属消费',
  '总消费',
  '租户数',
] as const

const DETAIL_HEADERS = [
  '平台租户ID',
  '客户类型',
  '客户名',
  '余额消费',
  '线上裸金属消费',
  '总消费',
  '券消费',
] as const

const HEADER_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'E8EEF4' } },
}

function moneyCell(value: string | null | undefined): number | '' {
  if (value == null || value === '') return ''
  const n = parseMoney(value)
  return Number.isNaN(n) ? '' : n
}

function styleHeaderRow(ws: XLSX.WorkSheet, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) ws[addr].s = HEADER_STYLE
  }
}

export function downloadPersonalIncomeSummaryExcel(params: {
  rows: PersonalIncomeSummaryRow[]
  periodCode: string
  reconciliation?: PersonalIncomeReconciliationDto | null
}): boolean {
  const { rows, periodCode, reconciliation } = params
  if (rows.length === 0) return false

  const wsData: (string | number)[][] = [
    [...SUMMARY_HEADERS],
    ...rows.map((row) => [
      personalIncomeSummaryKindLabel(row.summary_kind),
      moneyCell(row.balance_consumption),
      moneyCell(row.bare_metal_consumption),
      moneyCell(row.total_consumption),
      row.matched_tenant_count,
    ]),
  ]

  if (reconciliation) {
    wsData.push([])
    wsData.push(['Excel 余额总消费（全量）', moneyCell(reconciliation.excel_computed_balance_total)])
    wsData.push(['四段合计', moneyCell(reconciliation.four_segment_sum)])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  styleHeaderRow(ws, SUMMARY_HEADERS.length)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '收入汇总')
  XLSX.writeFile(wb, `个人收入汇总-${periodCode}.xlsx`)
  return true
}

const DETAIL_FILE_LABEL: Record<PersonalIncomeSummaryKind, string> = {
  enterprise_project: 'B端项目租户',
  non_project: '非项目租户',
  blacklist: '黑名单',
  internal: '内部租户',
}

export function downloadPersonalIncomeTenantDetailExcel(params: {
  rows: PersonalIncomeTenantLineDto[]
  periodCode: string
  summaryKind: PersonalIncomeSummaryKind
}): boolean {
  const { rows, periodCode, summaryKind } = params
  if (rows.length === 0) return false

  let sumBalance = 0
  let sumBare = 0
  let sumTotal = 0
  let sumVoucher = 0

  const body = rows.map((row) => {
    sumBalance += parseMoney(row.balance_consumption)
    sumBare += parseMoney(row.bare_metal_consumption)
    sumTotal += parseMoney(row.total_consumption)
    sumVoucher += parseMoney(row.voucher_consumption)
    return [
      row.platform_tenant_id,
      row.customer_type_label ?? '',
      row.customer_name ?? '',
      moneyCell(row.balance_consumption),
      moneyCell(row.bare_metal_consumption),
      moneyCell(row.total_consumption),
      moneyCell(row.voucher_consumption),
    ]
  })

  const wsData: (string | number)[][] = [
    [...DETAIL_HEADERS],
    ...body,
    [
      '合计',
      '',
      '',
      sumBalance,
      sumBare,
      sumTotal,
      sumVoucher,
    ],
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  styleHeaderRow(ws, DETAIL_HEADERS.length)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '租户明细')
  XLSX.writeFile(
    wb,
    `个人收入明细-${DETAIL_FILE_LABEL[summaryKind]}-${periodCode}.xlsx`,
  )
  return true
}
