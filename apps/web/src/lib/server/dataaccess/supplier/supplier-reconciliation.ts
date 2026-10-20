import { db } from '@/lib/db'
import {
  supplier,
  supplierContract,
  supplierBill,
  supplierBillDetail,
  supplierBillDaily,
  supplierBillDailyDetail,
  invoice,
  invoiceRequest,
  tenantRegionGpuConsumptionDaily,
} from '@workspace/db'
import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import { subtractMoney, sumMoney } from '@workspace/billing/money'

/** 单张账单的一致性校验结果。`issues` 非空即代表这条账单不能直接付。 */
export type BillReconciliationRow = {
  billId: string
  billMonth: string
  status: string
  totalAmount: string
  finalAmount: string
  detailAmountSum: string
  tenantConsumptionSum: string
  dailyAmountSum: string
  monthAmountForDailyDc: string
  shapeAmountSum: string
  expectedFinalAmount: string
  grossProfit: string | null
  expectedGrossProfit: string
  invoiceAmount: string | null
  paid: boolean
  /** W-12：该账单金额按合同归因的结果。合同只到设备粒度才有唯一值。 */
  contractAttributions: ContractAttribution[]
  /** 归因到具体合同的金额占应结金额的比例（0~1），其余为残差/费用类无法归因部分。 */
  attributedAmount: string
  unattributedAmount: string
  issues: string[]
}

/** 单份合同在某张账单下承担的金额。 */
export type ContractAttribution = {
  contractId: string
  contractNo: string | null
  amount: string
  usageHours: string
}

export type SupplierMonthReconciliation = {
  supplierId: string
  supplierName: string
  /**
   * 该供应商在本账期的账单 id。`supplier_bill` 对 (supplier_id, bill_month) 有
   * 唯一索引，一个账期只会有一张，所以用它定位合同归因明细。
   */
  billId: string | null
  billCount: number
  pendingCount: number
  confirmedCount: number
  paidCount: number
  totalUsageHours: string
  totalAmount: string
  networkFee: string
  managementFee: string
  storageFee: string
  finalAmount: string
  tenantConsumption: string
  grossProfit: string | null
  invoicedAmount: string
  paidAmount: string
  issueCount: number
  issues: string[]
  /** W-12：合同归因（按 (供应商, 合同) 汇总该账期日明细的 contract_id）。 */
  contractAttributions: ContractAttribution[]
  /** 归因到具体合同的金额。 */
  attributedAmount: string
  /** 未归因金额 = 应结金额 − 已归因金额。 */
  unattributedAmount: string
}

export type ReconciliationReport = {
  billMonth: string
  totals: {
    billCount: number
    supplierCount: number
    finalAmount: string
    tenantConsumption: string
    grossProfit: string
    invoicedAmount: string
    paidAmount: string
    issueCount: number
  }
  rows: SupplierMonthReconciliation[]
  billChecks: BillReconciliationRow[]
}

/**
 * 平台侧供应商对账（W-25）。
 *
 * 此前应付供应商金额与平台入账成本之间**没有任何自动校验**：出账逻辑散落在
 * generation 里，金额一旦算错，只能等供应商自己对账时才发现。本模块把账期内
 * 每一张账单的关键恒等式重算一遍并给出差异，让运营在对账页就能看到异常。
 *
 * 校验的恒等式（全部按 4 位定点精确比较，不用 0.01 容差 —— W-19 之后金额已是
 * BigInt 定点，容差只会把真实差异藏起来）：
 *   1. 明细金额合计 == 账单 total_amount
 *   2. 明细租户消费合计 − final_amount == gross_profit
 *   3. final_amount == total + 网络费 + 管控费 + 存储费 + 调整额
 *   4. 分形态金额之和 == total_amount
 *   5. 同机房日账单合计 == 月账单对应部分（按 DC 聚合比对）
 */
