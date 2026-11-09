import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  buildSettlementTemplateWorkbook,
  parseSettlementWorkbook,
  SETTLEMENT_COLUMNS,
  TRANSACTION_COLUMNS,
  SETTLEMENT_IMPORT_LIMITS,
} from './settlement-import'

const SHOPS = [
  { id: 'shop-1', name: 'Daraz Colombo', platform: 'Daraz', currency: 'LKR' },
  { id: 'shop-2', name: 'Lazada Kandy', platform: 'Lazada', currency: 'LKR' },
  { id: 'shop-3', name: 'Dup Shop', platform: 'Daraz', currency: 'USD' },
  { id: 'shop-4', name: 'Dup Shop', platform: 'Lazada', currency: 'USD' },
]

function toBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

function workbookFromSheets(sheets: Record<string, unknown[][] | Record<string, unknown>[]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, data] of Object.entries(sheets)) {
    const sheet = Array.isArray(data[0])
      ? XLSX.utils.aoa_to_sheet(data as unknown[][])
      : XLSX.utils.json_to_sheet(data as Record<string, unknown>[])
    XLSX.utils.book_append_sheet(wb, sheet, name)
  }
  return toBuffer(wb)
}

test('template contains settlements / transaction_details / 说明 sheets with all columns', () => {
  const wb = buildSettlementTemplateWorkbook()
  assert.deepEqual(wb.SheetNames, ['settlements', 'transaction_details', '说明'])

  const settlementHeader = XLSX.utils.sheet_to_json<string>(wb.Sheets['settlements']!, { header: 1 })[0]
  assert.deepEqual(
    settlementHeader,
    SETTLEMENT_COLUMNS.map((c) => c.key),
  )
  const lineHeader = XLSX.utils.sheet_to_json<string>(wb.Sheets['transaction_details']!, { header: 1 })[0]
  assert.deepEqual(
    lineHeader,
    TRANSACTION_COLUMNS.map((c) => c.key),
  )
  // template must round-trip through parse (sample rows use placeholder shop → skipped, not crash)
  const result = parseSettlementWorkbook(toBuffer(wb), SHOPS)
  assert.ok(result.issues.length > 0, 'placeholder sample rows should be reported')
  assert.equal(result.stats.settlements, 0)
})

test('parses settlement rows with English API headers and derives status from paid', () => {
  const buffer = workbookFromSheets({
    settlements: [
      {
        shop: 'Daraz Colombo',
        statement_number: 'SET-001',
        currency: 'LKR',
        closing_balance: '1,234.56',
        item_revenue: 2000,
        refunds: 100,
        fees_total: 50,
        payout: 1184.56,
        paid: '1',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        created_at: '2026-11-01',
        note: 'from excel',
      },
    ],
  })
  const result = parseSettlementWorkbook(buffer, SHOPS)
  assert.equal(result.issues.length, 0)
  assert.equal(result.stats.settlements, 1)
  const [row] = result.rows
  assert.ok(row)
  assert.equal(row.shopId, 'shop-1')
  assert.equal(row.externalSettlementId, 'SET-001')
  assert.equal(row.currency, 'LKR')
  assert.equal(row.closingBalance, 1234.56)
  assert.equal(row.billAmount, 1234.56)
  assert.equal(row.itemRevenue, 2000)
  assert.equal(row.refundsAmount, 100)
  assert.equal(row.feesTotal, 50)
  assert.equal(row.payoutAmount, 1184.56)
  assert.equal(row.paid, true)
  assert.equal(row.status, '已打款')
  assert.equal(row.periodStart, '2026-10-01')
  assert.equal(row.platformCreatedAt, '2026-11-01')
  assert.equal(row.note, 'from excel')
})

test('parses Chinese header aliases and explicit status wins over paid', () => {
  const buffer = workbookFromSheets({
    结算单: [
      ['店铺', '结算单号', '币种', '期末余额', '应打款金额', '打款状态', '状态'],
      ['Lazada Kandy', 'SET-002', 'LKR', 500, 500, '0', '已确认'],
    ],
  })
  const result = parseSettlementWorkbook(buffer, SHOPS)
  assert.equal(result.issues.length, 0)
  const [row] = result.rows
  assert.ok(row)
  assert.equal(row.shopId, 'shop-2')
  assert.equal(row.externalSettlementId, 'SET-002')
  assert.equal(row.paid, false)
  assert.equal(row.status, '已确认')
})

