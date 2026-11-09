/**
 * 结算账单 Excel 模板生成与解析（纯函数，客户端使用）。
 * 列设计对齐 Lazada / Daraz Finance OpenAPI：
 * @see docs/design/platform-apis/daraz/daraz-finance-api.md §3 GetPayoutStatus / §4 QueryTransactionDetails
 * 费用 feeKind 推断在服务端 dataaccess 复用 @workspace/marketplace inferFeeKind，客户端不引 marketplace（含 node:crypto）。
 */
import * as XLSX from 'xlsx'

export const SETTLEMENT_IMPORT_LIMITS = {
  maxSettlements: 200,
  maxLines: 5000,
} as const

export type SettlementImportShop = {
  id: string
  name: string
  platform?: string | null
  currency?: string | null
}

export type SettlementImportLineRow = {
  externalTransactionId?: string
  externalOrderNo?: string
  transactionType?: string
  feeType?: string
  feeName?: string
  amount?: number
  taxAmount?: number
  whtAmount?: number
  whtIncludedInAmount?: boolean
  currency?: string
  paidStatus?: string
  paymentReference?: string
  sellerSku?: string
  platformSkuId?: string
  shippingProvider?: string
  shippingSpeed?: string
  shipmentType?: string
  note?: string
}

export type SettlementImportRow = {
  shopId: string
  externalSettlementId: string
  currency?: string
  periodStart?: string
  periodEnd?: string
  billAmount?: number
  itemRevenue?: number
  otherRevenueTotal?: number
  subtotal1?: number
  subtotal2?: number
  refundsAmount?: number
  feesOnRefundsTotal?: number
  shipmentFee?: number
  shipmentFeeCredit?: number
  feesTotal?: number
  guaranteeDeposit?: number
  openingBalance?: number
  closingBalance?: number
  payoutAmount?: number
  payoutStatus?: string
  paid?: boolean
  platformCreatedAt?: string
  platformUpdatedAt?: string
  status?: string
  note?: string
  lines?: SettlementImportLineRow[]
}

export type SettlementImportIssue = {
  sheet: string
  /** Excel 行号（含表头，1-based）；0 表示整表问题。 */
  row: number
  message: string
}

export type SettlementWorkbookParseResult = {
  rows: SettlementImportRow[]
  issues: SettlementImportIssue[]
  stats: { settlements: number; lines: number; skippedLines: number }
}

type ColumnSpec = {
  key: string
  aliases: string[]
  required?: boolean
  desc: string
}

