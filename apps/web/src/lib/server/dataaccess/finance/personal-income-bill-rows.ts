import { billingPeriodRawTenantBill } from '@workspace/db/schema'
import {
  isNewBareMetalBillLineType,
  normalizeBillLineType,
} from '@/lib/finance/personal-income-core'
import type { ImportCellError } from './import-errors'
import {
  isTenantBillTotalRow,
  parseMoneyCell,
  pickColumn,
  type ParsedWorkbook,
  type SheetRow,
} from './excel-parser'

function pickBillLineType(row: SheetRow): string | null {
  return pickColumn(row, ['类型', 'type', 'product_type', '产品线'])
}

export function billLineTypeFromRawRow(
  row: Pick<typeof billingPeriodRawTenantBill.$inferSelect, 'billLineType' | 'rawJson'>,
): string | null {
  if (row.billLineType) return row.billLineType
  const raw = row.rawJson as SheetRow | null
  if (!raw || typeof raw !== 'object') return null
  return pickBillLineType(raw)
}

export function isNewBareMetalRawBillRow(
  row: Pick<typeof billingPeriodRawTenantBill.$inferSelect, 'billLineType' | 'rawJson'>,
): boolean {
  return isNewBareMetalBillLineType(billLineTypeFromRawRow(row))
}

export function mapPersonalTenantBillRows(sheet: ParsedWorkbook): {
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

    const balanceRaw = pickColumn(row, ['余额消费', 'balance_consumption'])
    if (balanceRaw == null || balanceRaw === '') {
      errors.push({
        rowNo,
        columnAliases: ['余额消费', 'balance_consumption'],
        message: '余额消费不能为空',
      })
      continue
    }
    const balanceNum = Number(parseMoneyCell(balanceRaw))
    if (balanceNum < 0) {
      errors.push({
        rowNo,
        columnAliases: ['余额消费', 'balance_consumption'],
        message: '余额消费不能为负数',
      })
      continue
    }

    const billLineType = pickBillLineType(row)
    const totalRaw = pickColumn(row, ['总消费', 'total_consumption'])
    const voucherRaw = pickColumn(row, ['券消费', 'voucher_consumption'])

    parsed.push({
      rowNo,
      tenantPlatformId: tenantId,
      billLineType: billLineType ? normalizeBillLineType(billLineType) || null : null,
      tenantTypeLabel: pickColumn(row, ['租户类型', 'tenant_type']),
      customerTypeLabel: pickColumn(row, ['客户类型', 'customer_type']),
      customerName: pickColumn(row, ['客户名', 'customer_name', '客户名称']),
      totalConsumption: parseMoneyCell(totalRaw),
      voucherConsumption: parseMoneyCell(voucherRaw),
      balanceConsumption: parseMoneyCell(balanceRaw),
      totalCardHours: parseMoneyCell(pickColumn(row, ['总卡时', 'total_card_hours'])),
      voucherCardHours: parseMoneyCell(pickColumn(row, ['券卡时', 'voucher_card_hours'])),
      balanceCardHours: parseMoneyCell(pickColumn(row, ['余额卡时', 'balance_card_hours']) ?? '0'),
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
