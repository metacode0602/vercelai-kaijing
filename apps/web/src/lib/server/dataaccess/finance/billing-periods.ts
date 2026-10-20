import { db } from '@/lib/db'
import { billingPeriod, platformIncomeMonthly } from '@workspace/db/schema'
import { desc, eq } from 'drizzle-orm'
import { FinanceError } from './errors'
import { getImportSlotStatuses } from './import-slot-status'
import { reconcileStaleImportErrorStatus } from './import'
import { financeLog } from './logger'
import { appendOperationLog, newId } from './operation-log'
import {
  computeTotalConsumption,
  toMoneyString,
} from '@/lib/finance/income-row-utils'
import {
  ensureCrossFileErrorReports,
  readErrorReportBySlot,
  validateCrossFileImports,
} from './validate-import'
import {
  computeSinglePeriodIncome,
  previewSinglePeriodIncome,
} from './compute-single-period-income'
import { detectPlatformListPriceWindows } from './platform-list-price'
import {
  listTenantBillWindows,
  syncTenantBillWindowsForPeriod,
} from './tenant-bill-windows'
import { customerFullNamesByTenantIds } from './income-customer-enrich'
import { validateSingleIncome } from './validate-single-income'
import {
  listImportTenantBindings as fetchImportTenantBindings,
  type ImportTenantBindingFilters,
} from './list-import-tenant-bindings'
import type { ImportSlotKey } from './constants'
import { SLOT_TO_FILE_TYPE } from './constants'

async function financeImport() {
  return import('./import')
}

async function financePurge() {
  return import('./purge')
}

export type BillingPeriodDto = {
  id: string
  period_code: string
  period_start: string
  period_end: string
  status: string
  total_income: string | null
  enterprise_income: string | null
  personal_income: string | null
  income_total: string | null
  total_cost: string | null
  project_cost: string | null
  internal_user_cost: string | null
  supplementary: string | null
  balance_income: string | null
  baremetal_income: string | null
  last_computed_at: string | null
  published_at: string | null
  ignore_list_price_windows: boolean
}

function mapPeriod(row: typeof billingPeriod.$inferSelect): BillingPeriodDto {
  return {
    id: row.id,
    period_code: row.periodCode,
    period_start: row.periodStart,
    period_end: row.periodEnd,
    status: row.status,
    total_income: row.totalIncome,
    enterprise_income: row.enterpriseIncome,
    personal_income: row.personalIncome,
    income_total: row.incomeTotal,
    total_cost: row.totalCost,
    project_cost: row.projectCost,
    internal_user_cost: row.internalUserCost,
    supplementary: row.supplementary,
    balance_income: row.balanceIncome,
    baremetal_income: row.baremetalIncome,
    last_computed_at: row.lastComputedAt?.toISOString() ?? null,
    published_at: row.publishedAt?.toISOString() ?? null,
    ignore_list_price_windows: row.ignoreListPriceWindows ?? false,
  }
}

