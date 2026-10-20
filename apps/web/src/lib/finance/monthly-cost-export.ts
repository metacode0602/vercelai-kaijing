import { parseMoney } from '@/lib/finance/income-row-utils'
import type { MonthlyCostBaseLineExportDto } from '@/lib/server/dataaccess/finance/monthly-cost/export-data'
import type { MonthlyCostBranch } from '@/lib/monthly-cost/constants'
import {
  MONTHLY_COST_BRANCH_LABELS,
  MONTHLY_COST_MARKETING_DEPT_RATES,
  MONTHLY_COST_MIDDLE_DEPT_RATES,
  MONTHLY_COST_OPPORTUNITY_SHORT_LABELS,
  type MonthlyCostIncentiveLabel,
} from '@/lib/monthly-cost/constants'
import type { OpportunitySource } from '@/lib/crm/commission-constants'
import XLSX from 'xlsx-js-style'

const COST_TAX_DIVISOR = 1.06
const SPOT_GROSS_RATE = 0.15

const HEADER_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid' as const, fgColor: { rgb: 'E8EEF4' } },
}

const FORMULA_FILL = {
  patternType: 'solid' as const,
  fgColor: { rgb: 'FFF2CC' },
}

type CellValue = string | number
type ExportRow = MonthlyCostBaseLineExportDto

function colRef(col: number, row1: number): string {
  return `${XLSX.utils.encode_col(col)}${row1}`
}

function moneyNum(value: string | null | undefined): number | '' {
  if (value == null || value === '') return ''
  return parseMoney(value)
}

function setFormulaCell(
  ws: XLSX.WorkSheet,
  col: number,
  row0: number,
  formula: string,
  cachedValue: number | string,
) {
  const addr = XLSX.utils.encode_cell({ r: row0, c: col })
  ws[addr] = {
    f: formula,
    t: typeof cachedValue === 'number' ? 'n' : 's',
    v: cachedValue,
    s: { fill: FORMULA_FILL },
  }
}

function setValueCell(ws: XLSX.WorkSheet, col: number, row0: number, value: CellValue) {
  const addr = XLSX.utils.encode_cell({ r: row0, c: col })
  if (ws[addr]) ws[addr].v = value
}

function applyHeaderRow(ws: XLSX.WorkSheet, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (ws[addr]) ws[addr].s = HEADER_STYLE
  }
}

function pcUnitPerHour(row: ExportRow): number {
  const hours = Number(row.balance_card_hours)
  if (hours <= 0) return 0
  return (parseMoney(row.pc_sold_duration_cost_excl_tax) * COST_TAX_DIVISOR) / hours
}

function spUnitPerHour(row: ExportRow): number {
  if (row.product_line === 'spot') return 0
  if (row.sp_sell_price_per_hour) return parseMoney(row.sp_sell_price_per_hour)
  const hours = Number(row.balance_card_hours)
  if (hours <= 0) return 0
  return (parseMoney(row.sp_sold_duration_cost_excl_tax) * COST_TAX_DIVISOR) / hours
}

function branchSold(row: ExportRow, branch: MonthlyCostBranch): number {
  return parseMoney(
    branch === 'platform_cost'
      ? row.pc_sold_duration_cost_excl_tax
      : row.sp_sold_duration_cost_excl_tax,
  )
}

function branchGifted(row: ExportRow, branch: MonthlyCostBranch): number {
  return parseMoney(
    branch === 'platform_cost'
      ? row.pc_gifted_duration_cost_excl_tax
      : row.sp_gifted_duration_cost_excl_tax,
  )
}

function branchGross(row: ExportRow, branch: MonthlyCostBranch): number {
  return parseMoney(
    branch === 'platform_cost' ? row.pc_gross_profit : row.sp_gross_profit,
  )
}

const METRIC_HEADERS = [
  '求和项:余额消费',
  '求和项:余额卡时',
  '求和项:券卡时',
  '确认收入(不含税)',
  '售出时长成本(不含税)',
  '赠送时长成本(不含税)',
  '毛利',
] as const

