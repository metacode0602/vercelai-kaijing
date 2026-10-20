import { db } from '@/lib/db'
import { billingPeriodPersonalIncomeTenantLine } from '@workspace/db/schema'
import type { PersonalIncomeSegment } from '@/lib/finance/personal-income-core'
import { and, eq } from 'drizzle-orm'
import { FinanceError } from './errors'

export type PersonalIncomeTenantLineDto = {
  platform_tenant_id: string
  customer_type_label: string | null
  customer_name: string | null
  balance_consumption: string
  bare_metal_consumption: string
  total_consumption: string
  voucher_consumption: string
  segment: PersonalIncomeSegment
}

export async function listPersonalIncomeTenantLines(input: {
  billingPeriodId: string
  segment: PersonalIncomeSegment
}): Promise<PersonalIncomeTenantLineDto[]> {
  const rows = await db
    .select()
    .from(billingPeriodPersonalIncomeTenantLine)
    .where(
      and(
        eq(billingPeriodPersonalIncomeTenantLine.billingPeriodId, input.billingPeriodId),
        eq(billingPeriodPersonalIncomeTenantLine.segment, input.segment),
      ),
    )

  if (rows.length === 0) {
    const period = await db.query.billingPeriod.findFirst({
      where: (t, { eq: eqOp }) => eqOp(t.id, input.billingPeriodId),
    })
    if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
  }

  return rows
    .filter((r) => Number(r.totalConsumption) > 0)
    .sort((a, b) => Number(b.totalConsumption) - Number(a.totalConsumption))
    .map((row) => ({
      platform_tenant_id: row.platformTenantId,
      customer_type_label: row.customerTypeLabel,
      customer_name: row.customerName,
      balance_consumption: row.balanceConsumption,
      bare_metal_consumption: row.bareMetalConsumption,
      total_consumption: row.totalConsumption,
      voucher_consumption: row.voucherConsumption,
      segment: row.segment as PersonalIncomeSegment,
    }))
}
