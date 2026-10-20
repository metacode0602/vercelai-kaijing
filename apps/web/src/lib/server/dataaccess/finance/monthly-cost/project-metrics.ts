import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import type { MonthlyCostBranch } from '@/lib/monthly-cost/constants'
import { monthlyCostBaseLine } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { MonthlyCostProjectMetricsDto } from './types'

function emptyMetrics(): MonthlyCostProjectMetricsDto {
  return {
    balance_consumption: '0',
    balance_card_hours: '0',
    voucher_card_hours: '0',
    confirmed_revenue_excl_tax: '0',
    sold_duration_cost_excl_tax: '0',
    gifted_duration_cost_excl_tax: '0',
    gross_profit: '0',
  }
}

export async function loadProjectMetricsByRun(input: {
  runId: string
  costBranch: MonthlyCostBranch
}): Promise<Map<string, MonthlyCostProjectMetricsDto>> {
  const rows = await db
    .select()
    .from(monthlyCostBaseLine)
    .where(eq(monthlyCostBaseLine.runId, input.runId))

  const map = new Map<string, MonthlyCostProjectMetricsDto>()
  for (const row of rows) {
    if (!row.projectId) continue

    const acc = map.get(row.projectId) ?? emptyMetrics()
    acc.balance_consumption = toMoneyString(
      parseMoney(acc.balance_consumption) + parseMoney(row.balanceConsumption),
    )
    acc.balance_card_hours = String(
      Number(acc.balance_card_hours) + Number(row.balanceCardHours),
    )
    acc.voucher_card_hours = String(
      Number(acc.voucher_card_hours) + Number(row.voucherCardHours),
    )
    acc.confirmed_revenue_excl_tax = toMoneyString(
      parseMoney(acc.confirmed_revenue_excl_tax) + parseMoney(row.confirmedRevenueExclTax),
    )

    if (input.costBranch === 'platform_cost') {
      acc.sold_duration_cost_excl_tax = toMoneyString(
        parseMoney(acc.sold_duration_cost_excl_tax) +
          parseMoney(row.pcSoldDurationCostExclTax),
      )
      acc.gifted_duration_cost_excl_tax = toMoneyString(
        parseMoney(acc.gifted_duration_cost_excl_tax) +
          parseMoney(row.pcGiftedDurationCostExclTax),
      )
      acc.gross_profit = toMoneyString(
        parseMoney(acc.gross_profit) + parseMoney(row.pcGrossProfit),
      )
    } else {
      acc.sold_duration_cost_excl_tax = toMoneyString(
        parseMoney(acc.sold_duration_cost_excl_tax) +
          parseMoney(row.spSoldDurationCostExclTax),
      )
      acc.gifted_duration_cost_excl_tax = toMoneyString(
        parseMoney(acc.gifted_duration_cost_excl_tax) +
          parseMoney(row.spGiftedDurationCostExclTax),
      )
      acc.gross_profit = toMoneyString(
        parseMoney(acc.gross_profit) + parseMoney(row.spGrossProfit),
      )
    }

    map.set(row.projectId, acc)
  }

  return map
}