function metricStartCol(fullHeaders: readonly string[]): number {
  return fullHeaders.indexOf(METRIC_HEADERS[0])
}

function sumRows(rows: ExportRow[], branch: MonthlyCostBranch) {
  return rows.reduce(
    (acc, row) => ({
      balanceConsumption: acc.balanceConsumption + parseMoney(row.balance_consumption),
      balanceCardHours: acc.balanceCardHours + Number(row.balance_card_hours),
      voucherCardHours: acc.voucherCardHours + Number(row.voucher_card_hours),
      confirmedRevenue:
        acc.confirmedRevenue + parseMoney(row.confirmed_revenue_excl_tax),
      soldCost: acc.soldCost + branchSold(row, branch),
      giftedCost: acc.giftedCost + branchGifted(row, branch),
      gross: acc.gross + branchGross(row, branch),
    }),
    {
      balanceConsumption: 0,
      balanceCardHours: 0,
      voucherCardHours: 0,
      confirmedRevenue: 0,
      soldCost: 0,
      giftedCost: 0,
      gross: 0,
    },
  )
}

function applyMetricFormulas(
  ws: XLSX.WorkSheet,
  row0: number,
  startCol: number,
  input: {
    balanceConsumption: number
    balanceCardHours: number
    voucherCardHours: number
    soldCost?: number
    giftedCost?: number
    useBranchFormulas?: boolean
    useSpotGross?: boolean
    productLine?: string
    unitPrice?: number
    unitRefCol?: number
  },
) {
  const excelRow = row0 + 1
  const bal = colRef(startCol, excelRow)
  const balH = colRef(startCol + 1, excelRow)
  const vouchH = colRef(startCol + 2, excelRow)
  const rev = colRef(startCol + 3, excelRow)
  const sold = colRef(startCol + 4, excelRow)
  const gifted = colRef(startCol + 5, excelRow)
  const revValue = input.balanceConsumption / COST_TAX_DIVISOR

  setFormulaCell(ws, startCol + 3, row0, `${bal}/${COST_TAX_DIVISOR}`, revValue)

  if (input.useBranchFormulas && input.useSpotGross && input.productLine === 'spot') {
    setFormulaCell(ws, startCol + 4, row0, '0', 0)
    setFormulaCell(ws, startCol + 5, row0, '0', 0)
    setFormulaCell(
      ws,
      startCol + 6,
      row0,
      `${bal}*${SPOT_GROSS_RATE}`,
      input.balanceConsumption * SPOT_GROSS_RATE,
    )
    return
  }

  let soldValue = input.soldCost ?? 0
  let giftedValue = input.giftedCost ?? 0

  if (input.useBranchFormulas && input.unitPrice != null) {
    const unitExpr =
      input.unitRefCol != null
        ? colRef(input.unitRefCol, excelRow)
        : String(input.unitPrice)
    setFormulaCell(
      ws,
      startCol + 4,
      row0,
      `${unitExpr}*${balH}/${COST_TAX_DIVISOR}`,
      (input.unitPrice * input.balanceCardHours) / COST_TAX_DIVISOR,
    )
    setFormulaCell(
      ws,
      startCol + 5,
      row0,
      `${unitExpr}*${vouchH}/${COST_TAX_DIVISOR}`,
      (input.unitPrice * input.voucherCardHours) / COST_TAX_DIVISOR,
    )
    soldValue = (input.unitPrice * input.balanceCardHours) / COST_TAX_DIVISOR
    giftedValue = (input.unitPrice * input.voucherCardHours) / COST_TAX_DIVISOR
  } else {
    setValueCell(ws, startCol + 4, row0, soldValue)
    setValueCell(ws, startCol + 5, row0, giftedValue)
  }

  setFormulaCell(ws, startCol + 6, row0, `${rev}-${sold}-${gifted}`, revValue - soldValue - giftedValue)
}