/** settlements 工作表列（表头 = key，解析兼容 aliases 中英文别名）。 */
export const SETTLEMENT_COLUMNS: ColumnSpec[] = [
  { key: 'shop', aliases: ['shop', 'shopid', '店铺', '店铺名称', '店铺id'], required: true, desc: '店铺名称或店铺 ID（本组织内）' },
  { key: 'platform', aliases: ['platform', '平台'], desc: '可选；店铺重名时用于区分' },
  { key: 'statement_number', aliases: ['statement_number', 'statementnumber', 'externalsettlementid', '结算单号', '外部结算单号'], required: true, desc: '平台结算单号，幂等主键（同店铺重复导入会覆盖）' },
  { key: 'currency', aliases: ['currency', '币种'], desc: '3 位币种码；缺省取店铺币种' },
  { key: 'created_at', aliases: ['created_at', 'createdat', '结算单创建时间'], desc: '平台结算单创建时间' },
  { key: 'updated_at', aliases: ['updated_at', 'updatedat', '更新时间'], desc: '平台最后更新时间' },
  { key: 'opening_balance', aliases: ['opening_balance', 'openingbalance', '期初余额'], desc: '期初余额' },
  { key: 'closing_balance', aliases: ['closing_balance', 'closingbalance', '期末余额'], desc: '期末余额；缺省时作为账单额' },
  { key: 'item_revenue', aliases: ['item_revenue', 'itemrevenue', '商品收入'], desc: '商品收入' },
  { key: 'other_revenue_total', aliases: ['other_revenue_total', 'otherrevenuetotal', '其他收入合计'], desc: '其他收入合计' },
  { key: 'subtotal1', aliases: ['subtotal1', '收入小计1'], desc: '商品收入 + 其他收入' },
  { key: 'refunds', aliases: ['refunds', 'refundsamount', '退款合计'], desc: '退款合计' },
  { key: 'subtotal2', aliases: ['subtotal2', '收入小计2'], desc: 'subtotal1 - refunds' },
  { key: 'shipment_fee', aliases: ['shipment_fee', 'shipmentfee', '运费成本'], desc: '运费成本' },
  { key: 'shipment_fee_credit', aliases: ['shipment_fee_credit', 'shipmentfeecredit', '运费抵扣'], desc: '运费抵扣 / 返还' },
  { key: 'fees_total', aliases: ['fees_total', 'feestotal', '费用合计'], desc: '支付手续费 + 退货给卖家费用' },
  { key: 'fees_on_refunds_total', aliases: ['fees_on_refunds_total', 'feesonrefundstotal', '退款相关费用'], desc: '退款累计费用' },
  { key: 'guarantee_deposit', aliases: ['guarantee_deposit', 'guaranteedeposit', '保证金'], desc: '保证金' },
  { key: 'payout', aliases: ['payout', 'payoutamount', '应打款金额'], desc: '本结算单应打款金额' },
  { key: 'paid', aliases: ['paid', 'paid_status', '打款状态'], desc: '1/0、Yes/No 或 paid/unpaid；影响状态（已打款 / 待匹配）' },
  { key: 'bill_amount', aliases: ['bill_amount', 'billamount', '账单额'], desc: '可选；缺省取 closing_balance 或 payout' },
  { key: 'period_start', aliases: ['period_start', 'periodstart', '账期开始'], desc: 'yyyy-mm-dd' },
  { key: 'period_end', aliases: ['period_end', 'periodend', '账期结束'], desc: 'yyyy-mm-dd' },
  { key: 'status', aliases: ['status', '状态'], desc: '待匹配 / 差异待处理 / 已确认 / 已打款；优先于 paid' },
  { key: 'note', aliases: ['note', '备注'], desc: '导入备注，写入 raw.importNote' },
]

/** transaction_details 工作表列；经 statement 关联 settlements。 */
export const TRANSACTION_COLUMNS: ColumnSpec[] = [
  { key: 'statement', aliases: ['statement', 'statement_number', '所属结算单', '结算单号'], required: true, desc: '所属结算单号，关联 settlements.statement_number' },
  { key: 'transaction_number', aliases: ['transaction_number', 'transactionnumber', '交易号', '交易唯一号'], required: true, desc: '平台交易号，幂等主键' },
  { key: 'transaction_date', aliases: ['transaction_date', 'transactiondate', '交易日期'], desc: '交易发生时间' },
  { key: 'transaction_type', aliases: ['transaction_type', 'transactiontype', '交易类型'], desc: '交易类型 / 费用名' },
  { key: 'fee_type', aliases: ['fee_type', 'feetype', '费用类型id'], desc: '交易类型 ID' },
  { key: 'fee_name', aliases: ['fee_name', 'feename', '费用名称'], desc: '费用名称' },
  { key: 'details', aliases: ['details', '明细描述'], desc: '交易明细描述（记入备注）' },
  { key: 'amount', aliases: ['amount', '金额'], desc: '交易总额' },
  { key: 'VAT_in_amount', aliases: ['vat_in_amount', 'vatamount', 'vat', '税额'], desc: '金额中的 VAT' },
  { key: 'WHT_amount', aliases: ['wht_amount', 'whtamount', 'wht', '预扣税'], desc: '预扣税金额' },
  { key: 'WHT_included_in_amount', aliases: ['wht_included_in_amount', 'whtincluded'], desc: 'WHT 是否已含在 amount（Yes/No）' },
  { key: 'paid_status', aliases: ['paid_status', 'paidstatus', '是否已结算'], desc: 'Yes / No' },
  { key: 'order_no', aliases: ['order_no', 'orderno', '订单号'], desc: '订单 ID' },
  { key: 'seller_sku', aliases: ['seller_sku', 'sellersku', '卖家sku'], desc: '卖家 SKU' },
  { key: 'lazada_sku', aliases: ['lazada_sku', 'platform_sku', 'platformskuid', '平台sku'], desc: '平台 SKU' },
  { key: 'shipping_provider', aliases: ['shipping_provider', 'shippingprovider', '物流商'], desc: '物流商' },
  { key: 'shipping_speed', aliases: ['shipping_speed', 'shippingspeed', '配送速度'], desc: '配送速度' },
  { key: 'shipment_type', aliases: ['shipment_type', 'shipmenttype', '发货类型'], desc: '发货类型' },
  { key: 'payment_ref_id', aliases: ['payment_ref_id', 'paymentreference', 'pmt_reference', '支付流水号'], desc: '银行 / 支付渠道流水号' },
  { key: 'comment', aliases: ['comment', '备注'], desc: '区域财务备注（记入备注）' },
]

