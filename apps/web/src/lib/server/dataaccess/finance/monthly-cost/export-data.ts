import { db } from '@/lib/db'
import { dateEndUtc, effectiveFromStartUtc } from '@/lib/crm/project-effective-dates'
import { projectStaffAssignment, userStaff } from '@workspace/db/schema'
import { and, eq, inArray, isNull, lte, or, gte, desc } from 'drizzle-orm'
import type { MonthlyCostBaseLineDto } from './types'
import { listAllBaseLines } from './read'

function monthStartDate(month: string): string {
  return `${month}-01`
}

function monthEndDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y!, m!, 0).getDate()
  return `${month}-${String(last).padStart(2, '0')}`
}

export type MonthlyCostBaseLineExportDto = MonthlyCostBaseLineDto & {
  usage_month: string
  opportunity_source: string | null
  sp_sell_price_per_hour: string | null
  delivery_manager_name: string | null
  customer_success_name: string | null
}

export async function loadProjectStaffNamesForExport(
  projectIds: string[],
  usageMonth: string,
): Promise<Map<string, { delivery: string | null; customerSuccess: string | null }>> {
  const map = new Map<string, { delivery: string | null; customerSuccess: string | null }>()
  if (projectIds.length === 0) return map

  const monthStart = monthStartDate(usageMonth)
  const monthEnd = monthEndDate(usageMonth)
  const rangeStart = effectiveFromStartUtc(monthStart)
  const rangeEnd = dateEndUtc(monthEnd)

  const rows = await db
    .select({
      projectId: projectStaffAssignment.projectId,
      roleType: projectStaffAssignment.roleType,
      displayName: userStaff.displayName,
      effectiveFrom: projectStaffAssignment.effectiveFrom,
    })
    .from(projectStaffAssignment)
    .innerJoin(userStaff, eq(userStaff.id, projectStaffAssignment.userStaffId))
    .where(
      and(
        inArray(projectStaffAssignment.projectId, projectIds),
        inArray(projectStaffAssignment.roleType, ['delivery_manager', 'project_manager']),
        lte(projectStaffAssignment.effectiveFrom, rangeEnd),
        or(
          isNull(projectStaffAssignment.effectiveTo),
          gte(projectStaffAssignment.effectiveTo, rangeStart),
        ),
      ),
    )
    .orderBy(desc(projectStaffAssignment.effectiveFrom))

  for (const row of rows) {
    const acc = map.get(row.projectId) ?? { delivery: null, customerSuccess: null }
    if (row.roleType === 'delivery_manager' && !acc.delivery) {
      acc.delivery = row.displayName
    }
    if (row.roleType === 'project_manager' && !acc.customerSuccess) {
      acc.customerSuccess = row.displayName
    }
    map.set(row.projectId, acc)
  }

  return map
}

export async function listExportBaseLines(input: {
  billingPeriodId: string
  usageMonth: string
  onlyWithProject?: boolean
  search?: string
  opportunitySource?: string
  dataCenterId?: string
  accountManagerStaffId?: string
}) {
  const result = await listAllBaseLines(input)
  if (!result.run || result.rows.length === 0) {
    return { run: result.run, rows: [] as MonthlyCostBaseLineExportDto[] }
  }

  const projectIds = [
    ...new Set(result.rows.map((r) => r.project_id).filter((id): id is string => Boolean(id))),
  ]
  const staffMap = await loadProjectStaffNamesForExport(projectIds, input.usageMonth)

  const rows: MonthlyCostBaseLineExportDto[] = result.rows.map((row) => {
    const staff = row.project_id ? staffMap.get(row.project_id) : undefined
    return {
      ...row,
      usage_month: input.usageMonth,
      opportunity_source: row.opportunity_source ?? null,
      sp_sell_price_per_hour: row.sp_sell_price_per_hour ?? null,
      delivery_manager_name: staff?.delivery ?? null,
      customer_success_name: staff?.customerSuccess ?? null,
    }
  })

  return { run: result.run, rows }
}
