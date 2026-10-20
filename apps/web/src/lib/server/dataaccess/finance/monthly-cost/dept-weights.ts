import { db } from '@/lib/db'
import {
  MONTHLY_COST_DEPT_MARKETING,
  MONTHLY_COST_DEPT_MIDDLE,
} from '@/lib/monthly-cost/constants'
import {
  monthlyCostDeptContributionWeight,
  userStaff,
} from '@workspace/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { FinanceError } from '../errors'
import { newId } from '../operation-log'

export type DeptContributionWeightDto = {
  id: string
  usage_month: string
  cost_branch: string | null
  recipient_dept: string
  customer_incentive_label: string
  staff_id: string
  staff_name: string
  weight_percent: string
  note: string | null
}

export async function listDeptContributionWeights(input: {
  usageMonth: string
  recipientDept?: string
}): Promise<DeptContributionWeightDto[]> {
  const conditions = [eq(monthlyCostDeptContributionWeight.usageMonth, input.usageMonth)]
  if (input.recipientDept) {
    conditions.push(eq(monthlyCostDeptContributionWeight.recipientDept, input.recipientDept))
  }

  const rows = await db
    .select({
      id: monthlyCostDeptContributionWeight.id,
      usageMonth: monthlyCostDeptContributionWeight.usageMonth,
      costBranch: monthlyCostDeptContributionWeight.costBranch,
      recipientDept: monthlyCostDeptContributionWeight.recipientDept,
      customerIncentiveLabel: monthlyCostDeptContributionWeight.customerIncentiveLabel,
      staffId: monthlyCostDeptContributionWeight.staffId,
      staffName: userStaff.displayName,
      weightPercent: monthlyCostDeptContributionWeight.weightPercent,
      note: monthlyCostDeptContributionWeight.note,
    })
    .from(monthlyCostDeptContributionWeight)
    .innerJoin(userStaff, eq(userStaff.id, monthlyCostDeptContributionWeight.staffId))
    .where(and(...conditions))
    .orderBy(
      monthlyCostDeptContributionWeight.recipientDept,
      monthlyCostDeptContributionWeight.customerIncentiveLabel,
      userStaff.displayName,
    )

  return rows.map((r) => ({
    id: r.id,
    usage_month: r.usageMonth,
    cost_branch: r.costBranch,
    recipient_dept: r.recipientDept,
    customer_incentive_label: r.customerIncentiveLabel,
    staff_id: r.staffId,
    staff_name: r.staffName,
    weight_percent: r.weightPercent,
    note: r.note,
  }))
}

export async function saveDeptContributionWeights(input: {
  usageMonth: string
  recipientDept: string
  customerIncentiveLabel: string
  costBranch?: string | null
  rows: { staffId: string; weightPercent: string; note?: string | null }[]
  updatedBy?: string | null
}): Promise<{ saved: number }> {
  if (
    input.recipientDept !== MONTHLY_COST_DEPT_MIDDLE &&
    input.recipientDept !== MONTHLY_COST_DEPT_MARKETING
  ) {
    throw new FinanceError('BAD_REQUEST', '部门须为「中台」或「市场」')
  }
  if (input.customerIncentiveLabel !== '新客' && input.customerIncentiveLabel !== '老客') {
    throw new FinanceError('BAD_REQUEST', '客群须为「新客」或「老客」')
  }

  const sum = input.rows.reduce((acc, r) => acc + Number(r.weightPercent), 0)
  if (Math.abs(sum - 100) > 0.01) {
    throw new FinanceError('BAD_REQUEST', `权重合计须为 100%，当前为 ${sum.toFixed(2)}%`)
  }

  const staffIds = input.rows.map((r) => r.staffId)
  if (staffIds.length === 0) {
    throw new FinanceError('BAD_REQUEST', '至少配置一名员工')
  }

  const staffRows = await db
    .select({ id: userStaff.id, position: userStaff.position })
    .from(userStaff)
    .where(inArray(userStaff.id, staffIds))

  if (staffRows.length !== staffIds.length) {
    throw new FinanceError('BAD_REQUEST', '存在无效员工 ID')
  }
  const managers = staffRows.filter((s) => s.position === '经理')
  if (managers.length > 0) {
    throw new FinanceError('BAD_REQUEST', '经理岗位员工默认不参与池内分配，请移除后重试')
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(monthlyCostDeptContributionWeight)
      .where(
        and(
          eq(monthlyCostDeptContributionWeight.usageMonth, input.usageMonth),
          eq(monthlyCostDeptContributionWeight.recipientDept, input.recipientDept),
          eq(
            monthlyCostDeptContributionWeight.customerIncentiveLabel,
            input.customerIncentiveLabel,
          ),
          input.costBranch
            ? eq(monthlyCostDeptContributionWeight.costBranch, input.costBranch)
            : isNull(monthlyCostDeptContributionWeight.costBranch),
        ),
      )

    await tx.insert(monthlyCostDeptContributionWeight).values(
      input.rows.map((row) => ({
        id: newId(),
        usageMonth: input.usageMonth,
        costBranch: input.costBranch ?? null,
        recipientDept: input.recipientDept,
        customerIncentiveLabel: input.customerIncentiveLabel,
        staffId: row.staffId,
        weightPercent: row.weightPercent,
        note: row.note ?? null,
        updatedBy: input.updatedBy ?? null,
      })),
    )
  })

  return { saved: input.rows.length }
}

export async function deleteDeptContributionWeight(input: { id: string }): Promise<void> {
  await db
    .delete(monthlyCostDeptContributionWeight)
    .where(eq(monthlyCostDeptContributionWeight.id, input.id))
}
