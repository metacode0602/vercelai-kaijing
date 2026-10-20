import { db } from '@/lib/db'
import { parseMoney } from '@/lib/finance/income-row-utils'
import {
  computeDualBranchFinancials,
  mapTenantProductLineToPlatformListPrice,
  money4,
  pricingFieldsFromMonthlyRow,
} from '@/lib/monthly-cost/financials'
import { lastDayOfUsageMonth } from '@/lib/monthly-cost/period-utils'
import { MONTHLY_COST_OPPORTUNITY_SHORT_LABELS } from '@/lib/monthly-cost/constants'
import {
  crmProject,
  monthlyCostBaseLine,
  monthlyCostCommissionLine,
  monthlyCostCommissionProjectLine,
  monthlyCostDeptContributionWeight,
  monthlyCostDeptDistributionLine,
  monthlyCostDeptPoolLine,
  monthlyCostDeptPoolProjectLine,
  monthlyCostRun,
  tenantRegionGpuConsumptionMonthly,
  userStaff,
} from '@workspace/db/schema'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { resolvePlatformListPriceAt } from '../platform-list-price'
import { resolveCostTenantBindings } from '../cost-tenant-resolve'
import {
  loadStaffPosition,
  resolveEffectiveAccountManager,
  resolveOpportunitySourceAtMonth,
} from '../crm-project-resolve'
import { newId } from '../operation-log'
import {
  computeBaseValueFallback,
  resolveInfraPricingSnapshot,
  type InfraPricingSnapshot,
} from '../tenant-region-gpu-consumption/resolve-infra-pricing'
import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import {
  buildCommissionProjectLines,
  rollupAmCommissionLines,
  rollupDeptPoolLines,
  type ProjectCommissionInput,
} from './commission'
import { precheckMonthlyCostRun } from './precheck'
import {
  bareMetalAmortizationKey,
  formatBareMetalAmortizationRemark,
} from '@/lib/monthly-cost/bare-metal-monthly-amortization'
import {
  loadBareMetalAmortizationForMonth,
} from './bare-metal-audit'
import { loadBareMetalOrderRefsByTenantRegion } from './bare-metal-order-refs'
import { resolveTenantCrmSnapshot } from '../tenant-region-gpu-consumption/resolve-crm-snapshot'
import { normalizeBillingRegion } from '../tenant-bill-pricing'
import {
  countRunIssues,
  createRunIssue,
  serializeRunIssues,
  type MonthlyCostRunIssueDto,
} from './run-issues'

type BaseLineDraft = {
  projectId: string | null
  tenantPlatformId: string
  tenantId: string | null
  productLine: string
  regionCode: string
  gpuCardTypeId: string | null
  gpuCardTypeName: string | null
  dataCenterId: string | null
  customerFullName: string | null
  accountManagerStaffId: string | null
  accountManagerName: string | null
  opportunitySource: string | null
  opportunitySourceLabel: string | null
  customerIncentiveType: string | null
  customerIncentiveLabel: string | null
  balanceConsumption: number
  balanceCardHours: number
  voucherCardHours: number
  confirmedRevenueExclTax: number
  pcSold: number
  pcGifted: number
  pcGross: number
  spSold: number
  spGifted: number
  spGross: number
  pcSupplierUnitCostId: string | null
  spPlatformCardListPriceId: string | null
  spSellPricePerHour: number | null
  remark: string | null
}

function scaleMetric(value: number, percent: number): number {
  return (value * percent) / 100
}

function normalizeIncentiveLabel(label: string | null | undefined): '新客' | '老客' {
  return label === '老客' ? '老客' : '新客'
}

async function resolveStaffName(staffId: string | null): Promise<string | null> {
  if (!staffId) return null
  const staff = await db.query.userStaff.findFirst({
    where: eq(userStaff.id, staffId),
    columns: { displayName: true },
  })
  return staff?.displayName ?? null
}