const USAGE_NOTES: string[][] = [
  ['使用说明', '', '', ''],
  ['1', 'settlements 表：每行一个结算单；必填 shop + statement_number。', '', ''],
  ['2', 'transaction_details 表（可选）：每行一条交易明细，经 statement 关联结算单；匹配不到的明细会被跳过并在预览中计数。', '', ''],
  ['3', '金额按主单位填写（如 1234.56），不带千分位与货币符号。', '', ''],
  ['4', '无法识别的日期 / 金额单元格会被忽略；缺 shop、statement_number 的行会被跳过。', '', ''],
  ['5', '示例行请替换或删除；同店铺 + 同结算单号重复导入为覆盖更新，明细按交易号去重。', '', ''],
  ['6', '状态列优先于 paid 列；均未填时按 paid 派生（1 → 已打款，0 → 待匹配）。', '', ''],
]

function sheetName(wb: XLSX.WorkBook, match: (name: string) => boolean): string | null {
  return wb.SheetNames.find((name) => match(name.toLowerCase())) ?? null
}

function isDocSheet(name: string): boolean {
  return /说明|readme|instruction|使用/.test(name)
}

function rowMap(row: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const [key, value] of Object.entries(row)) {
    const normalized = key.trim().toLowerCase()
    if (!map.has(normalized)) map.set(normalized, value)
  }
  return map
}

function pick(map: Map<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = map.get(alias.toLowerCase())
    if (value != null && String(value).trim() !== '') return value
  }
  return undefined
}

function asText(value: unknown): string | undefined {
  if (value == null) return undefined
  const text = String(value).trim()
  return text || undefined
}