export const supplierReconciliationDataAccess = {
  async report(billMonth: string): Promise<ReconciliationReport> {
    const billRows = await db
      .select()
      .from(supplierBill)
      .where(eq(supplierBill.billMonth, billMonth))
      .orderBy(desc(supplierBill.createdAt))

    const billIds = billRows.map((b) => b.id)
    const supplierIds = [...new Set(billRows.map((b) => b.supplierId))]

    const [detailRows, dailyRows, supplierRows] = await Promise.all([
      billIds.length > 0
        ? db
            .select()
            .from(supplierBillDetail)
            .where(inArray(supplierBillDetail.billId, billIds))
        : Promise.resolve([]),
      // 日账单与月账单之间**没有外键**：日账单按
      // (supplier_id, data_center_id, usage_month) 定位，月账单由出账任务按同样
      // 口径聚合而成。所以这里只能用同样的三元组回连，不能 JOIN bill_id。
      db
        .select()
        .from(supplierBillDaily)
        .where(eq(supplierBillDaily.usageMonth, billMonth)),
      supplierIds.length > 0
        ? db.select().from(supplier).where(inArray(supplier.id, supplierIds))
        : Promise.resolve([]),
    ])

    // 独立重算毛利的输入：账期内按 (机房, 卡型) 聚合的租户消费。
    // 必须自己从消费表重算而不能读明细列 —— supplier_bill_detail.tenant_consumption
    // 只在 revenue_share 明细上有值，直接拿它当消费会把卡时账单的毛利算成巨亏。
    const consumptionRows = await db
      .select({
        dataCenterId: tenantRegionGpuConsumptionDaily.dataCenterId,
        gpuCardTypeId: tenantRegionGpuConsumptionDaily.gpuCardTypeId,
        totalConsumption: tenantRegionGpuConsumptionDaily.totalConsumption,
      })
      .from(tenantRegionGpuConsumptionDaily)
      .where(
        and(
          gte(tenantRegionGpuConsumptionDaily.usageDate, `${billMonth}-01`),
          lt(tenantRegionGpuConsumptionDaily.usageDate, nextMonth(billMonth)),
          isNotNull(tenantRegionGpuConsumptionDaily.dataCenterId),
          isNotNull(tenantRegionGpuConsumptionDaily.gpuCardTypeId),
        ),
      )

    const consumptionByDcCard = new Map<string, string[]>()
    for (const c of consumptionRows) {
      if (!c.dataCenterId || !c.gpuCardTypeId) continue
      const key = `${c.dataCenterId}::${c.gpuCardTypeId}`
      consumptionByDcCard.set(key, [
        ...(consumptionByDcCard.get(key) ?? []),
        c.totalConsumption,
      ])
    }

    // W-12：合同归因从日明细的 contract_id 汇总。日明细是设备粒度，
    // 唯一能确定合同的地方；账单头/明细头按 (机房, 卡型) 聚合，跨多合同。
    const dailyDetailRows = await db
      .select({
        supplierId: supplierBillDaily.supplierId,
        dataCenterId: supplierBillDaily.dataCenterId,
        usageMonth: supplierBillDaily.usageMonth,
        contractId: supplierBillDailyDetail.contractId,
        amount: supplierBillDailyDetail.amount,
        usageHours: supplierBillDailyDetail.usageHours,
      })
      .from(supplierBillDailyDetail)
      .innerJoin(
        supplierBillDaily,
        eq(supplierBillDaily.id, supplierBillDailyDetail.dailyBillId),
      )
      .where(eq(supplierBillDaily.usageMonth, billMonth))

    // 按 (供应商, 合同) 归集：supplier_bill 对 (supplier_id, bill_month) 有唯一
    // 索引，一个供应商一个账期只有一张账单，所以「该供应商该月的钱来自哪些合同」
    // 可以整份挂到这张账单上，不会跨账单重复计数。
    const amountBySupplierContract = new Map<string, string[]>()
    const hoursBySupplierContract = new Map<string, string[]>()
    for (const d of dailyDetailRows) {
      if (!d.contractId) continue
      const key = `${d.supplierId}::${d.contractId}`
      amountBySupplierContract.set(key, [
        ...(amountBySupplierContract.get(key) ?? []),
        d.amount,
      ])
      hoursBySupplierContract.set(key, [
        ...(hoursBySupplierContract.get(key) ?? []),
        d.usageHours,
      ])
    }

    const contractIds = [
      ...new Set(
        [...amountBySupplierContract.keys()].map((k) => k.split('::')[1] ?? ''),
      ),
    ].filter((id) => id !== '')
    const contractRows = contractIds.length > 0
      ? await db
          .select({ id: supplierContract.id, contractNo: supplierContract.contractNo })
          .from(supplierContract)
          .where(inArray(supplierContract.id, contractIds))
      : []
    const contractNoById = new Map(contractRows.map((c) => [c.id, c.contractNo]))

    const invoiceRows = await db
      .select({
        billId: invoiceRequest.billMonthlyId,
        invoiceTotal: invoice.totalAmount,
        voidStatus: invoice.voidStatus,
      })
      .from(invoice)
      .innerJoin(invoiceRequest, eq(invoiceRequest.id, invoice.invoiceRequestId))
      .where(inArray(invoiceRequest.billMonthlyId, billIds.length > 0 ? billIds : ['']))

    const supplierIdByBill = new Map(billRows.map((b) => [b.id, b.supplierId]))
    const detailsByBill = groupSum(detailRows, (d) => [d.billId], (d) => ({
      amount: d.amount,
      tenantConsumption: d.tenantConsumption,
    }))

    // 日账单按「账单 + 机房」聚合：月账单也是按机房出明细，逐机房比对才不会
    // 出现「A 机房多算、B 机房少算恰好抵消」而总额校验仍然通过。
    // 日账单金额按 (供应商, 机房) 聚合，供逐机房比对。
    const dailyBySupplierDc = new Map<string, string>()
    for (const d of dailyRows) {
      const key = `${d.supplierId}::${d.dataCenterId}`
      dailyBySupplierDc.set(
        key,
        sumMoney([dailyBySupplierDc.get(key), d.totalAmount]),
      )
    }

    const invoiceByBill = new Map<string, string>()
    for (const i of invoiceRows) {
      // 已作废发票不计入已开票金额：票据已失效，不能算作覆盖了账单金额。
      if (i.voidStatus === 'voided') continue
      invoiceByBill.set(
        i.billId,
        sumMoney([invoiceByBill.get(i.billId), i.invoiceTotal]),
      )
    }

    const billChecks: BillReconciliationRow[] = billRows.map((b) => {
      const issues: string[] = []
      const agg = detailsByBill.get(b.id)
      const detailAmountSum = sumMoney(agg?.amount ?? [])
      const tenantConsumptionSum = sumMoney(agg?.tenantConsumption ?? [])

      const shapeAmountSum = sumMoney([
        b.supplierCardTimeAmount,
        b.supplierWholeRentAmount,
        b.supplierRevenueShareAmount,
      ])
      const expectedFinalAmount = sumMoney([
        b.totalAmount,
        b.networkFee,
        b.managementFee,
        b.storageFee,
        b.adjustmentAmount,
      ])
      // 毛利独立重算：只用**本账单明细覆盖到的 (机房, 卡型)** 的消费，
      // 与出账时的口径一致（账单里没有的卡型，其消费不归本供应商）。
      const billCardKeys = [
        ...new Set(
          detailRows
            .filter((d) => d.billId === b.id)
            .map((d) => `${d.dataCenterId}::${d.gpuCardTypeId}`),
        ),
      ]
      const recomputedConsumption = sumMoney(
        billCardKeys.flatMap((k) => consumptionByDcCard.get(k) ?? []),
      )
      const expectedGrossProfit = subtractMoney(recomputedConsumption, b.finalAmount)
      // 逐机房比对日账单。只比「有月明细的机房」：整租月租、网络费、管控费
      // 按月一次性计入月账单明细，不来自日账单求和，拿它们跟日账单比必然出差异。
      const sup = supplierIdByBill.get(b.id) ?? ''
      const monthDcKeys = [
        ...new Set(
          detailRows
            .filter((d) => d.billId === b.id)
            .map((d) => `${sup}::${d.dataCenterId}`),
        ),
      ].filter((k) => dailyBySupplierDc.has(k))
      const dailyAmountSum = sumMoney(
        monthDcKeys.map((k) => dailyBySupplierDc.get(k)),
      )
      const monthAmountForDailyDc = sumMoney(
        monthDcKeys.map((k) =>
          sumMoney(
            detailRows
              .filter((d) => d.billId === b.id && `${sup}::${d.dataCenterId}` === k)
              .map((d) => d.amount),
          ),
        ),
      )

      if (detailAmountSum !== b.totalAmount) {
        issues.push(
          `明细合计 ${detailAmountSum} ≠ 账单金额 ${b.totalAmount}`,
        )
      }
      if (shapeAmountSum !== b.totalAmount) {
        issues.push(
          `分形态金额之和 ${shapeAmountSum} ≠ 账单金额 ${b.totalAmount}`,
        )
      }
      if (expectedFinalAmount !== b.finalAmount) {
        issues.push(
          `应结应为 ${expectedFinalAmount}，实际 ${b.finalAmount}`,
        )
      }
      if (b.grossProfit !== null && sumMoney([b.grossProfit]) !== expectedGrossProfit) {
        issues.push(
          `毛利应为 ${expectedGrossProfit}，实际 ${b.grossProfit}`,
        )
      }
      if (monthDcKeys.length > 0 && dailyAmountSum !== monthAmountForDailyDc) {
        issues.push(
          `日账单合计 ${dailyAmountSum} ≠ 对应机房月明细 ${monthAmountForDailyDc}`,
        )
      }

      // 合同归因按 (供应商, 合同) 汇总该供应商全部日明细，再摊到各账单上：
      // 日账单与月账单之间没有外键，只能用 (supplier, dataCenter, usageMonth)
      // 回连。对账单来说归因是「这个供应商这个月的钱来自哪些合同」，
      // 按供应商维度归因即可，跨账单不重复计数。
      const supAttributions: ContractAttribution[] = [
        ...amountBySupplierContract.entries(),
      ]
        .filter(([key]) => key.startsWith(`${sup}::`))
        .map(([key, amounts]) => {
          const contractId = key.slice(sup.length + 2)
          return {
            contractId,
            contractNo: contractNoById.get(contractId) ?? null,
            amount: sumMoney(amounts),
            usageHours: sumMoney(hoursBySupplierContract.get(key) ?? []),
          }
        })
        .sort((a, b) => Number(b.amount) - Number(a.amount))

      const attributedAmount = sumMoney(supAttributions.map((a) => a.amount))

      return {
        billId: b.id,
        billMonth: b.billMonth,
        status: b.status,
        totalAmount: b.totalAmount,
        finalAmount: b.finalAmount,
        detailAmountSum,
        tenantConsumptionSum,
        dailyAmountSum,
        monthAmountForDailyDc,
        shapeAmountSum,
        expectedFinalAmount,
        grossProfit: b.grossProfit,
        expectedGrossProfit,
        invoiceAmount: invoiceByBill.get(b.id) ?? null,
        paid: b.status === 'paid',
        contractAttributions: supAttributions,
        attributedAmount,
        // 未归因部分 = 应结金额 − 已归因到合同的金额。网络费/管控费按机房
        // 一次性计入、残差桶不对应设备，这两部分天然归因不到单一合同。
        unattributedAmount: subtractMoney(b.finalAmount, attributedAmount),
        issues,
      }
    })

    const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]))
    const rows: SupplierMonthReconciliation[] = supplierIds.map((sid) => {
      const bills = billRows.filter((b) => b.supplierId === sid)
      const checks = billChecks.filter((c) => bills.some((b) => b.id === c.billId))
      const byStatus = (st: string) =>
        sumMoney(bills.filter((b) => b.status === st).map((b) => b.finalAmount))

      const issues = checks.flatMap((c) => c.issues.map((i) => `${c.billId.slice(0, 8)}：${i}`))
      const finalAmount = sumMoney(bills.map((b) => b.finalAmount))
      const tenantConsumption = sumMoney(checks.map((c) => c.tenantConsumptionSum))
      const grossProfitValues = bills
        .map((b) => b.grossProfit)
        .filter((g): g is string => g !== null)

      return {
        supplierId: sid,
        supplierName: supplierNameById.get(sid) ?? sid,
        billId: bills[0]?.id ?? null,
        billCount: bills.length,
        pendingCount: bills.filter((b) => b.status === 'pending').length,
        confirmedCount: bills.filter((b) => b.status === 'confirmed').length,
        paidCount: bills.filter((b) => b.status === 'paid').length,
        totalUsageHours: sumMoney(bills.map((b) => b.totalUsageHours)),
        totalAmount: sumMoney(bills.map((b) => b.totalAmount)),
        networkFee: sumMoney(bills.map((b) => b.networkFee)),
        managementFee: sumMoney(bills.map((b) => b.managementFee)),
        storageFee: sumMoney(bills.map((b) => b.storageFee)),
        finalAmount,
        tenantConsumption,
        grossProfit:
          grossProfitValues.length === 0
            ? null
            : sumMoney(grossProfitValues),
        invoicedAmount: sumMoney(
          checks.map((c) => c.invoiceAmount).filter((v): v is string => v !== null),
        ),
        paidAmount: byStatus('paid'),
        issueCount: issues.length,
        issues,
        contractAttributions: checks
          .flatMap((c) => c.contractAttributions)
          .reduce<ContractAttribution[]>((acc, a) => {
            const hit = acc.find((x) => x.contractId === a.contractId)
            if (hit) {
              hit.amount = sumMoney([hit.amount, a.amount])
              hit.usageHours = sumMoney([hit.usageHours, a.usageHours])
            } else {
              acc.push({ ...a })
            }
            return acc
          }, [])
          .sort((a, b) => Number(b.amount) - Number(a.amount)),
        attributedAmount: sumMoney(checks.map((c) => c.attributedAmount)),
        unattributedAmount: sumMoney(checks.map((c) => c.unattributedAmount)),
      }
    })

    return {
      billMonth,
      totals: {
        billCount: billRows.length,
        supplierCount: supplierIds.length,
        finalAmount: sumMoney(rows.map((r) => r.finalAmount)),
        tenantConsumption: sumMoney(rows.map((r) => r.tenantConsumption)),
        grossProfit: sumMoney(
          rows.map((r) => r.grossProfit).filter((v): v is string => v !== null),
        ),
        invoicedAmount: sumMoney(rows.map((r) => r.invoicedAmount)),
        paidAmount: sumMoney(rows.map((r) => r.paidAmount)),
        issueCount: rows.reduce((acc, r) => acc + r.issueCount, 0),
      },
      rows: rows.sort((a, b) =>
        a.issueCount === b.issueCount
          ? a.supplierName.localeCompare(b.supplierName, 'zh-CN')
          : b.issueCount - a.issueCount,
      ),
      billChecks,
    }
  },

  /** 对账页可选账期：该库已出账的月份，倒序。 */
  async listBillMonths(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ billMonth: supplierBill.billMonth })
      .from(supplierBill)
      .orderBy(desc(supplierBill.billMonth))
      .limit(36)
    return rows.map((r) => r.billMonth)
  },
}

/** 由 YYYY-MM 推出次月 YYYY-MM-01，作为消费表的区间上界（开区间）。 */
function nextMonth(billMonth: string): string {
  const [yStr, mStr] = billMonth.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    // 非法账期直接返回一个不可能命中的上界，避免算出 NaN 悄悄放过所有消费。
    return '9999-12-31'
  }
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

function groupSum<T>(
  rows: T[],
  keyOf: (row: T) => (string | null)[],
  valueOf: (row: T) => Record<string, string | null>,
): Map<string, Record<string, string[]>> {
  const out = new Map<string, Record<string, string[]>>()
  for (const row of rows) {
    const key = keyOf(row).join('::')
    if (!keyOf(row).every((k) => k !== null)) continue
    const acc = out.get(key) ?? {}
    for (const [k, v] of Object.entries(valueOf(row))) {
      if (v === null) continue
      acc[k] = [...(acc[k] ?? []), v]
    }
    out.set(key, acc)
  }
  return out
}