export type RunMonthlyCostResult = {
  runId: string
  status: string
  baseLineCount: number
  warningCount: number
  errorCount: number
  issueCount: number
}

function snapshotMonthlyRow(
  row: typeof tenantRegionGpuConsumptionMonthly.$inferSelect,
  orderNos?: string | null,
) {
  return {
    tenant_platform_id: row.tenantPlatformId,
    project_id: row.projectId,
    region_code: row.regionCode,
    gpu_card_type_name: row.gpuCardTypeName,
    product_line: row.productLine,
    customer_full_name: row.customerFullName,
    account_manager_name: row.accountManagerName,
    balance_consumption: row.balanceConsumption,
    balance_card_hours: row.balanceCardHours,
    voucher_card_hours: row.voucherCardHours,
    pricing_resolve_status: row.pricingResolveStatus,
    ...(row.productLine === 'bare_metal'
      ? { bare_metal_order_nos: orderNos ?? null }
      : {}),
  }
}

async function persistMonthlyCrmRefresh(
  rowId: string,
  crm: Awaited<ReturnType<typeof resolveTenantCrmSnapshot>>,
): Promise<void> {
  await db
    .update(tenantRegionGpuConsumptionMonthly)
    .set({
      tenantId: crm.tenantId,
      customerId: crm.customerId,
      projectId: crm.projectId,
      tenantName: crm.tenantName,
      customerFullName: crm.customerFullName,
      projectName: crm.projectName,
      accountManagerStaffId: crm.accountManagerStaffId,
      accountManagerName: crm.accountManagerName,
      enrichmentBindingSource: crm.enrichmentBindingSource,
      projectEnrichmentSnapshot: crm.projectEnrichmentSnapshot,
      customerIncentiveType: crm.customerIncentiveType,
      customerIncentiveLabel: crm.customerIncentiveLabel,
      incentiveStartDate: crm.incentiveStartDate,
      updatedAt: new Date(),
    })
    .where(eq(tenantRegionGpuConsumptionMonthly.id, rowId))
}

async function persistMonthlyPricingRefresh(
  rowId: string,
  row: { baseValue: string | null; totalCardHours: string },
  infra: InfraPricingSnapshot,
): Promise<void> {
  await db
    .update(tenantRegionGpuConsumptionMonthly)
    .set({
      dataCenterId: infra.dataCenterId,
      gpuCardTypeId: infra.gpuCardTypeId,
      dataCenterCode: infra.dataCenterCode,
      dataCenterName: infra.dataCenterName,
      gpuCardTypeCode: infra.gpuCardTypeCode,
      gpuCardTypeName: infra.gpuCardTypeName,
      pricingMode: infra.pricingMode,
      listPricePerHour: infra.listPricePerHour,
      unitPricePerHour: infra.unitPricePerHour,
      revenueSharePercent: infra.revenueSharePercent,
      platformCardListPriceId: infra.platformCardListPriceId,
      supplierUnitCostId: infra.supplierUnitCostId,
      supplierPricingRecordId: infra.supplierPricingRecordId,
      pricingResolveStatus: infra.pricingResolveStatus,
      baseValue: computeBaseValueFallback({
        baseValue: row.baseValue,
        totalCardHours: row.totalCardHours,
        listPricePerHour: infra.listPricePerHour,
      }),
      updatedAt: new Date(),
    })
    .where(eq(tenantRegionGpuConsumptionMonthly.id, rowId))
}