const BASE_HEADERS = [
  '项目名称',
  '客户全称',
  '平台租户 Id',
  '客户经理',
  '商机来源',
  '客群',
  '区域',
  '卡型',
  '产品线',
  '余额消费',
  '余额卡时',
  '券卡时',
  '平台成本单价(元/卡时)',
  '平台售价单价(元/卡时)',
  '确认收入(不含税)',
  '售出时长成本(平台成本)',
  '赠送时长成本(平台成本)',
  '毛利(平台成本)',
  '售出时长成本(平台售价)',
  '赠送时长成本(平台售价)',
  '毛利(平台售价)',
  '备注',
] as const

const BASE_COL = {
  productLine: 8,
  balanceConsumption: 9,
  balanceCardHours: 10,
  voucherCardHours: 11,
  pcUnit: 12,
  spUnit: 13,
  confirmedRevenue: 14,
  pcSold: 15,
  pcGifted: 16,
  pcGross: 17,
  spSold: 18,
  spGifted: 19,
  spGross: 20,
} as const

function buildBaseDataSheet(rows: ExportRow[]) {
  const wsData: CellValue[][] = [[...BASE_HEADERS]]
  for (const row of rows) {
    wsData.push([
      row.project_name ?? '',
      row.customer_full_name ?? '',
      row.tenant_platform_id,
      row.account_manager_name ?? '',
      row.opportunity_source_label ?? '',
      row.customer_incentive_label ?? '',
      row.region_code,
      row.gpu_card_type_name ?? '',
      row.product_line,
      moneyNum(row.balance_consumption),
      moneyNum(row.balance_card_hours),
      moneyNum(row.voucher_card_hours),
      pcUnitPerHour(row),
      spUnitPerHour(row),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      row.remark ?? '',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  for (let r = 1; r < wsData.length; r++) {
    const excelRow = r + 1
    const row = rows[r - 1]!
    const bal = colRef(BASE_COL.balanceConsumption, excelRow)
    const balH = colRef(BASE_COL.balanceCardHours, excelRow)
    const vouchH = colRef(BASE_COL.voucherCardHours, excelRow)
    const rev = colRef(BASE_COL.confirmedRevenue, excelRow)
    const pcUnit = colRef(BASE_COL.pcUnit, excelRow)
    const spUnit = colRef(BASE_COL.spUnit, excelRow)
    const pcSold = colRef(BASE_COL.pcSold, excelRow)
    const pcGift = colRef(BASE_COL.pcGifted, excelRow)
    const spSold = colRef(BASE_COL.spSold, excelRow)
    const spGift = colRef(BASE_COL.spGifted, excelRow)
    const pl = colRef(BASE_COL.productLine, excelRow)

    setFormulaCell(
      ws,
      BASE_COL.confirmedRevenue,
      r,
      `${bal}/${COST_TAX_DIVISOR}`,
      parseMoney(row.confirmed_revenue_excl_tax),
    )
    setFormulaCell(
      ws,
      BASE_COL.pcSold,
      r,
      `${pcUnit}*${balH}/${COST_TAX_DIVISOR}`,
      parseMoney(row.pc_sold_duration_cost_excl_tax),
    )
    setFormulaCell(
      ws,
      BASE_COL.pcGifted,
      r,
      `${pcUnit}*${vouchH}/${COST_TAX_DIVISOR}`,
      parseMoney(row.pc_gifted_duration_cost_excl_tax),
    )
    setFormulaCell(
      ws,
      BASE_COL.pcGross,
      r,
      `${rev}-${pcSold}-${pcGift}`,
      parseMoney(row.pc_gross_profit),
    )
    setFormulaCell(
      ws,
      BASE_COL.spSold,
      r,
      `IF(${pl}="spot",0,${spUnit}*${balH}/${COST_TAX_DIVISOR})`,
      parseMoney(row.sp_sold_duration_cost_excl_tax),
    )
    setFormulaCell(
      ws,
      BASE_COL.spGifted,
      r,
      `IF(${pl}="spot",0,${spUnit}*${vouchH}/${COST_TAX_DIVISOR})`,
      parseMoney(row.sp_gifted_duration_cost_excl_tax),
    )
    setFormulaCell(
      ws,
      BASE_COL.spGross,
      r,
      `IF(${pl}="spot",${bal}*${SPOT_GROSS_RATE},${rev}-${spSold}-${spGift})`,
      parseMoney(row.sp_gross_profit),
    )
  }
  applyHeaderRow(ws, BASE_HEADERS.length)
  ws['!cols'] = BASE_HEADERS.map((h) => ({ wch: Math.max(10, h.length + 1) }))
  return ws
}

function groupByProject(rows: ExportRow[]): Map<string, ExportRow[]> {
  const map = new Map<string, ExportRow[]>()
  for (const row of rows) {
    if (!row.project_id) continue
    const list = map.get(row.project_id) ?? []
    list.push(row)
    map.set(row.project_id, list)
  }
  return map
}

const SALES_HEADERS = [
  '结算月',
  '平台租户ID',
  '客户全称',
  '客户经理',
  '商机来源',
  '客群',
  '区域',
  '卡型',
  ...METRIC_HEADERS,
] as const

function buildSalesPersonalSheet(rows: ExportRow[], usageMonth: string, branch: MonthlyCostBranch) {
  const wsData: CellValue[][] = [[...SALES_HEADERS]]
  const metricCol = metricStartCol(SALES_HEADERS)
  const projectGroups = [...groupByProject(rows).entries()].sort((a, b) => {
    const amCmp = (a[1][0]?.account_manager_name ?? '').localeCompare(
      b[1][0]?.account_manager_name ?? '',
      'zh-CN',
    )
    if (amCmp !== 0) return amCmp
    return (a[1][0]?.project_name ?? '').localeCompare(b[1][0]?.project_name ?? '', 'zh-CN')
  })

  type Block = { summaryRow0: number; detailRow0s: number[]; lines: ExportRow[] }
  const blocks: Block[] = []

  for (const [, lines] of projectGroups) {
    const sorted = [...lines].sort((a, b) =>
      `${a.region_code}:${a.gpu_card_type_name}`.localeCompare(
        `${b.region_code}:${b.gpu_card_type_name}`,
      ),
    )
    const first = sorted[0]!
    const sums = sumRows(sorted, branch)

    const summaryRow0 = wsData.length
    wsData.push([
      usageMonth,
      first.tenant_platform_id,
      first.customer_full_name ?? '',
      first.account_manager_name ?? '',
      first.opportunity_source_label ?? '',
      first.customer_incentive_label ?? '',
      '',
      '',
      moneyNum(String(sums.balanceConsumption)),
      moneyNum(String(sums.balanceCardHours)),
      moneyNum(String(sums.voucherCardHours)),
      '',
      '',
      '',
      '',
    ])

    const detailRow0s: number[] = []
    for (const line of sorted) {
      detailRow0s.push(wsData.length)
      wsData.push([
        '',
        '',
        '',
        '',
        '',
        '',
        line.region_code,
        line.gpu_card_type_name ?? '',
        moneyNum(line.balance_consumption),
        moneyNum(line.balance_card_hours),
        moneyNum(line.voucher_card_hours),
        '',
        '',
        '',
        '',
      ])
    }
    blocks.push({ summaryRow0, detailRow0s, lines: sorted })
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  applyHeaderRow(ws, SALES_HEADERS.length)

  for (const block of blocks) {
    if (block.detailRow0s.length === 0) continue
    const firstDetailExcel = block.detailRow0s[0]! + 1
    const lastDetailExcel = block.detailRow0s[block.detailRow0s.length - 1]! + 1
    const summaryExcel = block.summaryRow0 + 1

    for (let m = 0; m < 3; m++) {
      const col = metricCol + m
      setFormulaCell(
        ws,
        col,
        block.summaryRow0,
        `SUM(${colRef(col, firstDetailExcel)}:${colRef(col, lastDetailExcel)})`,
        0,
      )
    }
    setFormulaCell(
      ws,
      metricCol + 3,
      block.summaryRow0,
      `${colRef(metricCol, summaryExcel)}/${COST_TAX_DIVISOR}`,
      0,
    )
    for (let m = 4; m <= 5; m++) {
      const col = metricCol + m
      setFormulaCell(
        ws,
        col,
        block.summaryRow0,
        `SUM(${colRef(col, firstDetailExcel)}:${colRef(col, lastDetailExcel)})`,
        0,
      )
    }
    const rev = colRef(metricCol + 3, summaryExcel)
    const sold = colRef(metricCol + 4, summaryExcel)
    const gifted = colRef(metricCol + 5, summaryExcel)
    setFormulaCell(
      ws,
      metricCol + 6,
      block.summaryRow0,
      `${rev}-${sold}-${gifted}`,
      0,
    )

    block.detailRow0s.forEach((row0, idx) => {
      const line = block.lines[idx]!
      applyMetricFormulas(ws, row0, metricCol, {
        balanceConsumption: parseMoney(line.balance_consumption),
        balanceCardHours: Number(line.balance_card_hours),
        voucherCardHours: Number(line.voucher_card_hours),
        soldCost: branchSold(line, branch),
        giftedCost: branchGifted(line, branch),
        useBranchFormulas: true,
        useSpotGross: branch === 'platform_sell_price',
        productLine: line.product_line,
        unitPrice: branch === 'platform_sell_price' ? spUnitPerHour(line) : pcUnitPerHour(line),
      })
    })
  }

  return ws
}

function buildProjectSummarySheet(
  rows: ExportRow[],
  headers: readonly string[],
  branch: MonthlyCostBranch,
  filter: (lines: ExportRow[]) => ExportRow[],
) {
  const wsData: CellValue[][] = [[...headers]]
  const metricCol = metricStartCol(headers)
  const filtered = filter(rows)
  const groups = [...groupByProject(filtered).entries()].sort((a, b) =>
    (a[1][0]?.project_name ?? '').localeCompare(b[1][0]?.project_name ?? '', 'zh-CN'),
  )

  for (const [, lines] of groups) {
    const first = lines[0]!
    const sums = sumRows(lines, branch)
    const row: CellValue[] = new Array(headers.length).fill('')
    row[0] = first.project_name ?? ''
    const tenantIdx = headers.indexOf('平台租户ID')
    if (tenantIdx >= 0) row[tenantIdx] = first.tenant_platform_id
    row[headers.indexOf('客户全称')] = first.customer_full_name ?? ''
    row[headers.indexOf('客户经理')] = first.account_manager_name ?? ''
    const deliveryIdx = headers.indexOf('交付')
    if (deliveryIdx >= 0) row[deliveryIdx] = first.delivery_manager_name ?? ''
    const csIdx = headers.indexOf('客成')
    if (csIdx >= 0) row[csIdx] = first.customer_success_name ?? ''
    row[headers.indexOf('商机来源')] = first.opportunity_source_label ?? ''
    row[headers.indexOf('客群')] = first.customer_incentive_label ?? ''
    row[metricCol] = moneyNum(String(sums.balanceConsumption))
    row[metricCol + 1] = moneyNum(String(sums.balanceCardHours))
    row[metricCol + 2] = moneyNum(String(sums.voucherCardHours))
    wsData.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  applyHeaderRow(ws, headers.length)

  for (let r = 1; r < wsData.length; r++) {
    const lines = groups[r - 1]?.[1] ?? []
    const sums = sumRows(lines, branch)
    applyMetricFormulas(ws, r, metricCol, {
      balanceConsumption: sums.balanceConsumption,
      balanceCardHours: sums.balanceCardHours,
      voucherCardHours: sums.voucherCardHours,
      soldCost: sums.soldCost,
      giftedCost: sums.giftedCost,
    })
    const excelRow = r + 1
    const rev = colRef(metricCol + 3, excelRow)
    const sold = colRef(metricCol + 4, excelRow)
    const gifted = colRef(metricCol + 5, excelRow)
    setFormulaCell(ws, metricCol + 6, r, `${rev}-${sold}-${gifted}`, sums.gross)
  }

  return ws
}

const MIDDLE_HEADERS = [
  '项目名称',
  '平台租户ID',
  '客户全称',
  '客户经理',
  '交付',
  '客成',
  '商机来源',
  '客群',
  ...METRIC_HEADERS,
] as const

const GROSS_HEADERS = [
  '项目名称',
  '平台租户ID',
  '客户全称',
  '客户经理',
  '商机来源',
  '客群',
  ...METRIC_HEADERS,
] as const

const DURATION_HEADERS = [
  '项目名称',
  '客户全称',
  '租户Id',
  '客户经理',
  '商机来源',
  '客群',
  ...METRIC_HEADERS,
  '毛利小计',
  '',
  '比例',
  '最终金额',
] as const

function buildDurationSheet(rows: ExportRow[], branch: MonthlyCostBranch) {
  const wsData: CellValue[][] = [[...DURATION_HEADERS]]
  const metricCol = metricStartCol(DURATION_HEADERS)
  const grossSubtotalCol = DURATION_HEADERS.indexOf('毛利小计')
  const ratioCol = DURATION_HEADERS.indexOf('比例')
  const finalCol = DURATION_HEADERS.indexOf('最终金额')

  const groups = [...groupByProject(rows).entries()].sort((a, b) =>
    (a[1][0]?.project_name ?? '').localeCompare(b[1][0]?.project_name ?? '', 'zh-CN'),
  )

  for (const [, lines] of groups) {
    const first = lines[0]!
    const sums = sumRows(lines, branch)
    const row: CellValue[] = new Array(DURATION_HEADERS.length).fill('')
    row[0] = first.project_name ?? ''
    row[1] = first.customer_full_name ?? ''
    row[2] = first.tenant_platform_id
    row[3] = first.account_manager_name ?? ''
    row[4] = first.opportunity_source_label ?? ''
    row[5] = first.customer_incentive_label ?? ''
    row[metricCol] = moneyNum(String(sums.balanceConsumption))
    row[metricCol + 1] = moneyNum(String(sums.balanceCardHours))
    row[metricCol + 2] = moneyNum(String(sums.voucherCardHours))
    row[ratioCol] = 1
    wsData.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  applyHeaderRow(ws, DURATION_HEADERS.length)

  for (let r = 1; r < wsData.length; r++) {
    const lines = groups[r - 1]?.[1] ?? []
    const sums = sumRows(lines, branch)
    applyMetricFormulas(ws, r, metricCol, {
      balanceConsumption: sums.balanceConsumption,
      balanceCardHours: sums.balanceCardHours,
      voucherCardHours: sums.voucherCardHours,
      soldCost: sums.soldCost,
      giftedCost: sums.giftedCost,
    })
    const excelRow = r + 1
    const grossRef = colRef(metricCol + 6, excelRow)
    setFormulaCell(ws, grossSubtotalCol, r, grossRef, sums.gross)
    const ratioRef = colRef(ratioCol, excelRow)
    const subtotalRef = colRef(grossSubtotalCol, excelRow)
    setFormulaCell(ws, finalCol, r, `${subtotalRef}*${ratioRef}`, sums.gross)
  }

  return ws
}

function buildRegionGpuCostSheet(
  rows: ExportRow[],
  sheetKind: 'platform_cost' | 'platform_sell_price',
) {
  const isSell = sheetKind === 'platform_sell_price'
  const branch: MonthlyCostBranch = isSell ? 'platform_sell_price' : 'platform_cost'
  const headers = [
    '区域',
    '卡型',
    '求和项:余额卡时',
    '求和项:券卡时',
    isSell ? '平台售价单价(元/卡时)' : '平台成本单价(元/卡时)',
    '售出时长成本(不含税)',
    '赠送时长成本(不含税)',
  ] as const

  const map = new Map<string, ExportRow[]>()
  for (const row of rows) {
    const key = `${row.region_code}::${row.gpu_card_type_name ?? ''}`
    const list = map.get(key) ?? []
    list.push(row)
    map.set(key, list)
  }

  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const wsData: CellValue[][] = [[...headers]]

  for (const [, lines] of entries) {
    const first = lines[0]!
    const balH = lines.reduce((s, l) => s + Number(l.balance_card_hours), 0)
    const vouchH = lines.reduce((s, l) => s + Number(l.voucher_card_hours), 0)
    const unit =
      balH > 0
        ? lines.reduce(
            (s, l) =>
              s +
              (isSell ? spUnitPerHour(l) : pcUnitPerHour(l)) * Number(l.balance_card_hours),
            0,
          ) / balH
        : isSell
          ? spUnitPerHour(first)
          : pcUnitPerHour(first)

    wsData.push([first.region_code, first.gpu_card_type_name ?? '', balH, vouchH, unit, '', ''])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  applyHeaderRow(ws, headers.length)

  for (let r = 1; r < wsData.length; r++) {
    const excelRow = r + 1
    const unit = colRef(4, excelRow)
    const balH = colRef(2, excelRow)
    const vouchH = colRef(3, excelRow)
    const line = entries[r - 1]![1]
    const sold = line.reduce((s, l) => s + branchSold(l, branch), 0)
    const gifted = line.reduce((s, l) => s + branchGifted(l, branch), 0)
    setFormulaCell(ws, 5, r, `${unit}*${balH}/${COST_TAX_DIVISOR}`, sold)
    setFormulaCell(ws, 6, r, `${unit}*${vouchH}/${COST_TAX_DIVISOR}`, gifted)
  }

  return ws
}

export function downloadMonthlyCostWorkbookExcel(params: {
  rows: ExportRow[]
  usageMonth: string
  periodCode: string
  costBranch: MonthlyCostBranch
}): boolean {
  if (params.rows.length === 0) return false

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildBaseDataSheet(params.rows), '基础数据')
  XLSX.utils.book_append_sheet(
    wb,
    buildSalesPersonalSheet(params.rows, params.usageMonth, params.costBranch),
    '汇总-销售-个人',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildProjectSummarySheet(
      params.rows,
      MIDDLE_HEADERS,
      params.costBranch,
      (lines) => lines.filter((l) => l.opportunity_source === 'marketing_sales'),
    ),
    '汇总-市场',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildProjectSummarySheet(params.rows, MIDDLE_HEADERS, params.costBranch, (lines) => lines),
    '汇总-中台',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildProjectSummarySheet(params.rows, GROSS_HEADERS, params.costBranch, (lines) => lines),
    '汇总-毛利',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildDurationSheet(params.rows, params.costBranch),
    '汇总-时长',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildRegionGpuCostSheet(params.rows, 'platform_cost'),
    '机房-卡时成本',
  )
  XLSX.utils.book_append_sheet(
    wb,
    buildRegionGpuCostSheet(params.rows, 'platform_sell_price'),
    '卡时销售成本',
  )

  const branchLabel = MONTHLY_COST_BRANCH_LABELS[params.costBranch]
  XLSX.writeFile(wb, `月度成本-${params.periodCode}-${branchLabel}.xlsx`)
  return true
}

export function downloadMonthlyCostBaseLinesExcel(params: {
  rows: ExportRow[]
  periodCode: string
  usageMonth: string
  costBranch: MonthlyCostBranch
}): boolean {
  return downloadMonthlyCostWorkbookExcel(params)
}

type AmLine = {
  account_manager_name: string
  opportunity_source: OpportunitySource
  opportunity_source_label: string | null
  customer_incentive_label: string
  gross_profit_sum: string
  commission_rate: string
  commission_amount: string
}

export function downloadMonthlyCostAmExcel(params: {
  lines: AmLine[]
  periodCode: string
  costBranch: MonthlyCostBranch
}): boolean {
  if (params.lines.length === 0) return false

  const detailData: CellValue[][] = [
    ['客户经理', '商机来源', '客群', '毛利基数', '提点', '提成金额'],
  ]
  for (const line of params.lines) {
    detailData.push([
      line.account_manager_name,
      line.opportunity_source_label ??
        MONTHLY_COST_OPPORTUNITY_SHORT_LABELS[line.opportunity_source],
      line.customer_incentive_label,
      moneyNum(line.gross_profit_sum),
      Number(line.commission_rate),
      '',
    ])
  }

  const detailWs = XLSX.utils.aoa_to_sheet(detailData)
  for (let r = 1; r < detailData.length; r++) {
    const excelRow = r + 1
    const line = params.lines[r - 1]!
    setFormulaCell(
      detailWs,
      5,
      r,
      `${colRef(3, excelRow)}*${colRef(4, excelRow)}`,
      parseMoney(line.commission_amount),
    )
  }
  applyHeaderRow(detailWs, 6)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, detailWs, '明细')
  const branchLabel = MONTHLY_COST_BRANCH_LABELS[params.costBranch]
  XLSX.writeFile(wb, `月度成本客户经理提成-${params.periodCode}-${branchLabel}.xlsx`)
  return true
}

type DeptProjectLine = {
  recipient_dept: string
  customer_incentive_label: string
  project_name: string | null
  project_id: string
  opportunity_source_label: string | null
  account_manager_name: string | null
  gross_profit_base: string
  commission_pool_amount: string
}

function deptRate(dept: string, label: string): number {
  const incentive = label as MonthlyCostIncentiveLabel
  if (dept === '中台') return MONTHLY_COST_MIDDLE_DEPT_RATES[incentive]
  if (dept === '市场') return MONTHLY_COST_MARKETING_DEPT_RATES[incentive]
  return 0
}

export function downloadMonthlyCostDeptExcel(params: {
  projectLines: DeptProjectLine[]
  periodCode: string
  costBranch: MonthlyCostBranch
}): boolean {
  if (params.projectLines.length === 0) return false

  const detailData: CellValue[][] = [
    ['部门', '客群', '项目名称', '商机来源', '客户经理', '毛利基数', '提点', '入池金额'],
  ]
  for (const line of params.projectLines) {
    detailData.push([
      line.recipient_dept,
      line.customer_incentive_label,
      line.project_name ?? line.project_id,
      line.opportunity_source_label ?? '',
      line.account_manager_name ?? '',
      moneyNum(line.gross_profit_base),
      deptRate(line.recipient_dept, line.customer_incentive_label),
      '',
    ])
  }

  const detailWs = XLSX.utils.aoa_to_sheet(detailData)
  for (let r = 1; r < detailData.length; r++) {
    const excelRow = r + 1
    const line = params.projectLines[r - 1]!
    setFormulaCell(
      detailWs,
      7,
      r,
      `${colRef(5, excelRow)}*${colRef(6, excelRow)}`,
      parseMoney(line.commission_pool_amount),
    )
  }
  applyHeaderRow(detailWs, 8)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, detailWs, '项目明细')
  const branchLabel = MONTHLY_COST_BRANCH_LABELS[params.costBranch]
  XLSX.writeFile(wb, `月度成本部门池提成-${params.periodCode}-${branchLabel}.xlsx`)
  return true
}