test('ambiguous shop name without platform is skipped with issue', () => {
  const buffer = workbookFromSheets({
    settlements: [
      ['shop', 'statement_number'],
      ['Dup Shop', 'SET-003'],
      ['shop-3', 'SET-004'],
    ],
  })
  const result = parseSettlementWorkbook(buffer, SHOPS)
  assert.equal(result.stats.settlements, 1)
  assert.equal(result.rows[0]?.shopId, 'shop-3')
  assert.equal(result.stats.skippedLines, 1)
  assert.ok(result.issues.some((i) => i.row === 2 && i.message.includes('重名')))
})

test('disambiguates duplicate shop name via platform column', () => {
  const buffer = workbookFromSheets({
    settlements: [
      ['shop', 'platform', 'statement_number'],
      ['Dup Shop', 'Lazada', 'SET-005'],
    ],
  })
  const result = parseSettlementWorkbook(buffer, SHOPS)
  assert.equal(result.issues.length, 0)
  assert.equal(result.rows[0]?.shopId, 'shop-4')
})

test('attaches transaction lines via statement and skips unmatched ones', () => {
  const buffer = workbookFromSheets({
    settlements: [
      ['shop', 'statement_number', 'currency'],
      ['Daraz Colombo', 'SET-001', 'LKR'],
    ],
    transaction_details: [
      {
        statement: 'SET-001',
        transaction_number: 'TXN-1',
        transaction_type: 'Commission',
        fee_name: 'Commission',
        amount: 10,
        order_no: 'ORD-1',
        seller_sku: 'SKU-1',
        WHT_included_in_amount: 'Yes',
      },
      { statement: 'MISSING', transaction_number: 'TXN-2', amount: 5 },
    ],
  })
  const result = parseSettlementWorkbook(buffer, SHOPS)
  assert.equal(result.stats.settlements, 1)
  assert.equal(result.stats.lines, 1)
  assert.equal(result.stats.skippedLines, 1)
  const line = result.rows[0]?.lines?.[0]
  assert.ok(line)
  assert.equal(line.externalTransactionId, 'TXN-1')
  assert.equal(line.externalOrderNo, 'ORD-1')
  assert.equal(line.sellerSku, 'SKU-1')
  assert.equal(line.amount, 10)
  assert.equal(line.whtIncludedInAmount, true)
  assert.ok(result.issues.some((i) => i.message.includes('MISSING')))
})

test('missing required columns are reported per row and settlement limit is enforced', () => {
  const rows: unknown[][] = [['shop', 'statement_number']]
  for (let i = 0; i <= SETTLEMENT_IMPORT_LIMITS.maxSettlements; i += 1) {
    rows.push(['shop-1', `SET-${i}`])
  }
  const missingBuffer = workbookFromSheets({
    settlements: [['shop', 'statement_number'], ['', 'SET-X'], ['shop-1', '']],
  })
  const missing = parseSettlementWorkbook(missingBuffer, SHOPS)
  assert.equal(missing.stats.settlements, 0)
  assert.equal(missing.issues.length, 2)
  assert.ok(missing.issues.every((i) => i.message.includes('缺少必填列')))

  const overLimit = parseSettlementWorkbook(workbookFromSheets({ settlements: rows }), SHOPS)
  assert.equal(overLimit.rows.length, 0)
  assert.ok(overLimit.issues.some((i) => i.message.includes('上限')))
})

test('workbook without settlement sheet returns a single issue', () => {
  const buffer = workbookFromSheets({ 说明: [['列'], ['shop']] })
  const result = parseSettlementWorkbook(buffer, SHOPS)
  assert.equal(result.rows.length, 0)
  assert.equal(result.issues.length, 1)
  assert.ok(result.issues[0]?.message.includes('settlements'))
})