export const financeBillingPeriodsDataAccess = {
  async list(): Promise<BillingPeriodDto[]> {
    const all = await db.select().from(billingPeriod).orderBy(desc(billingPeriod.periodStart))
    return all.filter((r) => r.status !== 'void').map(mapPeriod)
  },

  async getById(id: string): Promise<BillingPeriodDto | null> {
    const row = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.id, id),
    })
    return row ? mapPeriod(row) : null
  },

  async create(input: {
    periodCode: string
    periodStart: string
    periodEnd: string
    ignoreListPriceWindows?: boolean
  }): Promise<BillingPeriodDto> {
    const existing = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.periodCode, input.periodCode.trim()),
    })
    if (existing) {
      throw new FinanceError('CONFLICT', `账期编码 ${input.periodCode} 已存在`)
    }
    if (input.periodStart > input.periodEnd) {
      throw new FinanceError('BAD_REQUEST', '结束日期不能早于开始日期')
    }
    const id = newId()
    await db.insert(billingPeriod).values({
      id,
      periodCode: input.periodCode.trim(),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'draft',
      ignoreListPriceWindows: input.ignoreListPriceWindows ?? false,
    })
    await syncTenantBillWindowsForPeriod(id)
    financeLog('period', 'created', { id, periodCode: input.periodCode })
    const row = await db.query.billingPeriod.findFirst({ where: eq(billingPeriod.id, id) })
    return mapPeriod(row!)
  },

  async listImportTenantBindings(
    billingPeriodId: string,
    filters: ImportTenantBindingFilters = {},
  ) {
    return fetchImportTenantBindings(billingPeriodId, filters)
  },

  async getBundle(periodId: string) {
    const period = await this.getById(periodId)
    if (!period) return null
    const income = await db
      .select()
      .from(platformIncomeMonthly)
      .where(eq(platformIncomeMonthly.billingPeriodId, periodId))
    const customerByTenant = await customerFullNamesByTenantIds(
      income.map((r) => r.tenantId),
    )
    return {
      period,
      income: income.map((r) => ({
        id: r.id,
        billing_period_id: r.billingPeriodId,
        project_name: r.projectName,
        tenant_name: r.tenantName,
        tenant_id: r.tenantId,
        tenant_platform_id: r.tenantPlatformId,
        customer_id: r.customerId,
        customer_full_name:
          customerByTenant.get(r.tenantId) ?? r.customerFullName,
        project_id: r.projectId,
        supplementary_consumption: r.supplementaryConsumption,
        balance_consumption: r.balanceConsumption,
        bare_metal_consumption: r.bareMetalConsumption,
        bare_metal_balance_consumption: r.bareMetalBalanceConsumption,
        total_consumption: r.totalConsumption,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt?.toISOString() ?? null,
      })),
    }
  },

  async importExcelFile(
    ...args: Parameters<(typeof import('./import'))['importExcelFile']>
  ) {
    const { importExcelFile } = await financeImport()
    return importExcelFile(...args)
  },

  async previewBaremetalFromDb(
    billingPeriodId: string,
    options?: { periodField?: 'ordered_at' | 'imported_at' },
  ) {
    const { previewBaremetalFromDb } = await import('./baremetal-db-import')
    return previewBaremetalFromDb({
      billingPeriodId,
      periodField: options?.periodField,
    })
  },

  async importBaremetalFromDb(input: {
    billingPeriodId: string
    actorId?: string | null
    preserveIncomeDerived?: boolean
    periodField?: 'ordered_at' | 'imported_at'
    allowEmptyImport?: boolean
  }) {
    const { importBaremetalFromDb } = await import('./baremetal-db-import')
    return importBaremetalFromDb(input)
  },

  async previewPersonalBaremetalFromDb(billingPeriodId: string) {
    const { previewPersonalBaremetalFromDb } = await import('./baremetal-db-import')
    return previewPersonalBaremetalFromDb({ billingPeriodId })
  },

  async importPersonalBaremetalFromDb(input: {
    billingPeriodId: string
    actorId?: string | null
  }) {
    const { importPersonalBaremetalFromDb } = await import('./baremetal-db-import')
    return importPersonalBaremetalFromDb(input)
  },

  getImportSlotStatuses,
  computeSinglePeriodIncome,
  previewSinglePeriodIncome,
  validateSingleIncome,

  async validatePeriod(periodId: string) {
    const period = await this.getById(periodId)
    if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
    await reconcileStaleImportErrorStatus(periodId)
    const periodRow = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.id, periodId),
    })
    const windows = await listTenantBillWindows(periodId)
    const priceWindowInfo = await detectPlatformListPriceWindows({
      periodStart: period.period_start,
      periodEnd: period.period_end,
    })
    const slots = await getImportSlotStatuses(periodId)
    let cross = await validateCrossFileImports(periodId)
    if (!cross.ok) {
      cross = await ensureCrossFileErrorReports(periodId)
    }
    const slotsForReport = !cross.ok ? await getImportSlotStatuses(periodId) : slots
    const crossFileErrors = cross.errorsByFileType.tenant_bill ?? []
    return {
      periodStatus: periodRow?.status ?? period.status,
      slots: slotsForReport,
      windows,
      priceWindowInfo,
      crossFileOk: cross.ok,
      crossFileErrors,
      crossFileSkipped: !cross.ok,
    }
  },

  async detectPriceWindows(input: { periodStart: string; periodEnd: string }) {
    return detectPlatformListPriceWindows(input)
  },

  async downloadImportErrorReport(input: {
    billingPeriodId: string
    slot: ImportSlotKey
    windowId?: string
  }) {
    const fileType = SLOT_TO_FILE_TYPE[input.slot]
    const report = await readErrorReportBySlot({
      periodId: input.billingPeriodId,
      fileType,
      windowId: input.windowId,
    })
    if (!report) throw new FinanceError('NOT_FOUND', '无可下载的错误明细')
    return report
  },

  async saveSupplementary(input: {
    billingPeriodId: string
    items: { incomeRowId: string; supplementaryConsumption: string }[]
    actorId?: string | null
  }): Promise<void> {
    const period = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.id, input.billingPeriodId),
    })
    if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
    if (period.status !== 'computed' && period.status !== 'adjusted') {
      throw new FinanceError('PRECONDITION_FAILED', '仅已计算账期可保存补充消费')
    }

    for (const item of input.items) {
      const row = await db.query.platformIncomeMonthly.findFirst({
        where: eq(platformIncomeMonthly.id, item.incomeRowId),
      })
      if (!row || row.billingPeriodId !== input.billingPeriodId) continue
      const sup = toMoneyString(Number(item.supplementaryConsumption) || 0)
      const total = computeTotalConsumption({
        balance_consumption: row.balanceConsumption ?? '0',
        bare_metal_balance_consumption: row.bareMetalBalanceConsumption ?? '0',
      })
      await db
        .update(platformIncomeMonthly)
        .set({
          supplementaryConsumption: sup,
          totalConsumption: total,
        })
        .where(eq(platformIncomeMonthly.id, item.incomeRowId))
    }

    const { refreshBillingPeriodPeriodTotals } = await import('./billing-period-period-totals')
    await refreshBillingPeriodPeriodTotals(input.billingPeriodId)

    await appendOperationLog({
      billingPeriodId: input.billingPeriodId,
      operation: 'save_supplementary',
      actorId: input.actorId,
      metadata: { count: input.items.length },
    })
  },

  async publish(periodId: string, actorId?: string | null): Promise<void> {
    const period = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.id, periodId),
    })
    if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
    if (period.status !== 'computed' && period.status !== 'adjusted') {
      throw new FinanceError('PRECONDITION_FAILED', '仅已计算账期可发布')
    }
    await db
      .update(billingPeriod)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(billingPeriod.id, periodId))
    await appendOperationLog({
      billingPeriodId: periodId,
      operation: 'publish',
      actorId,
    })
  },

  /** 撤回发布：仅更新账期状态，不 purge 导入/计算/调账/提成派生数据。 */
  async unpublish(periodId: string, actorId?: string | null): Promise<void> {
    const period = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.id, periodId),
    })
    if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
    if (period.status !== 'published') {
      throw new FinanceError('PRECONDITION_FAILED', '仅已发布账期可撤回')
    }
    await db
      .update(billingPeriod)
      .set({ status: 'computed', publishedAt: null })
      .where(eq(billingPeriod.id, periodId))
    await appendOperationLog({
      billingPeriodId: periodId,
      operation: 'unpublish',
      actorId,
    })
  },

  async regenerate(periodId: string, actorId?: string | null): Promise<BillingPeriodDto> {
    const period = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.id, periodId),
    })
    if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
    if (period.status === 'published' || period.status === 'adjusted') {
      throw new FinanceError('CONFLICT', '已发布账期须先作废后再重新上传生成')
    }
    if (period.status === 'void') {
      throw new FinanceError('CONFLICT', '作废账期不可重新生成')
    }
    const { purgeBillingPeriodArtifacts } = await financePurge()
    await purgeBillingPeriodArtifacts({
      billingPeriodId: periodId,
      scope: 'full',
      actorId,
    })
    await syncTenantBillWindowsForPeriod(periodId)
    await db
      .update(billingPeriod)
      .set({ status: 'draft', publishedAt: null, voidedAt: null })
      .where(eq(billingPeriod.id, periodId))
    await appendOperationLog({
      billingPeriodId: periodId,
      operation: 'regenerate',
      actorId,
    })
    financeLog('regenerate', 'period reset to draft', { periodId })
    return mapPeriod(
      (await db.query.billingPeriod.findFirst({ where: eq(billingPeriod.id, periodId) }))!,
    )
  },

  async voidPeriod(periodId: string, actorId?: string | null): Promise<BillingPeriodDto> {
    const period = await db.query.billingPeriod.findFirst({
      where: eq(billingPeriod.id, periodId),
    })
    if (!period) throw new FinanceError('NOT_FOUND', '账期不存在')
    if (period.status !== 'published') {
      throw new FinanceError('PRECONDITION_FAILED', '仅已发布账期可作废')
    }
    const { purgeBillingPeriodArtifacts } = await financePurge()
    await purgeBillingPeriodArtifacts({
      billingPeriodId: periodId,
      scope: 'full',
      actorId,
    })
    await syncTenantBillWindowsForPeriod(periodId)
    await db
      .update(billingPeriod)
      .set({ status: 'draft', publishedAt: null, voidedAt: new Date() })
      .where(eq(billingPeriod.id, periodId))
    await appendOperationLog({
      billingPeriodId: periodId,
      operation: 'void',
      actorId,
    })
    financeLog('void', 'published period voided and reset to draft', { periodId })
    return mapPeriod(
      (await db.query.billingPeriod.findFirst({ where: eq(billingPeriod.id, periodId) }))!,
    )
  },
}