function asNumber(value: unknown): number | undefined {
  const text = asText(value)
  if (text == null) return undefined
  const parsed = Number(text.replace(/[,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function asDateText(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000))
    if (!Number.isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    }
  }
  const text = String(value).trim()
  if (!text) return undefined
  return Number.isNaN(new Date(text).getTime()) ? undefined : text
}

function asBoolean(value: unknown): boolean | undefined {
  const text = asText(value)?.toLowerCase()
  if (text == null) return undefined
  if (['1', 'yes', 'true', 'paid'].includes(text)) return true
  if (['0', 'no', 'false', 'unpaid'].includes(text)) return false
  return undefined
}

function readColumns(
  spec: ColumnSpec[],
  map: Map<string, unknown>,
): { values: Record<string, string | undefined>; missing: string[] } {
  const values: Record<string, string | undefined> = {}
  const missing: string[] = []
  for (const column of spec) {
    const raw = pick(map, [column.key, ...column.aliases])
    values[column.key] = asText(raw)
    if (column.required && !values[column.key]) missing.push(column.key)
  }
  return { values, missing }
}

function pushIssue(issues: SettlementImportIssue[], sheet: string, row: number, message: string) {
  issues.push({ sheet, row, message })
}

/**
 * 生成可下载模板：settlements / transaction_details / 说明 三个工作表。
 */
export function buildSettlementTemplateWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const settlementHeader = SETTLEMENT_COLUMNS.map((c) => c.key)
  const settlementSample: Record<string, unknown> = {
    shop: '（店铺名称或ID）',
    platform: 'Daraz',
    statement_number: 'SET-EXAMPLE-001',
    currency: 'LKR',
    opening_balance: 0,
    closing_balance: 1000,
    item_revenue: 1200,
    refunds: 100,
    fees_total: 100,
    payout: 1000,
    paid: '0',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    status: '待匹配',
    note: '示例行，导入前请替换或删除',
  }
  const settlementSheet = XLSX.utils.aoa_to_sheet([
    settlementHeader,
    settlementHeader.map((key) => settlementSample[key] ?? ''),
  ])
  settlementSheet['!cols'] = settlementHeader.map((key) => ({ wch: Math.max(12, key.length + 2) }))
  XLSX.utils.book_append_sheet(wb, settlementSheet, 'settlements')

  const lineHeader = TRANSACTION_COLUMNS.map((c) => c.key)
  const lineSample: Record<string, unknown> = {
    statement: 'SET-EXAMPLE-001',
    transaction_number: 'TXN-EXAMPLE-001',
    transaction_date: '2026-10-15',
    transaction_type: 'Commission',
    fee_name: 'Commission',
    amount: 100,
    order_no: 'ORDER-001',
    seller_sku: 'SKU-001',
    paid_status: 'No',
    comment: '示例行，导入前请替换或删除',
  }
  const lineSheet = XLSX.utils.aoa_to_sheet([
    lineHeader,
    lineHeader.map((key) => lineSample[key] ?? ''),
  ])
  lineSheet['!cols'] = lineHeader.map((key) => ({ wch: Math.max(12, key.length + 2) }))
  XLSX.utils.book_append_sheet(wb, lineSheet, 'transaction_details')

  const docRows: string[][] = [
    ['工作表', '列', '必填', '说明'],
    ...SETTLEMENT_COLUMNS.map((c) => ['settlements', c.key, c.required ? '是' : '', c.desc]),
    ...TRANSACTION_COLUMNS.map((c) => ['transaction_details', c.key, c.required ? '是' : '', c.desc]),
    [],
    ...USAGE_NOTES,
  ]
  const docSheet = XLSX.utils.aoa_to_sheet(docRows)
  docSheet['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 6 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, docSheet, '说明')

  return wb
}

/** 浏览器触发模板下载。 */
export function downloadSettlementTemplate() {
  XLSX.writeFile(buildSettlementTemplateWorkbook(), '结算账单导入模板.xlsx')
}

/** 解析上传的账单 Excel；仅纯函数，不做网络 / DB 访问。 */
export function parseSettlementWorkbook(
  buffer: ArrayBuffer,
  shops: SettlementImportShop[],
): SettlementWorkbookParseResult {
  const issues: SettlementImportIssue[] = []
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  const settlementSheetName =
    sheetName(wb, (n) => n.includes('settlement') || n.includes('结算')) ??
    wb.SheetNames.find((n) => !isDocSheet(n) && !/transaction|交易|明细/.test(n.toLowerCase()))
  if (!settlementSheetName) {
    return {
      rows: [],
      issues: [{ sheet: 'settlements', row: 0, message: '未找到 settlements（结算单）工作表' }],
      stats: { settlements: 0, lines: 0, skippedLines: 0 },
    }
  }

  const shopById = new Map<string, SettlementImportShop>()
  const shopsByName = new Map<string, SettlementImportShop[]>()
  for (const shop of shops) {
    shopById.set(shop.id.trim().toLowerCase(), shop)
    const key = shop.name.trim().toLowerCase()
    const list = shopsByName.get(key) ?? []
    list.push(shop)
    shopsByName.set(key, list)
  }

  function resolveShop(display: string, platform?: string): { shop?: SettlementImportShop; error?: string } {
    const text = display.trim()
    const byId = shopById.get(text.toLowerCase())
    if (byId) return { shop: byId }
    const candidates = shopsByName.get(text.toLowerCase()) ?? []
    if (candidates.length === 1) return { shop: candidates[0] }
    if (candidates.length > 1) {
      const platformMatch =
        platform && candidates.filter((c) => (c.platform ?? '').toLowerCase() === platform.trim().toLowerCase())
      if (platformMatch && platformMatch.length === 1) return { shop: platformMatch[0] }
      return { error: `店铺「${text}」重名，请填写店铺 ID${platform ? '或补全 platform 列' : ''}` }
    }
    return { error: `未找到店铺：${text}` }
  }

  const settlementRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[settlementSheetName]!,
    { defval: '' },
  )
  const rows: SettlementImportRow[] = []
  const rowByStatement = new Map<string, SettlementImportRow>()
  let skippedSettlements = 0

  settlementRows.forEach((raw, index) => {
    const excelRow = index + 2
    const map = rowMap(raw)
    const { values, missing } = readColumns(SETTLEMENT_COLUMNS, map)
    if (missing.length) {
      skippedSettlements += 1
      pushIssue(issues, 'settlements', excelRow, `缺少必填列：${missing.join('、')}`)
      return
    }
    const { shop, error } = resolveShop(values.shop!, values.platform)
    if (!shop) {
      skippedSettlements += 1
      pushIssue(issues, 'settlements', excelRow, error ?? '店铺无法解析')
      return
    }
    const statement = values.statement_number!
    const paid = asBoolean(pick(map, ['paid', 'paid_status', '打款状态']))
    const status = values.status
    const closingBalance = asNumber(pick(map, ['closing_balance', 'closingbalance', '期末余额']))
    const payout = asNumber(pick(map, ['payout', 'payoutamount', '应打款金额']))
    const billAmount = asNumber(pick(map, ['bill_amount', 'billamount', '账单额'])) ?? closingBalance ?? payout

    const row: SettlementImportRow = {
      shopId: shop.id,
      externalSettlementId: statement,
      currency: values.currency ?? shop.currency ?? undefined,
      periodStart: asDateText(pick(map, ['period_start', 'periodstart', '账期开始'])),
      periodEnd: asDateText(pick(map, ['period_end', 'periodend', '账期结束'])),
      billAmount,
      itemRevenue: asNumber(pick(map, ['item_revenue', 'itemrevenue', '商品收入'])),
      otherRevenueTotal: asNumber(pick(map, ['other_revenue_total', 'otherrevenuetotal', '其他收入合计'])),
      subtotal1: asNumber(pick(map, ['subtotal1', '收入小计1'])),
      subtotal2: asNumber(pick(map, ['subtotal2', '收入小计2'])),
      refundsAmount: asNumber(pick(map, ['refunds', 'refundsamount', '退款合计'])),
      feesOnRefundsTotal: asNumber(pick(map, ['fees_on_refunds_total', 'feesonrefundstotal', '退款相关费用'])),
      shipmentFee: asNumber(pick(map, ['shipment_fee', 'shipmentfee', '运费成本'])),
      shipmentFeeCredit: asNumber(pick(map, ['shipment_fee_credit', 'shipmentfeecredit', '运费抵扣'])),
      feesTotal: asNumber(pick(map, ['fees_total', 'feestotal', '费用合计'])),
      guaranteeDeposit: asNumber(pick(map, ['guarantee_deposit', 'guaranteedeposit', '保证金'])),
      openingBalance: asNumber(pick(map, ['opening_balance', 'openingbalance', '期初余额'])),
      closingBalance,
      payoutAmount: payout,
      paid,
      platformCreatedAt: asDateText(pick(map, ['created_at', 'createdat', '结算单创建时间'])),
      platformUpdatedAt: asDateText(pick(map, ['updated_at', 'updatedat', '更新时间'])),
      status:
        status ??
        (paid === true ? '已打款' : paid === false ? '待匹配' : undefined),
      note: values.note,
      lines: [],
    }

    const key = `${shop.id}::${statement}`
    const existing = rowByStatement.get(key)
    if (existing) {
      Object.assign(existing, Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)))
      pushIssue(issues, 'settlements', excelRow, `结算单 ${statement} 重复，已合并到首行`)
      return
    }
    rowByStatement.set(key, row)
    rows.push(row)
  })

  const lineSheetName = sheetName(
    wb,
    (n) => n.includes('transaction') || n.includes('交易') || n.includes('明细'),
  )
  let lineCount = 0
  let skippedLines = 0
  if (lineSheetName && lineSheetName !== settlementSheetName) {
    const lineRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[lineSheetName]!, {
      defval: '',
    })
    for (let index = 0; index < lineRows.length; index += 1) {
      if (lineCount >= SETTLEMENT_IMPORT_LIMITS.maxLines) {
        skippedLines += lineRows.length - index
        pushIssue(
          issues,
          'transaction_details',
          index + 2,
          `明细超过 ${SETTLEMENT_IMPORT_LIMITS.maxLines} 行上限，其余已忽略`,
        )
        break
      }
      const excelRow = index + 2
      const map = rowMap(lineRows[index]!)
      const { values, missing } = readColumns(TRANSACTION_COLUMNS, map)
      if (missing.length) {
        skippedLines += 1
        pushIssue(issues, 'transaction_details', excelRow, `缺少必填列：${missing.join('、')}`)
        continue
      }
      const statement = values.statement!
      const target = rows.find((r) => r.externalSettlementId === statement)
      if (!target) {
        skippedLines += 1
        pushIssue(issues, 'transaction_details', excelRow, `结算单 ${statement} 不存在，明细已跳过`)
        continue
      }
      const details = values.details
      const comment = values.comment
      target.lines!.push({
        externalTransactionId: values.transaction_number,
        externalOrderNo: values.order_no,
        transactionType: values.transaction_type,
        feeType: values.fee_type,
        feeName: values.fee_name,
        amount: asNumber(pick(map, ['amount', '金额'])),
        taxAmount: asNumber(pick(map, ['vat_in_amount', 'vatamount', 'vat', '税额'])),
        whtAmount: asNumber(pick(map, ['wht_amount', 'whtamount', 'wht', '预扣税'])),
        whtIncludedInAmount: asBoolean(pick(map, ['wht_included_in_amount', 'whtincluded'])),
        currency: values.currency ?? target.currency,
        paidStatus: values.paid_status,
        paymentReference: values.payment_ref_id,
        sellerSku: values.seller_sku,
        platformSkuId: values.lazada_sku,
        shippingProvider: values.shipping_provider,
        shippingSpeed: values.shipping_speed,
        shipmentType: values.shipment_type,
        note: comment ?? details,
      })
      lineCount += 1
    }
  }

  if (rows.length > SETTLEMENT_IMPORT_LIMITS.maxSettlements) {
    return {
      rows: [],
      issues: [
        ...issues,
        {
          sheet: 'settlements',
          row: 0,
          message: `结算单 ${rows.length} 行，超过单次 ${SETTLEMENT_IMPORT_LIMITS.maxSettlements} 行上限，请分批导入`,
        },
      ],
      stats: { settlements: 0, lines: 0, skippedLines },
    }
  }
  if (!rows.length && !issues.length) {
    pushIssue(issues, 'settlements', 0, 'settlements 工作表无数据行')
  }

  return {
    rows,
    issues,
    stats: {
      settlements: rows.length,
      lines: lineCount,
      skippedLines: skippedLines + skippedSettlements,
    },
  }
}