export async function runMonthlyCost(input: {
  billingPeriodId: string
  usageMonth: string
  actorId?: string | null
}): Promise<RunMonthlyCostResult> {
  const period = await precheckMonthlyCostRun(input)
  const asOfDate = lastDayOfUsageMonth(input.usageMonth)
  const startedAt = new Date()

  const monthlyRows = await db
    .select()
    .from(tenantRegionGpuConsumptionMonthly)
    .where(eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth))

  const platformIds = [...new Set(monthlyRows.map((r) => r.tenantPlatformId))]
  const bindings = await resolveCostTenantBindings({
    billingPeriodId: input.billingPeriodId,
    tenantPlatformIds: platformIds,
    periodEnd: period.periodEnd,
  })
  const bindingByPlatform = new Map(bindings.map((b) => [b.tenantPlatformId, b]))

  const bareMetalPlatformIds = [
    ...new Set(
      monthlyRows.filter((r) => r.productLine === 'bare_metal').map((r) => r.tenantPlatformId),
    ),
  ]
  const [bareMetalAmortByKey, bareMetalOrderRefs] = await Promise.all([
    loadBareMetalAmortizationForMonth({
      usageMonth: input.usageMonth,
      tenantPlatformIds: bareMetalPlatformIds,
    }),
    loadBareMetalOrderRefsByTenantRegion({
      usageMonth: input.usageMonth,
      tenantPlatformIds: bareMetalPlatformIds,
    }),
  ])

  const resolveBareMetalOrderNos = (row: {
    tenantPlatformId: string
    regionCode: string
    productLine: string
  }): string | null => {
    if (row.productLine !== 'bare_metal') return null
    const key = `${row.tenantPlatformId}::${normalizeBillingRegion(row.regionCode)}`
    return bareMetalOrderRefs.get(key) ?? null
  }

  const sellPriceCache = new Map<string, Awaited<ReturnType<typeof resolvePlatformListPriceAt>>>()
  async function getSellPrice(gpuCardTypeId: string, productLine: string) {
    const platformLine = mapTenantProductLineToPlatformListPrice(productLine)
    const key = `${gpuCardTypeId}::${platformLine}`
    if (!sellPriceCache.has(key)) {
      sellPriceCache.set(
        key,
        await resolvePlatformListPriceAt({
          gpuCardTypeId,
          asOfDate,
          productLine: platformLine,
          billingUnit: 'hour',
        }),
      )
    }
    return sellPriceCache.get(key) ?? null
  }

  const baseDrafts: BaseLineDraft[] = []
  const issues: MonthlyCostRunIssueDto[] = []

  for (const row of monthlyRows) {
    let workingRow = row
    let pricing = pricingFieldsFromMonthlyRow(workingRow)
    const orderNos = resolveBareMetalOrderNos(workingRow)

    // 机房主数据补全后，月表可能仍残留 region_not_found；跑批时按区域即时重解析并回写
    if (!pricing || workingRow.pricingResolveStatus !== 'ok') {
      const infra = await resolveInfraPricingSnapshot({
        regionCode: workingRow.regionCode,
        gpuModel: workingRow.gpuModel,
        usageDate: asOfDate,
        productLine: workingRow.productLine as TenantRegionGpuProductLine,
        idcName: workingRow.dataCenterName ?? workingRow.regionCode,
      })
      if (infra.pricingResolveStatus === 'ok') {
        await persistMonthlyPricingRefresh(workingRow.id, workingRow, infra)
        workingRow = {
          ...workingRow,
          dataCenterId: infra.dataCenterId,
          gpuCardTypeId: infra.gpuCardTypeId,
          dataCenterCode: infra.dataCenterCode,
          dataCenterName: infra.dataCenterName,
          gpuCardTypeCode: infra.gpuCardTypeCode,
          gpuCardTypeName: infra.gpuCardTypeName,
          pricingMode: infra.pricingMode,
          listPricePerHour: infra.listPricePerHour,
          unitPricePerHour: infra.unitPricePerHour,
          revenueSharePercent: infra.revenueSharePercent,
          platformCardListPriceId: infra.platformCardListPriceId,
          supplierUnitCostId: infra.supplierUnitCostId,
          supplierPricingRecordId: infra.supplierPricingRecordId,
          pricingResolveStatus: infra.pricingResolveStatus,
        }
        pricing = pricingFieldsFromMonthlyRow(workingRow)
      }
    }

    // 租户后补项目关联时，月表 project_id 可能仍为空；跑批时刷新 CRM 快照
    if (!workingRow.projectId) {
      const crm = await resolveTenantCrmSnapshot({
        tenantPlatformId: workingRow.tenantPlatformId,
        usageMonth: input.usageMonth,
      })
      if (crm.projectId) {
        await persistMonthlyCrmRefresh(workingRow.id, crm)
        workingRow = {
          ...workingRow,
          tenantId: crm.tenantId,
          customerId: crm.customerId,
          projectId: crm.projectId,
          tenantName: crm.tenantName,
          customerFullName: crm.customerFullName,
          projectName: crm.projectName,
          accountManagerStaffId: crm.accountManagerStaffId,
          accountManagerName: crm.accountManagerName,
          enrichmentBindingSource: crm.enrichmentBindingSource,
          projectEnrichmentSnapshot: crm.projectEnrichmentSnapshot,
          customerIncentiveType: crm.customerIncentiveType,
          customerIncentiveLabel: crm.customerIncentiveLabel,
          incentiveStartDate: crm.incentiveStartDate,
        }
      }
    }

    if (!pricing || workingRow.pricingResolveStatus !== 'ok') {
      issues.push(
        createRunIssue(
          'warning',
          'PRICING_RESOLVE_FAILED',
          `定价解析失败（status=${workingRow.pricingResolveStatus ?? 'unknown'}），已跳过该行`,
          snapshotMonthlyRow(workingRow, orderNos),
        ),
      )
      continue
    }

    const sell =
      workingRow.productLine === 'spot' || !workingRow.gpuCardTypeId
        ? null
        : await getSellPrice(workingRow.gpuCardTypeId, workingRow.productLine)

    const financials = computeDualBranchFinancials({
      balanceConsumption: workingRow.balanceConsumption,
      balanceCardHours: workingRow.balanceCardHours,
      voucherCardHours: workingRow.voucherCardHours,
      productLine: workingRow.productLine,
      pricing,
      sellPricePerHour: sell?.listPricePerHour ?? null,
    })
    if (!financials) {
      issues.push(
        createRunIssue(
          'warning',
          'FINANCIALS_COMPUTE_FAILED',
          '双分支财务指标计算失败，已跳过该行',
          snapshotMonthlyRow(workingRow, orderNos),
        ),
      )
      continue
    }

    const binding = bindingByPlatform.get(workingRow.tenantPlatformId)
    const targets: { projectId: string | null; percent: number }[] = []

    // 优先用跑批时刷新后的 CRM 绑定；月表快照可能滞后于后补的项目关联
    if (binding && binding.projects.length === 1) {
      targets.push({ projectId: binding.projects[0]!.projectId, percent: 100 })
    } else if (binding && binding.projects.length > 1) {
      for (const p of binding.projects) {
        const pct = Number(p.allocationPercent ?? 0)
        if (pct > 0) targets.push({ projectId: p.projectId, percent: pct })
      }
      if (targets.length === 0 && workingRow.projectId) {
        targets.push({ projectId: workingRow.projectId, percent: 100 })
      }
    } else if (workingRow.projectId) {
      targets.push({ projectId: workingRow.projectId, percent: 100 })
    } else {
      targets.push({ projectId: null, percent: 100 })
    }

    for (const target of targets) {
      const pct = target.percent / 100

      let remark: string | null = workingRow.productLine === 'spot' ? 'spot_balance_pct' : null
      if (
        workingRow.productLine === 'bare_metal' &&
        workingRow.dataCenterId &&
        workingRow.gpuCardTypeId
      ) {
        const amortKey = bareMetalAmortizationKey({
          tenantPlatformId: workingRow.tenantPlatformId,
          dataCenterId: workingRow.dataCenterId,
          gpuCardTypeId: workingRow.gpuCardTypeId,
        })
        const amort = bareMetalAmortByKey.get(amortKey)
        const amortRemark = formatBareMetalAmortizationRemark({
          monthlyBalanceCardHours: Number(workingRow.balanceCardHours) * pct,
          monthlyVoucherCardHours: Number(workingRow.voucherCardHours) * pct,
          amortBalanceCardHours: (amort?.balanceCardHours ?? 0) * pct,
          amortVoucherCardHours: (amort?.voucherCardHours ?? 0) * pct,
          missingRentDeviceCount: amort?.missingRentDeviceCount ?? 0,
        })
        if (amortRemark) {
          issues.push(
            createRunIssue(
              'warning',
              'BARE_METAL_AMORT_MISMATCH',
              amortRemark,
              snapshotMonthlyRow(workingRow, orderNos),
            ),
          )
          remark = remark ? `${remark}; ${amortRemark}` : amortRemark
        }
        if (!amort || amort.matchedDeviceCount === 0) {
          const noOrderRemark = '裸金属: 未匹配到相交订单设备'
          issues.push(
            createRunIssue(
              'warning',
              'BARE_METAL_NO_ORDER',
              noOrderRemark,
              snapshotMonthlyRow(workingRow, orderNos),
            ),
          )
          remark = remark ? `${remark}; ${noOrderRemark}` : noOrderRemark
        }
      }

      const draft: BaseLineDraft = {
        projectId: target.projectId,
        tenantPlatformId: workingRow.tenantPlatformId,
        tenantId: workingRow.tenantId,
        productLine: workingRow.productLine,
        regionCode: workingRow.regionCode,
        gpuCardTypeId: workingRow.gpuCardTypeId,
        gpuCardTypeName: workingRow.gpuCardTypeName,
        dataCenterId: workingRow.dataCenterId,
        customerFullName: workingRow.customerFullName,
        accountManagerStaffId: workingRow.accountManagerStaffId,
        accountManagerName: workingRow.accountManagerName,
        opportunitySource: null,
        opportunitySourceLabel: null,
        customerIncentiveType: workingRow.customerIncentiveType,
        customerIncentiveLabel: workingRow.customerIncentiveLabel,
        balanceConsumption: scaleMetric(parseMoney(workingRow.balanceConsumption), target.percent),
        balanceCardHours: scaleMetric(Number(workingRow.balanceCardHours), target.percent),
        voucherCardHours: scaleMetric(Number(workingRow.voucherCardHours), target.percent),
        confirmedRevenueExclTax: scaleMetric(financials.confirmedRevenueExclTax, target.percent),
        pcSold: scaleMetric(financials.platformCost.soldDurationCostExclTax, target.percent),
        pcGifted: scaleMetric(financials.platformCost.giftedDurationCostExclTax, target.percent),
        pcGross: scaleMetric(financials.platformCost.grossProfit, target.percent),
        spSold: scaleMetric(financials.platformSellPrice.soldDurationCostExclTax, target.percent),
        spGifted: scaleMetric(financials.platformSellPrice.giftedDurationCostExclTax, target.percent),
        spGross: scaleMetric(financials.platformSellPrice.grossProfit, target.percent),
        pcSupplierUnitCostId: workingRow.supplierUnitCostId,
        spPlatformCardListPriceId:
          sell?.platformCardListPriceId ?? workingRow.platformCardListPriceId,
        spSellPricePerHour: sell?.listPricePerHour ?? null,
        remark,
      }

      baseDrafts.push(draft)
    }
  }

  const projectAgg = new Map<
    string,
    {
      projectId: string
      pcGross: number
      spGross: number
      projectName: string | null
      accountManagerStaffId: string | null
      accountManagerName: string | null
      customerIncentiveLabel: '新客' | '老客'
    }
  >()

  for (const line of baseDrafts) {
    if (!line.projectId) continue
    const acc = projectAgg.get(line.projectId) ?? {
      projectId: line.projectId,
      pcGross: 0,
      spGross: 0,
      projectName: null,
      accountManagerStaffId: line.accountManagerStaffId,
      accountManagerName: line.accountManagerName,
      customerIncentiveLabel: normalizeIncentiveLabel(line.customerIncentiveLabel),
    }
    acc.pcGross += line.pcGross
    acc.spGross += line.spGross
    projectAgg.set(line.projectId, acc)
  }

  const projectMeta: ProjectCommissionInput[] = []
  for (const agg of projectAgg.values()) {
    const project = await db.query.crmProject.findFirst({
      where: eq(crmProject.id, agg.projectId),
      columns: { name: true },
    })
    const opp = await resolveOpportunitySourceAtMonth(agg.projectId, input.usageMonth)
    if (!opp) {
      issues.push(
        createRunIssue(
          'error',
          'MISSING_OPPORTUNITY_SOURCE',
          '项目缺少商机来源，已跳过销售/市场提成（中台部门池仍计入）',
          {
            project_id: agg.projectId,
            project_name: project?.name ?? null,
            account_manager_name: agg.accountManagerName,
          },
        ),
      )
    }

    let staffId = agg.accountManagerStaffId
    if (!staffId) {
      staffId = await resolveEffectiveAccountManager(agg.projectId, input.usageMonth)
    }
    const staffName = await resolveStaffName(staffId)
    const position = staffId ? await loadStaffPosition(staffId) : null
    const skipSales = position === '经理'

    projectMeta.push({
      projectId: agg.projectId,
      projectName: project?.name ?? null,
      accountManagerStaffId: staffId,
      accountManagerName: staffName ?? agg.accountManagerName,
      opportunitySource: opp,
      customerIncentiveLabel: agg.customerIncentiveLabel,
      pcGrossProfit: agg.pcGross,
      spGrossProfit: agg.spGross,
      skipSalesIndividual: skipSales,
    })
  }

  const { lines: commissionProjectLines } = buildCommissionProjectLines(projectMeta)

  const issueCounts = countRunIssues(issues)

  const amLines = rollupAmCommissionLines(commissionProjectLines)
  const deptPools = rollupDeptPoolLines(commissionProjectLines)

  const oppByProject = new Map(
    projectMeta
      .filter((p) => p.opportunitySource)
      .map((p) => [p.projectId, p.opportunitySource!]),
  )
  for (const draft of baseDrafts) {
    if (!draft.projectId) continue
    const opp = oppByProject.get(draft.projectId)
    if (!opp) continue
    draft.opportunitySource = opp
    draft.opportunitySourceLabel = MONTHLY_COST_OPPORTUNITY_SHORT_LABELS[opp]
  }

  const runId = newId()

  await db.transaction(async (tx) => {
    await tx
      .delete(monthlyCostRun)
      .where(
        and(
          eq(monthlyCostRun.billingPeriodId, input.billingPeriodId),
          eq(monthlyCostRun.usageMonth, input.usageMonth),
        ),
      )

    await tx.insert(monthlyCostRun).values({
      id: runId,
      billingPeriodId: input.billingPeriodId,
      billingPeriodCode: period.periodCode,
      usageMonth: input.usageMonth,
      status: 'running',
      startedAt,
      triggeredBy: input.actorId ?? null,
    })

    if (baseDrafts.length > 0) {
      await tx.insert(monthlyCostBaseLine).values(
        baseDrafts.map((d) => ({
          id: newId(),
          runId,
          usageMonth: input.usageMonth,
          projectId: d.projectId,
          tenantPlatformId: d.tenantPlatformId,
          tenantId: d.tenantId,
          productLine: d.productLine,
          regionCode: d.regionCode,
          gpuCardTypeId: d.gpuCardTypeId,
          gpuCardTypeName: d.gpuCardTypeName,
          dataCenterId: d.dataCenterId,
          customerFullName: d.customerFullName,
          accountManagerStaffId: d.accountManagerStaffId,
          accountManagerName: d.accountManagerName,
          opportunitySource: d.opportunitySource,
          opportunitySourceLabel: d.opportunitySourceLabel,
          customerIncentiveType: d.customerIncentiveType,
          customerIncentiveLabel: d.customerIncentiveLabel,
          balanceConsumption: money4(d.balanceConsumption),
          balanceCardHours: String(d.balanceCardHours),
          voucherCardHours: String(d.voucherCardHours),
          confirmedRevenueExclTax: money4(d.confirmedRevenueExclTax),
          pcSoldDurationCostExclTax: money4(d.pcSold),
          pcGiftedDurationCostExclTax: money4(d.pcGifted),
          pcGrossProfit: money4(d.pcGross),
          spSoldDurationCostExclTax: money4(d.spSold),
          spGiftedDurationCostExclTax: money4(d.spGifted),
          spGrossProfit: money4(d.spGross),
          pcSupplierUnitCostId: d.pcSupplierUnitCostId,
          spPlatformCardListPriceId: d.spPlatformCardListPriceId,
          spSellPricePerHour: d.spSellPricePerHour != null ? money4(d.spSellPricePerHour) : null,
          remark: d.remark,
        })),
      )
    }

    if (commissionProjectLines.length > 0) {
      await tx.insert(monthlyCostCommissionProjectLine).values(
        commissionProjectLines.map((l) => ({
          id: newId(),
          runId,
          usageMonth: input.usageMonth,
          costBranch: l.costBranch,
          projectId: l.projectId,
          projectName: l.projectName,
          recipientRole: l.recipientRole,
          recipientDept: l.recipientDept,
          accountManagerStaffId: l.accountManagerStaffId,
          accountManagerName: l.accountManagerName,
          opportunitySource: l.opportunitySource,
          customerIncentiveLabel: l.customerIncentiveLabel,
          grossProfitBase: money4(l.grossProfitBase),
          commissionRate: String(l.commissionRate),
          commissionAmount: money4(l.commissionAmount),
        })),
      )
    }

    if (amLines.length > 0) {
      await tx.insert(monthlyCostCommissionLine).values(
        amLines.map((l) => ({
          id: newId(),
          runId,
          usageMonth: input.usageMonth,
          costBranch: l.costBranch,
          accountManagerStaffId: l.accountManagerStaffId,
          accountManagerName: l.accountManagerName,
          opportunitySource: l.opportunitySource,
          opportunitySourceLabel: l.opportunitySourceLabel,
          customerIncentiveLabel: l.customerIncentiveLabel,
          grossProfitSum: money4(l.grossProfitSum),
          commissionRate: String(l.commissionRate),
          commissionAmount: money4(l.commissionAmount),
        })),
      )
    }

    let deptPoolProjectCount = 0
    let deptDistributionCount = 0
    let poolsWithWeights = 0
    let poolsDistributed = 0
    let deptDistributionStatus: 'complete' | 'pending' | 'not_applicable' = 'not_applicable'

    for (const pool of deptPools) {
      const poolLineId = newId()

      await tx.insert(monthlyCostDeptPoolLine).values({
        id: poolLineId,
        runId,
        usageMonth: input.usageMonth,
        costBranch: pool.costBranch,
        recipientDept: pool.recipientDept,
        customerIncentiveLabel: pool.customerIncentiveLabel,
        grossProfitBaseSum: money4(pool.grossProfitBaseSum),
        commissionPoolSum: money4(pool.commissionPoolSum),
        projectCount: pool.projectCount,
        poolScopeNote: pool.poolScopeNote,
      })

      if (pool.projectLines.length > 0) {
        await tx.insert(monthlyCostDeptPoolProjectLine).values(
          pool.projectLines.map((p) => ({
            id: newId(),
            runId,
            deptPoolLineId: poolLineId,
            usageMonth: input.usageMonth,
            costBranch: pool.costBranch,
            recipientDept: pool.recipientDept,
            customerIncentiveLabel: pool.customerIncentiveLabel,
            projectId: p.projectId,
            projectName: p.projectName,
            opportunitySource: p.opportunitySource,
            opportunitySourceLabel: p.opportunitySourceLabel,
            accountManagerName: p.accountManagerName,
            grossProfitBase: money4(p.grossProfitBase),
            commissionPoolAmount: money4(p.commissionPoolAmount),
          })),
        )
        deptPoolProjectCount += pool.projectLines.length
      }

      const weights = await tx
        .select()
        .from(monthlyCostDeptContributionWeight)
        .where(
          and(
            eq(monthlyCostDeptContributionWeight.usageMonth, input.usageMonth),
            eq(monthlyCostDeptContributionWeight.recipientDept, pool.recipientDept),
            eq(
              monthlyCostDeptContributionWeight.customerIncentiveLabel,
              pool.customerIncentiveLabel,
            ),
            or(
              isNull(monthlyCostDeptContributionWeight.costBranch),
              eq(monthlyCostDeptContributionWeight.costBranch, pool.costBranch),
            ),
          ),
        )

      if (weights.length > 0) {
        poolsWithWeights += 1
        const sum = weights.reduce((s, w) => s + Number(w.weightPercent), 0)
        if (Math.abs(sum - 100) <= 0.01) {
          const staffIds = weights.map((w) => w.staffId)
          const staffRows = await tx
            .select({
              id: userStaff.id,
              displayName: userStaff.displayName,
              position: userStaff.position,
            })
            .from(userStaff)
            .where(inArray(userStaff.id, staffIds))
          const staffNameMap = new Map(staffRows.map((s) => [s.id, s.displayName]))
          const staffPositionMap = new Map(staffRows.map((s) => [s.id, s.position]))

          const eligible = weights.filter((w) => staffPositionMap.get(w.staffId) !== '经理')
          const eligibleSum = eligible.reduce((s, w) => s + Number(w.weightPercent), 0)

          if (eligible.length > 0 && Math.abs(eligibleSum - 100) <= 0.01) {
            poolsDistributed += 1
            for (const w of eligible) {
              const amount = pool.commissionPoolSum * (Number(w.weightPercent) / 100)
              await tx.insert(monthlyCostDeptDistributionLine).values({
                id: newId(),
                runId,
                deptPoolLineId: poolLineId,
                usageMonth: input.usageMonth,
                costBranch: pool.costBranch,
                recipientDept: pool.recipientDept,
                customerIncentiveLabel: pool.customerIncentiveLabel,
                staffId: w.staffId,
                staffName: staffNameMap.get(w.staffId) ?? w.staffId,
                weightPercent: w.weightPercent,
                commissionAmount: money4(amount),
                sourcePoolAmount: money4(pool.commissionPoolSum),
              })
              deptDistributionCount += 1
            }
          }
        }
      }
    }

    if (deptPools.length === 0) {
      deptDistributionStatus = 'not_applicable'
    } else if (poolsWithWeights === 0) {
      deptDistributionStatus = 'pending'
    } else if (poolsDistributed === poolsWithWeights) {
      deptDistributionStatus = 'complete'
    } else {
      deptDistributionStatus = 'pending'
    }

    await tx
      .update(monthlyCostRun)
      .set({
        status: 'completed',
        finishedAt: new Date(),
        baseLineCount: baseDrafts.length,
        commissionProjectLineCount: commissionProjectLines.length,
        commissionAmLineCount: amLines.length,
        deptPoolLineCount: deptPools.length,
        deptPoolProjectLineCount: deptPoolProjectCount,
        deptDistributionLineCount: deptDistributionCount,
        warningCount: issueCounts.warningCount,
        deptDistributionStatus,
        errorSummary: serializeRunIssues(issues),
      })
      .where(eq(monthlyCostRun.id, runId))
  })

  return {
    runId,
    status: 'completed',
    baseLineCount: baseDrafts.length,
    warningCount: issueCounts.warningCount,
    errorCount: issueCounts.errorCount,
    issueCount: issues.length,
  }
}
