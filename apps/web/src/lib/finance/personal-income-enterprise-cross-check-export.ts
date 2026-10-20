import { parseMoney } from '@/lib/finance/income-row-utils'
import type { PersonalIncomeEnterpriseCrossCheckRow } from '@/lib/server/dataaccess/finance/list-personal-income-enterprise-cross-check'
import XLSX from 'xlsx-js-style'

const HEADERS = [
  '平台租户ID',
  '客户名',
  '关联项目',
  'Excel 余额消费',
  'Excel 线上裸金属',
  'Excel 总消费',
  'CRM 余额消费',
  'CRM 线上裸金属',
  'CRM 总消费',
  '总消费差额',
  '余额差额',
  '裸金属差额',
  'CRM 有记录',
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

export function downloadPersonalIncomeEnterpriseCrossCheckExcel(params: {
  rows: PersonalIncomeEnterpriseCrossCheckRow[]
  periodCode: string
  summary?: {
    excel_total: string
    crm_total: string
    delta: string
  }
}): boolean {
  const { rows, periodCode, summary } = params
  if (rows.length === 0) return false

  const body = rows.map((row) => [
    row.platform_tenant_id,
    row.customer_name ?? '',
    row.project_names.join('、'),
    moneyCell(row.excel_balance_consumption),
    moneyCell(row.excel_bare_metal_consumption),
    moneyCell(row.excel_total_consumption),
    moneyCell(row.crm_balance_consumption),
    moneyCell(row.crm_bare_metal_consumption),
    moneyCell(row.crm_total_consumption),
    moneyCell(row.delta_total),
    moneyCell(row.delta_balance),
    moneyCell(row.delta_bare_metal),
    row.has_crm_row ? '是' : '否',
  ])

  const wsData: (string | number)[][] = [[...HEADERS], ...body]

  if (summary) {
    wsData.push([])
    wsData.push(['Excel B 端合计', moneyCell(summary.excel_total)])
    wsData.push(['CRM 企业收入合计', moneyCell(summary.crm_total)])
    wsData.push(['差额', moneyCell(summary.delta)])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  for (let c = 0; c < HEADERS.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) ws[addr].s = HEADER_STYLE
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'B端CRM交叉核对')
  XLSX.writeFile(wb, `个人收入-B端CRM交叉核对-${periodCode}.xlsx`)
  return true
}
