/**
 * 供应商结算出账端到端验证（手动脚本）。
 *
 * 用途：播种一套最小结算数据集（3 种计价形态 × 3 天），跑真实
 * `runScheduledSupplierBilling`，然后断言账单头与明细之间的全部恒等式。
 * 这段逻辑此前从未在任何环境真正执行过 —— W-14 的分形态拆分与
 * 「卡时收入从明细蒸发」缺陷都是靠本脚本抓出来的。
 *
 * ⚠️ 本脚本会 **写入并随后删除** 库中数据（前缀 w14verify%）。
 *    为避免误跑生产，必须显式设置开关：
 *
 *   cd apps/web && set -a && . ./.env && set +a \
 *     && SUPPLIER_BILLING_VERIFY=1 npx tsx scripts/verify-supplier-settlement.ts
 *
 * 覆盖的断言：
 *   1. 日账单 Σ明细金额 == 账单头 total_amount
 *   2. 日账单 Σ明细卡时 == total_usage_hours
 *   3. 月账单 Σ(分形态金额) == total_amount
 *   4. 月账单 Σ明细金额 == total_amount
 *   5. final_amount == total + network + management + storage
 *   6. gross_profit == 租户消费 − final_amount
 *   7. 三种形态金额分别落到正确的列（比对构造值）
 *   8. W-15：零设备机房的月租不得因「无日账单」而漏计
 *   9. W-19：所有金额恒等式按**定点字符串精确相等**判定，不留 1e-2 容差
 */
import { db } from '@/lib/db'
import { multiplyMoney, subtractMoney, sumMoney } from '@workspace/billing/money'
import {
  supplier,
  dataCenter,
  gpuCardType,
  supplierDevice,
  devicePlatformProbeSnapshot,
  supplierPricingRecord,
  tenantRegionGpuConsumptionDaily,
  supplierDatacenterInfrastructure,
  devicePlatformProbeJobRun,
  supplierContract,
  invoiceTitle,
  invoiceRequest,
  invoice,
  supplierBill,
  userStaff,
  user,
} from '@workspace/db/schema'
import { runScheduledSupplierBilling } from '@/lib/server/dataaccess/supplier/supplier-billing-scheduled'
import { invoiceOpsDataAccess } from '@/lib/server/dataaccess/supplier/gateway-invoice-ops'
import { supplierReconciliationDataAccess } from '@/lib/server/dataaccess/supplier/supplier-reconciliation'
import { suppliersDataAccess } from '@/lib/server/dataaccess/supplier/suppliers'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'

const TAG = 'w14verify'
const BILL_MONTH = '2026-08'
const DAYS = ['2026-08-01', '2026-08-02', '2026-08-03']
const CT_HOUR = `${TAG}_ct_hour`     // 卡时（billingUnit=hour）
const CT_MONTH = `${TAG}_ct_month`   // 整租（pricingMode=card_time + billingUnit=month）
const CT_SHARE = `${TAG}_ct_share`   // 分成
const DC_IDLE = `${TAG}_dc_idle`     // 零设备机房（W-15 场景）
// W-15 连带：整月无任何用量的供应商（名下只有 1 个零设备机房）。
// 月账单集合若只取「有日账单」的供应商，该供应商就拿不到机房固定月租。
const SID_FULLY_IDLE = `${TAG}_sup_idle`
const DC_FULLY_IDLE = `${TAG}_dc_fully_idle`
// W-10 连带：分成计价但**完全没有租户消费数据**的机房。
// 旧实现静默落 ¥0 且被唯一索引永久锁死。
const DC_NO_CONS = `${TAG}_dc_nocons`
const CT_NOCONS = `${TAG}_ct_nocons`

async function wipe() {
  // job_run 需先删：probe_snapshot.job_run_id 是 onDelete cascade
  await db.execute(`DELETE FROM device_platform_probe_job_run WHERE id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM supplier_pricing_record WHERE supplier_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM supplier_datacenter_infrastructure WHERE id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM tenant_region_gpu_consumption_daily WHERE id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM supplier_bill_daily_detail WHERE daily_bill_id IN
     (SELECT id FROM supplier_bill_daily WHERE supplier_id LIKE '${TAG}%')`)
  await db.execute(`DELETE FROM supplier_bill_daily WHERE supplier_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM supplier_bill_detail WHERE bill_id IN
     (SELECT id FROM supplier_bill WHERE supplier_id LIKE '${TAG}%')`)
  // W-22① 发票作废验证的残留。顺序：invoice（FK 到 request，restrict）→ request → title。
  await db.execute(`DELETE FROM entity_state_transition_log WHERE entity_type='invoice'
     AND entity_id IN (SELECT id FROM invoice WHERE supplier_id LIKE '${TAG}%')`)
  await db.execute(`DELETE FROM invoice WHERE supplier_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM invoice_request WHERE supplier_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM invoice_title WHERE supplier_id LIKE '${TAG}%'`)
  // markBillPaid 写的账单状态迁移审计（entity_id 无 FK；必须排在删账单之前，
  // 否则子查询已查不到账单 id）
  await db.execute(`DELETE FROM entity_state_transition_log WHERE entity_type='supplier_bill'
     AND entity_id IN (SELECT id FROM supplier_bill WHERE supplier_id LIKE '${TAG}%')`)
  await db.execute(`DELETE FROM supplier_bill WHERE supplier_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM supplier_device WHERE supplier_id LIKE '${TAG}%'`)
  // W-12 合同 fixture。supplier_contract.supplier_id 是 restrict FK，
  // 必须在 supplier 之前删；日明细的 contract_id 是 set null，无需先清。
  await db.execute(`DELETE FROM supplier_contract WHERE supplier_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM gpu_card_type WHERE id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM supplier_datacenter_infrastructure WHERE data_center_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM data_center WHERE supplier_id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM supplier WHERE id LIKE '${TAG}%'`)
  // markBillPaid 回归测试的 staff fixture。顺序：user_staff.auth_user_id
  // 指向 users(id) 是 set null，但显式按 users → user_staff 顺序删更清晰。
  await db.execute(`DELETE FROM user_staff WHERE id LIKE '${TAG}%'`)
  await db.execute(`DELETE FROM users WHERE id LIKE '${TAG}%'`)
}

async function seed() {
  const sid = `${TAG}_sup`
  await db.insert(supplier).values({
    id: sid, externalTenantId: `${TAG}_ext`, code: TAG, name: 'W14 验证供应商',
    shortName: 'W14', status: 'active',
  })
  const dc = `${TAG}_dc`
  await db.insert(dataCenter).values([
    { id: dc, supplierId: sid, code: `${TAG}_dc`, name: 'W14 机房', status: 'online',
      networkFeeMonthly: '0', mgmtNodeFeeMonthly: '0' },
    // W-15：合作中、有月租、但**零设备**的机房。它不会产生任何日账单，
    // 旧实现按 SUM(日账单.networkFeeDaily) 计费 → 该机房月租被整月漏掉。
    { id: DC_IDLE, supplierId: sid, code: `${TAG}_dc_idle`, name: 'W14 零设备机房',
      status: 'offline', networkFeeMonthly: '3000', mgmtNodeFeeMonthly: '200' },
  ])
  await db.insert(gpuCardType).values([
    { id: CT_HOUR, name: 'W14 卡时卡型', code: 'w14-h', manufacturer: 'NVIDIA', status: 'active' },
    { id: CT_MONTH, name: 'W14 整租卡型', code: 'w14-m', manufacturer: 'NVIDIA', status: 'active' },
    { id: CT_SHARE, name: 'W14 分成卡型', code: 'w14-s', manufacturer: 'NVIDIA', status: 'active' },
  ])
  // 基础设施费：给非零值，验证 finalAmount 组成
  await db.insert(supplierDatacenterInfrastructure).values({
    id: `${TAG}_infra`, dataCenterId: dc,
    networkConfig: { portPricePerGbpsPerMonth: '10' },
    managementConfig: { ratePerKwPerMonth: '1' },
  } as never)

  const jobRunId = `${TAG}_jobrun`
  await db.insert(devicePlatformProbeJobRun).values({
    id: jobRunId, trigger: 'manual', snapshotHour: new Date(`${DAYS[0]}T00:00:00+08:00`),
    startedAt: new Date(`${DAYS[0]}T00:00:00+08:00`), status: 'succeeded',
  } as never)

  // W-12：合同 fixture。只有「卡时」设备挂合同 —— 整租/分成走机房与卡型口径，
  // 其合同归属需要额外的产品线映射规则，本轮不臆造。
  const CONTRACT = `${TAG}_contract`
  await db.insert(supplierContract).values({
    id: CONTRACT, supplierId: sid, contractNo: `${TAG.toUpperCase()}-C-0001`,
    type: 'gpu', status: 'active', pricingMode: 'card_hour', tierBasis: 'monthly',
    cooperationMode: 'card_hour', startDate: '2026-01-01', settlementCycle: 'monthly',
  } as never)

  // 每卡型 1 台设备，各 8 卡
  const devs = [CT_HOUR, CT_MONTH, CT_SHARE].map((ct, i) => ({
    id: `${TAG}_dev${i}`, supplierId: sid, dataCenterId: dc, gpuCardTypeId: ct,
    sn: `${TAG}_sn${i}`, idcCode: `${TAG}_dc`, gpuCount: 8, lifecycleStatus: 'in_service',
    // 仅卡时那台挂合同
    contractId: i === 0 ? CONTRACT : null,
  }))
  await db.insert(supplierDevice).values(devs as never)

  // 探针快照：每天 2 个整点，每台每小时记 1 卡时 → 每日每卡型 2 卡时
  const snaps: unknown[] = []
  for (const d of DAYS) {
    for (let h = 0; h < 24; h += 4) {
      for (let i = 0; i < 3; i++) {
        snaps.push({
          id: `${TAG}_snap_${d}_${h}_${i}`, jobRunId, sn: `${TAG}_sn${i}`,
          supplierId: sid, dataCenterId: dc, supplierDeviceId: `${TAG}_dev${i}`,
          recordKind: 'crm_inventory',
          snapshotHour: new Date(`${d}T${String(h).padStart(2,'0')}:00:00+08:00`),
          probeStatus: 'online', consistencyFlag: 'ok',
          bareMetalMatched: true, proxyRentStatus: 'UnRent',
          gpuCount: 8, onlineGpuCount: 8,
        })
      }
    }
  }
  for (let i = 0; i < snaps.length; i += 200) {
    await db.insert(devicePlatformProbeSnapshot).values(snaps.slice(i, i + 200) as never)
  }

  // 价格：卡时 ¥2/h；整租 ¥3000/月；分成 30%
  await db.insert(supplierPricingRecord).values([
    { id: `${TAG}_p0`, supplierId: sid, dataCenterId: dc, gpuCardTypeId: CT_HOUR,
      pricingMode: 'card_time', billingUnit: 'hour', unitPrice: '2', unitPricePerHour: '2',
      cardsPerMachine: 8, configStatus: 'active',
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null, revenueSharePercent: null },
    { id: `${TAG}_p1`, supplierId: sid, dataCenterId: dc, gpuCardTypeId: CT_MONTH,
      pricingMode: 'card_time', billingUnit: 'month', unitPrice: '3000', unitPricePerHour: null,
      cardsPerMachine: 8, configStatus: 'active',
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null, revenueSharePercent: null },
    { id: `${TAG}_p2`, supplierId: sid, dataCenterId: dc, gpuCardTypeId: CT_SHARE,
      pricingMode: 'revenue_share', billingUnit: 'hour', unitPrice: null, unitPricePerHour: null,
      cardsPerMachine: 8, configStatus: 'active',
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null, revenueSharePercent: '30' },
  ] as never)

  // 租户消费：只给分成卡型 ¥1000/日；整租/卡时卡型也给消费以验证毛利
  const cons: unknown[] = []
  for (const d of DAYS) {
    for (const [ct, amt, ch] of [[CT_HOUR, '500', '2'], [CT_MONTH, '800', '2'], [CT_SHARE, '1000', '2']] as const) {
      for (let r = 0; r < 2; r++) {
        cons.push({
          id: `${TAG}_c_${d}_${ct}_${r}`, tenantPlatformId: `${TAG}_tenant${r}`,
          usageDate: d, usageMonth: BILL_MONTH, regionCode: 'cn-shanghai', gpuModel: ct,
          dataCenterId: dc, gpuCardTypeId: ct,
          totalConsumption: amt, balanceConsumption: amt, totalCardHours: ch, balanceCardHours: ch,
          platformIdempotencyKey: `${TAG}_k_${d}_${ct}_${r}`,
        })
      }
    }
  }
  for (let i = 0; i < cons.length; i += 200) {
    await db.insert(tenantRegionGpuConsumptionDaily).values(cons.slice(i, i + 200) as never)
  }

  // ── W-15 连带 fixture：整月零用量的供应商 ──────────────────────────
  // 该供应商名下机房 cooperationStatus 默认 'active'，且**没有任何设备**，
  // 因此当月不会产生任何 supplier_bill_daily 行。
  await db.insert(supplier).values({
    id: SID_FULLY_IDLE, externalTenantId: `${TAG}_ext_idle`, code: `${TAG}_idle`,
    name: 'W14 整月停机供应商', shortName: 'W14I', status: 'active',
  })
  await db.insert(dataCenter).values({
    id: DC_FULLY_IDLE, supplierId: SID_FULLY_IDLE, code: `${TAG}_dc_fully_idle`,
    name: 'W14 整月停机机房', status: 'offline',
    networkFeeMonthly: '3000', mgmtNodeFeeMonthly: '200',
  } as never)
  await db.insert(supplierDatacenterInfrastructure).values({
    id: `${TAG}_infra_idle`, dataCenterId: DC_FULLY_IDLE,
    networkConfig: { portPricePerGbpsPerMonth: '10' },
    managementConfig: { ratePerKwPerMonth: '1' },
    storageConfig: { billingMode: 'fixed', fixed: { monthlyFee: '50' } },
  } as never)

  // ── W-10 连带 fixture：分成计价但无消费数据的机房 ──────────────────
  // 设备有探针快照（有卡时），因此会进入出账；但没有对应的
  // tenant_region_gpu_consumption_daily 行 → 分成金额不可知。
  await db.insert(dataCenter).values({
    id: DC_NO_CONS, supplierId: sid, code: `${TAG}_dc_nocons`,
    name: 'W14 无消费数据机房', status: 'online',
    networkFeeMonthly: '0', mgmtNodeFeeMonthly: '0',
  } as never)
  await db.insert(gpuCardType).values({
    id: CT_NOCONS, name: 'W14 无消费分成卡型', code: 'w14-nc',
    manufacturer: 'NVIDIA', status: 'active',
  } as never)
  await db.insert(supplierDevice).values({
    id: `${TAG}_dev_nocons`, supplierId: sid, dataCenterId: DC_NO_CONS,
    gpuCardTypeId: CT_NOCONS, sn: `${TAG}_sn_nocons`, idcCode: `${TAG}_dc_nocons`,
    gpuCount: 8, lifecycleStatus: 'in_service', contractId: null,
  } as never)
  await db.insert(supplierPricingRecord).values({
    id: `${TAG}_p_nocons`, supplierId: sid, dataCenterId: DC_NO_CONS, gpuCardTypeId: CT_NOCONS,
    pricingMode: 'revenue_share', billingUnit: 'hour', unitPrice: null, unitPricePerHour: null,
    cardsPerMachine: 8, configStatus: 'active',
    effectiveFrom: new Date('2026-01-01'), effectiveTo: null, revenueSharePercent: '30',
  } as never)
  // 探针快照（复用主 jobRun，daily 校验只看 supplier+dc+cardType）
  // 唯一键是 (supplier_device_id, snapshot_hour)，故每设备每整点只存 1 行，
  // 卡数由 gpu_count 列承载（与主 fixture 同一口径）。
  const noconsSnaps: unknown[] = []
  for (const d of DAYS) {
    for (let h = 0; h < 24; h += 4) {
      noconsSnaps.push({
        id: `${TAG}_snap_nocons_${d}_${h}`, jobRunId,
        sn: `${TAG}_sn_nocons`, supplierId: sid, dataCenterId: DC_NO_CONS,
        supplierDeviceId: `${TAG}_dev_nocons`, recordKind: 'crm_inventory',
        snapshotHour: new Date(`${d}T${String(h).padStart(2, '0')}:00:00+08:00`),
        probeStatus: 'online', consistencyFlag: 'ok',
        bareMetalMatched: true, proxyRentStatus: 'UnRent',
        gpuCount: 8, onlineGpuCount: 8,
      })
    }
  }
  for (let i = 0; i < noconsSnaps.length; i += 200) {
    await db.insert(devicePlatformProbeSnapshot).values(noconsSnaps.slice(i, i + 200) as never)
  }
  return { sid, dc }
}

async function main() {
  await wipe()
  const { sid } = await seed()
  console.log('seed done\n')
  await assertMarkBillPaidStaffFk()

  for (const d of DAYS) {
    const r = await runScheduledSupplierBilling({ trigger: 'manual', mode: 'daily', date: d })
    console.log(`daily ${d}: ok=${r.ok} created=${r.daily?.billsCreated} ${r.error ?? ''}`)
  }
  const mr = await runScheduledSupplierBilling({ trigger: 'manual', mode: 'monthly', month: BILL_MONTH })
  console.log(`monthly ${BILL_MONTH}: ok=${mr.ok} created=${mr.monthly?.billsCreated} ${mr.error ?? ''}\n`)

  console.log('=== 月账单 ===')
  console.table(await q(`
    select id, total_amount, network_fee, management_fee, storage_fee, final_amount,
           supplier_revenue_share_amount, supplier_card_time_amount,
           supplier_whole_rent_amount, voucher_cost_amount, gross_profit, pricing_mode
    from supplier_bill where supplier_id='${sid}'`))

  console.log('=== 月明细按模式 ===')
  console.table(await q(`
    select pricing_mode, sum(amount) amt, count(*) n
    from supplier_bill_detail where bill_id in (select id from supplier_bill where supplier_id='${sid}')
    group by pricing_mode order by pricing_mode`))
}


if (process.env.SUPPLIER_BILLING_VERIFY !== '1') {
  console.error(
    '拒绝执行：本脚本会写入并删除库中数据。\n' +
      '确认目标库可写后，显式设置 SUPPLIER_BILLING_VERIFY=1 再运行。\n' +
      `当前 DATABASE_URL 指向: ${(process.env.DATABASE_URL ?? '(未设置)').replace(/:[^:@]*@/, ':***@')}`,
  )
  process.exit(1)
}

// 断言必须等 main 跑完 —— 否则会与出账并发，读到尚未生成的账单。
//
// 清理必须无条件执行：早前只在 main 开头 wipe()，于是**成功跑完会把
// w14verify% 测试数据留在库里**（文件头却写着「写入并随后删除」），
// 且断言失败/出账抛错时更是完全不清理。测试数据混进业务表后，
// 历史重复日明细那类检查的结论就不再可信。
main()
  .then(assertAll)
  .catch((e) => {
    console.error('FAIL', e)
    process.exitCode = 1
  })
  .then(async () => {
    // 失败也要清 —— 否则下一次运行的「前置清理」会掩盖这次留下的脏数据。
    // 清理本身失败必须报出来：静默吞掉等于把脏数据留给下一次运行。
    try {
      await wipe()
    } catch (e) {
      console.error('FAIL 清理测试数据失败，库中可能残留 % 数据：', e)
      process.exitCode = 1
    }
    process.exit(process.exitCode ?? 0)
  })

// ── 断言 ────────────────────────────────────────────────────────────────
/** drizzle 的 db.execute 只接受 SQL 文本（无 params 形态），统一在此收口。 */
const q = async (sql: string): Promise<Record<string, string>[]> =>
  ((await db.execute(sql)) as unknown as { rows: Record<string, string>[] }).rows

async function assertAll() {
  let pass = 0, fail = 0
  const check = (name: string, ok: boolean, extra = '') => {
    if (ok) { pass++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`) }
    else { fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`) }
  }
  const n = (v: string | null | undefined) => Number(v ?? '0')
  // W-19：规范化为 4 位定点字符串，用于精确相等断言（避免 '0' vs '0.0000' 假失败）
  const norm = (v: string | null | undefined) => sumMoney([v])
  const n0 = (v: string | null | undefined) => v ?? ''

  console.log('\n=== 合同追溯（W-12）：设备粒度挂合同，账单可归因 ===')
  {
    // 1) 出账把合同快照进日明细（设备粒度唯一）
    const linked = await q(
      `select count(*) c from supplier_bill_daily_detail d
       join supplier_bill_daily b on b.id = d.daily_bill_id
       where b.supplier_id='${TAG}_sup' and d.contract_id is not null`,
    )
    check('出账把 contract_id 快照进日明细', n(linked[0]?.c) > 0, `rows=${linked[0]?.c}`)

    // 2) 残差桶行不得被挂上合同
    const badResidual = await q(
      `select count(*) c from supplier_bill_daily_detail d
       where d.device_id is null and d.contract_id is not null`,
    )
    check('残差桶行不挂合同（无设备的行无法确定合同）', n(badResidual[0]?.c) === 0,
      `rows=${badResidual[0]?.c}`)

    // 3) 对账页能按合同归因，且合同号能查到
    const repW12 = await supplierReconciliationDataAccess.report(BILL_MONTH)
    const attr = repW12.rows.flatMap((r) => r.contractAttributions)
    check('对账报告列出合同归因', attr.length > 0, `contracts=${attr.length}`)
    check('归因带出合同号（W-12③ 可回答「对应哪份合同」）',
      attr.length > 0 && attr.every((a) => !!a.contractNo),
      attr[0]?.contractNo ?? '无')

    // 4) 恒等式：已归因 + 未归因 == 应结金额（不能凭空多算或少算）
    const identityOk = repW12.rows.every(
      (r) => sumMoney([r.attributedAmount, r.unattributedAmount]) === r.finalAmount,
    )
    check('已归因 + 未归因 == 应结金额', identityOk,
      repW12.rows.map((r) => `${r.attributedAmount}+${r.unattributedAmount} vs ${r.finalAmount}`).join(' | '))

    // 5) 归因金额必须真的来自日明细，不能凭空出现
    const detailSum = sumMoney(
      (await q(
        `select d.amount from supplier_bill_daily_detail d
         join supplier_bill_daily b on b.id = d.daily_bill_id
         where b.supplier_id='${TAG}_sup' and d.contract_id is not null`,
      )).map((r) => r.amount),
    )
    check('归因金额 == 日明细中带合同的金额合计',
      sumMoney(repW12.rows.map((r) => r.attributedAmount)) === detailSum,
      `${sumMoney(repW12.rows.map((r) => r.attributedAmount))} vs ${detailSum}`)
  }

  console.log('\n=== 平台侧对账（W-25）：金额自洽 + 能查出人为注入的差异 ===')
  {
    const rep = await supplierReconciliationDataAccess.report(BILL_MONTH)
    check('对账覆盖到本轮账单', rep.totals.billCount > 0, `bills=${rep.totals.billCount}`)

    // 正常出账产物不应报任何差异 —— 对账页只有「可信的告警」才有价值，
    // 满屏假阳性会让人直接忽略整页。
    const cleanIssues = rep.rows.flatMap((r) => r.issues)
    check('刚出账的账单零差异（无假阳性）', cleanIssues.length === 0,
      cleanIssues.slice(0, 3).join(' | ') || 'issues=0')

    // 毛利恒等式：Σ(租户消费) − final_amount == gross_profit
    const gpOk = rep.billChecks.every(
      (c) => c.grossProfit === null || c.grossProfit === c.expectedGrossProfit,
    )
    check('毛利恒等式逐账单成立', gpOk)

    // 供应商维度汇总 == 账单维度汇总（防止聚合层自己算错）
    const repSum = sumMoney(rep.rows.map((r) => r.finalAmount))
    const billSum = sumMoney(rep.billChecks.map((c) => c.finalAmount))
    check('供应商维度汇总 == 账单维度汇总', repSum === billSum, `${repSum} vs ${billSum}`)

    // 注入差异：把某张账单的总金额改坏，对账必须能查出来。
    // 用零影响列的临时改动：篡改 total_amount 会同时影响别的断言，故改 network_fee。
    const victim = rep.billChecks[0]
    if (!victim) {
      check('前置：有可篡改的账单', false)
    } else {
      const before = (
        await q(`select network_fee from supplier_bill where id='${victim.billId}'`)
      )[0]?.network_fee
      await db.execute(
        `UPDATE supplier_bill SET network_fee = network_fee + 1.0000 WHERE id='${victim.billId}'`,
      )
      const rep2 = await supplierReconciliationDataAccess.report(BILL_MONTH)
      const found = rep2.rows.some((r) =>
        r.issues.some((i) => i.includes('应结应为') && i.includes(victim.billId.slice(0, 8))),
      )
      check('篡改 network_fee 后对账报出「应结应为」差异', found,
        found ? rep2.rows.find((r) => r.issues.length > 0)?.issues[0] : '未检出')

      // 还原，确认可逆
      await db.execute(
        `UPDATE supplier_bill SET network_fee = '${before}' WHERE id='${victim.billId}'`,
      )
      const rep3 = await supplierReconciliationDataAccess.report(BILL_MONTH)
      check('还原后差异消失', rep3.totals.issueCount === 0,
        `issueCount=${rep3.totals.issueCount}`)
    }
  }

  console.log('\n=== 发票作废（W-22①）===')
  const sid = `${TAG}_sup`
  const billId = n0(
    (await q(`select id from supplier_bill where supplier_id='${sid}' order by bill_month desc limit 1`))[0]
      ?.id,
  )
  if (!billId) {
    check('前置：本供应商已出账', false, `supplier_bill 无记录（billMonth=${BILL_MONTH}）`)
  } else {
    const titleId = `${TAG}_title`
    await db.insert(invoiceTitle).values({
      id: titleId,
      supplierId: sid,
      type: 'company',
      invoiceType: 'vat_special',
      companyName: 'W22 作废验证主体',
      taxNo: '91310000TEST00001X',
      isDefault: true,
    })

    const reqId = `${TAG}_req`
    await db.insert(invoiceRequest).values({
      id: reqId,
      supplierId: sid,
      billMonthlyId: billId,
      invoiceTitleId: titleId,
      invoiceType: 'vat_special',
      requestAmount: '100.0000',
      status: 'approved',
    })

    // 走真实开票路径：正常发票的 void_status 为 normal，作为作废前置。
    const invId = `${TAG}_inv`
    await db.insert(invoice).values({
      id: invId,
      invoiceRequestId: reqId,
      supplierId: sid,
      invoiceNo: `${TAG.toUpperCase()}-VOID-0001`,
      invoiceType: 'vat_special',
      totalAmount: '100.0000',
      taxAmount: '5.6604',
      amountWithoutTax: '94.3396',
      taxRate: '0.0600',
      issuedAt: new Date(),
      voidStatus: 'normal',
    })
    await db.execute(`UPDATE invoice_request SET status='issued' WHERE id='${reqId}'`)

    // 账单置为 paid，用于验证「作废发票不联动收款状态」。
    await db.execute(`UPDATE supplier_bill SET status='paid' WHERE id='${billId}'`)

    // 1) 重复作废必须在 SQL 守卫处被挡住
    let dupCode = ''
    try {
      await invoiceOpsDataAccess.voidInvoice(invId, '   ', { operatorStaffId: null })
    } catch (e) {
      dupCode = (e as { code?: string }).code ?? ''
    }
    check('空原因被拒', dupCode === 'BAD_REQUEST', `code=${dupCode}`)

    await invoiceOpsDataAccess.voidInvoice(invId, '开票金额有误，需重新开具', {
      operatorStaffId: null,
    })
    const [voided] = await q(`select void_status, void_reason, voided_at from invoice where id='${invId}'`)
    check('作废写入 void_status/原因/时间',
      voided?.void_status === 'voided'
      && voided?.void_reason === '开票金额有误，需重新开具'
      && !!voided?.voided_at,
      `void_status=${voided?.void_status}`)

    const [reqAfter] = await q(`select status from invoice_request where id='${reqId}'`)
    check('申请单退回 approved（可重开）', reqAfter?.status === 'approved', `status=${reqAfter?.status}`)

    const [billAfter] = await q(`select status from supplier_bill where id='${billId}'`)
    check('作废不联动账单收款状态（仍为 paid）',
      billAfter?.status === 'paid', `bill.status=${billAfter?.status}`)

    const [logRow] = await q(
      `select reason_code, from_state, to_state from entity_state_transition_log
       where entity_type='invoice' and entity_id='${invId}'`,
    )
    check('写入作废审计日志',
      logRow?.reason_code === 'INVOICE_VOIDED'
      && logRow?.from_state === 'normal'
      && logRow?.to_state === 'voided',
      `reason_code=${logRow?.reason_code}`)

    // 2) 重复作废必须报冲突，且不会二次改写 voided_at
    const beforeAt = voided?.voided_at
    let dup2 = ''
    try {
      await invoiceOpsDataAccess.voidInvoice(invId, '再作废一次', { operatorStaffId: null })
    } catch (e) {
      dup2 = (e as { code?: string }).code ?? ''
    }
    const [voided2] = await q(`select voided_at, void_reason from invoice where id='${invId}'`)
    check('重复作废被拒且不覆盖原记录',
      dup2 === 'CONFLICT'
      && voided2?.voided_at === beforeAt
      && voided2?.void_reason === '开票金额有误，需重新开具',
      `code=${dup2}`)

    // 3) 部分唯一索引：作废后同一申请可补开，但**未作废时**仍禁止重复开票。
    const invId2 = `${TAG}_inv2`
    let reissueCode = ''
    try {
      await db.insert(invoice).values({
        id: invId2,
        invoiceRequestId: reqId,
        supplierId: sid,
        invoiceNo: `${TAG.toUpperCase()}-VOID-0002`,
        invoiceType: 'vat_special',
        totalAmount: '100.0000',
        taxAmount: '5.6604',
        amountWithoutTax: '94.3396',
        taxRate: '0.0600',
        issuedAt: new Date(),
        voidStatus: 'normal',
      })
    } catch (e) {
      reissueCode = String(
        (e as { code?: string; cause?: { code?: string } }).code
        ?? (e as { cause?: { code?: string } }).cause?.code
        ?? '',
      )
    }
    check('作废后同一申请可补开（部分唯一索引生效）', reissueCode !== '23505',
      `err=${reissueCode || '无'}`)

    // 4) 补开的新发票同样占用唯一键：再建第三张必须被 23505 拦下
    let dup3 = ''
    try {
      await db.insert(invoice).values({
        id: `${TAG}_inv3`,
        invoiceRequestId: reqId,
        supplierId: sid,
        invoiceNo: `${TAG.toUpperCase()}-VOID-0003`,
        invoiceType: 'vat_special',
        totalAmount: '100.0000',
        taxAmount: '5.6604',
        amountWithoutTax: '94.3396',
        taxRate: '0.0600',
        issuedAt: new Date(),
        voidStatus: 'normal',
      })
    } catch (e) {
      dup3 = String(
        (e as { code?: string; cause?: { code?: string } }).code
        ?? (e as { cause?: { code?: string } }).cause?.code
        ?? '',
      )
    }
    check('有效发票仍禁止重复开票（23505）', dup3 === '23505', `err=${dup3 || '无'}`)
  }

  console.log('\n=== 开票状态守卫（P1-15）：pending 账单不得开票 ===')
  {
    // 注意：上面的 W-22 用例已把主账单置为 'paid'，因此这里必须显式设定状态，
    // 且两个用例各用一个 invoice_request —— 开票成功会把申请翻成 'issued'。
    const billId2 = n0(
      (await q(`select id from supplier_bill where supplier_id='w14verify_sup'
                and bill_month='${BILL_MONTH}'`))[0]?.id,
    )
    const titleId2 = n0(
      (await q(`select id from invoice_title where supplier_id='w14verify_sup' limit 1`))[0]?.id,
    )
    const finalAmount2 = norm(
      (await q(`select final_amount from supplier_bill where id='${billId2}'`))[0]?.final_amount,
    )
    // 同一账单只允许一个「活跃」发票申请（invoice_request_active_bill_uk），
    // W-22 用例留下的申请仍是活跃态，先置为 rejected 才能建本节自己的申请。
    await db.execute(
      `update invoice_request set status='rejected' where id='${TAG}_req'`,
    )
    const mkReq = async (rid: string) => {
      await db.insert(invoiceRequest).values({
        id: rid, supplierId: `${TAG}_sup`, billMonthlyId: billId2,
        invoiceTitleId: titleId2, invoiceType: 'vat_special',
        requestAmount: finalAmount2, status: 'approved',
      } as never)
    }

    // 1) pending 账单：应被状态守卫拒绝
    await db.execute(`update supplier_bill set status='pending' where id='${billId2}'`)
    await mkReq(`${TAG}_req_pending`)
    let guardErr = ''
    try {
      await invoiceOpsDataAccess.issueInvoice({
        requestId: `${TAG}_req_pending`, invoiceNo: `${TAG}-PENDING`,
        taxRate: 0.13, pdfUrl: 'https://x/y.pdf',
      })
    } catch (e) {
      guardErr = (e as { code?: string }).code ?? ''
    }
    check('pending 账单被拒绝开票（此前 bill.status 查出却未使用）',
      guardErr === 'BAD_REQUEST', `code=${guardErr || '无（竟成功开票）'}`)

    // 2) confirmed 账单：应放行，证明守卫没有误伤正常流程
    // 上一条被守卫拒绝的申请仍停在 approved，需先置 rejected（受活跃唯一索引约束）
    await db.execute(
      `update invoice_request set status='rejected' where id='${TAG}_req_pending'`,
    )
    await db.execute(`update supplier_bill set status='confirmed' where id='${billId2}'`)
    await mkReq(`${TAG}_req_confirmed`)
    let issuedOk = false, issuedErr = ''
    try {
      await invoiceOpsDataAccess.issueInvoice({
        requestId: `${TAG}_req_confirmed`, invoiceNo: `${TAG}-CONFIRMED`,
        taxRate: 0.13, pdfUrl: 'https://x/y.pdf',
      })
      issuedOk = true
    } catch (e) {
      issuedErr = (e as Error).message.split('\n')[0] ?? ''
    }
    check('confirmed 账单可正常开票（守卫未误伤正常流程）', issuedOk, issuedErr)

    // 还原，避免影响后续断言
    await db.execute(`update supplier_bill set status='paid' where id='${billId2}'`)
  }

  console.log('\n=== 日账单：明细金额合计 == 账单头 total_amount ===')
  for (const r of await q(`
    select d.usage_date::text dt, d.total_amount, coalesce(sum(dd.amount),0) detail_sum
    from supplier_bill_daily d
    left join supplier_bill_daily_detail dd on dd.daily_bill_id = d.id
    where d.supplier_id='w14verify_sup' group by d.usage_date, d.total_amount order by dt`)) {
    check(`日 ${(r.dt ?? '').slice(0, 10)}`, Math.abs(n(r.total_amount) - n(r.detail_sum)) < 0.01,
      `头=${r.total_amount} 明细=${r.detail_sum}`)
  }

  console.log('\n=== 日账单：明细用量合计 == total_usage_hours ===')
  for (const r of await q(`
    select d.usage_date::text dt, d.total_usage_hours, coalesce(sum(dd.usage_hours),0) h
    from supplier_bill_daily d
    left join supplier_bill_daily_detail dd on dd.daily_bill_id = d.id
    where d.supplier_id='w14verify_sup' group by d.usage_date, d.total_usage_hours order by dt`)) {
    check(`日 ${(r.dt ?? '').slice(0, 10)}`, Math.abs(n(r.total_usage_hours) - n(r.h)) < 0.01,
      `头=${r.total_usage_hours} 明细=${r.h}`)
  }

  // 显式限定账期：不能靠 `bills[0]`，因为同一供应商可能存在其他账期的账单
  // （如 W-8 付款回归测试用的 2026-07），无序取首行会读到错误的账单。
  const bills = await q(
    `select * from supplier_bill where supplier_id='w14verify_sup' and bill_month='${BILL_MONTH}'`,
  )
  const b = bills[0]
  if (!b) {
    console.error('  FAIL  月账单未生成，后续断言无法进行')
    process.exitCode = 1
    return
  }

  console.log('\n=== 月账单：3 个分形态金额之和 == total_amount ===')
  const split = sumMoney([
    b.supplier_revenue_share_amount,
    b.supplier_card_time_amount,
    b.supplier_whole_rent_amount,
  ])
  // W-19：两侧现在都是定点字符串，恒等式必须是**精确相等**。
  // 旧的 < 0.01 容差会放过 1e-4 ~ 1e-2 的真实金额错位。
  check('分形态合计（精确相等）', split === norm(b.total_amount),
    `${split} vs ${norm(b.total_amount)}`)

  console.log('\n=== 月账单：月明细金额合计 == total_amount ===')
  const dsumRows = await q(`select coalesce(sum(amount),0) s from supplier_bill_detail where bill_id='${b.id}'`)
  const dsum = dsumRows[0]
  if (!dsum) {
    console.error('  FAIL  月明细查询无返回')
    process.exitCode = 1
    return
  }
  check('明细合计（精确相等）', norm(dsum.s) === norm(b.total_amount), `${norm(dsum.s)} vs ${norm(b.total_amount)}`)

  // W-19 核心：明细行自身必须自洽。用存下来的列重算 —— 审计/对账正是这么做的。
  // 旧实现带着全精度 unitCost 算 amount 却只存 4dp 的 unit_cost，该恒等式
  // 每天差 0.0015（旧值 24.1935 vs 24.1920），且 <0.01 容差完全看不出来。
  console.log('\n=== W-19：明细行自洽 unit_cost × usage_hours == amount ===')
  // 只对**卡时/整租行**断言：分成的残差桶行 unit_cost=0、usage_hours=0 而
  // amount=消费×比例，按设计就不满足该恒等式（它压根不是卡时计价的产物）。
  // 卡时行的 unit_cost 恒非 0，用它作为筛选条件。
  const selfConsistent = await q(`
    select count(*)::int bad from supplier_bill_daily_detail d
    join supplier_bill_daily b on b.id = d.daily_bill_id
    where b.supplier_id='w14verify_sup' and d.unit_cost <> '0.0000'
      and round(d.unit_cost * d.usage_hours, 4) <> d.amount`)
  check('卡时行 unit_cost × usage_hours == amount（精确）', n(selfConsistent[0]!.bad) === 0,
    `不自洽行数 = ${selfConsistent[0]!.bad}`)

  console.log('\n=== 月账单：final_amount == total + network + mgmt + storage ===')
  const fexp = sumMoney([b.total_amount, b.network_fee, b.management_fee, b.storage_fee])
  check('final 组成（精确相等）', fexp === norm(b.final_amount), `${fexp} vs ${norm(b.final_amount)}`)

  // W-15：零设备机房（networkFeeMonthly=3000 / mgmtNodeFeeMonthly=200）没有任何日账单，
  // 旧实现按 SUM(日账单.networkFeeDaily) 计 → 这 3200 会被整月漏掉、平台少收。
  // 月费是固定月租，与当天有没有设备开机无关，必须按机房月度配置全额计入。
  console.log('\n=== W-15：零设备机房月租不得漏计 ===')
  const idleDc = await q(`
    select count(*)::int c from supplier_bill_daily where data_center_id = '${DC_IDLE}'`)
  check('零设备机房确实没有日账单', n(idleDc[0]!.c) === 0, `日账单 ${idleDc[0]!.c} 条`)
  check('network_fee = 3000（零设备机房月租全额）', Math.abs(n(b.network_fee) - 3000) < 0.01, b.network_fee)
  check('management_fee = 200（零设备机房月租全额）', Math.abs(n(b.management_fee) - 200) < 0.01, b.management_fee)
  // 若回退到旧的按日求和口径，这两个值会是 0
  check('月租未被按日求和稀释（旧口径会是 0）', n(b.network_fee) > 0 && n(b.management_fee) > 0,
    `network=${b.network_fee} management=${b.management_fee}`)

  console.log('\n=== 月账单：gross_profit == 租户消费 − final_amount ===')
  const consRows = await q(`
    select coalesce(sum(total_consumption),0) c from tenant_region_gpu_consumption_daily
    where data_center_id='w14verify_dc' and usage_date >= '2026-08-01' and usage_date < '2026-09-01'`)
  const cons = consRows[0]
  if (!cons) {
    console.error('  FAIL  租户消费查询无返回')
    process.exitCode = 1
    return
  }
  const gexp = subtractMoney(cons.c, b.final_amount)
  check('毛利（精确相等）', gexp === norm(b.gross_profit),
    `消费=${norm(cons.c)} 期望=${gexp} 实际=${norm(b.gross_profit)}`)

  console.log('\n=== 分形态金额落位正确性（构造值比对）===')
  // 卡时卡型 3天×48h×¥2 = 288；整租卡型 3天×48h×0.504 = 72.5805；分成 30%×2000×3 = 1800
  check('卡时(hour) = 288', norm(b.supplier_card_time_amount) === '288.0000', norm(b.supplier_card_time_amount))
  // 48h × 0.5040（unit_cost 列精度量化后）= 24.1920/日 × 3 = 72.5760
  check('整租(month) = 72.5760', norm(b.supplier_whole_rent_amount) === '72.5760', norm(b.supplier_whole_rent_amount))
  check('分成 = 1800', norm(b.supplier_revenue_share_amount) === '1800.0000', norm(b.supplier_revenue_share_amount))
  check('voucher_cost_amount = 0（无数据源）', n(b.voucher_cost_amount) === 0, b.voucher_cost_amount)

  console.log('\n=== 整月零用量供应商仍须按固定月租出账（W-15 连带）===')
  {
    const [idleBill] = await q(
      `select network_fee, management_fee, storage_fee, total_amount, final_amount, status
       from supplier_bill where supplier_id='${SID_FULLY_IDLE}' and bill_month='${BILL_MONTH}'`,
    )
    check('整月停机的供应商仍生成月账单（此前因无日账单而完全不出账）',
      !!idleBill, idleBill ? '' : '无账单')
    check('其固定机房月租被完整计入',
      norm(idleBill?.network_fee) === '3000.0000' && norm(idleBill?.management_fee) === '200.0000',
      `network=${norm(idleBill?.network_fee)} mgmt=${norm(idleBill?.management_fee)}`)
    check('其存储固定费被计入', norm(idleBill?.storage_fee) === '50.0000',
      norm(idleBill?.storage_fee))
    check('无用量时 total=0 而 final=机房费',
      norm(idleBill?.total_amount) === '0.0000' && norm(idleBill?.final_amount) === '3250.0000',
      `total=${norm(idleBill?.total_amount)} final=${norm(idleBill?.final_amount)}`)
  }

  console.log('\n=== 分成缺消费数据不得静默落 ¥0（W-10 连带）===')
  {
    const badRows = await q(
      `select d.id, d.total_amount from supplier_bill_daily d
       where d.data_center_id='${DC_NO_CONS}'`,
    )
    check('缺消费数据的机房未落库任何日账单（避免固化错误的 ¥0）',
      badRows.length === 0, `rows=${badRows.length}`)

    const badDetails = await q(
      `select dd.id, dd.amount from supplier_bill_daily_detail dd
       join supplier_bill_daily d on d.id = dd.daily_bill_id
       where d.data_center_id='${DC_NO_CONS}'`,
    )
    check('也没有落库 ¥0 明细', badDetails.length === 0, `rows=${badDetails.length}`)

    // 同一批次里其他机房必须照常出账（不能因为一个机房缺数据就整批失败）
    const okRows = await q(
      `select count(*) c from supplier_bill_daily
       where supplier_id='${TAG}_sup' and data_center_id='${TAG}_dc'`,
    )
    check('同供应商其他机房不受影响，仍正常出账', n(okRows[0]?.c) > 0, `rows=${okRows[0]?.c}`)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

/**
 * W-8 / P0-3 回归：`markBillPaid` 的 `operatorStaffId` 外键。
 *
 * 此前 router 直接把 better-auth 的 `ctx.user.id` 传进
 * `entity_state_transition_log.operator_staff_id`（外键指向 `user_staff.id`），
 * 而两者是**不同 id 空间**（`user_staff.id` 是独立生成的 cuid，经
 * `user_staff.auth_user_id` 关联）→ 线上「标记已付款」100% 触发 FK 23503
 * 并回滚整个付款事务。
 *
 * 之前 39 项验证之所以没抓到：本脚本只调用过 `voidInvoice(..., null)`，
 * 而 `null` 天然满足外键，从不触发违约。
 */
async function assertMarkBillPaidStaffFk() {
  let pass = 0, fail = 0
  const check = (name: string, ok: boolean, extra = '') => {
    if (ok) { pass++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`) }
    else { fail++; console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`) }
  }

  console.log('\n=== 付款审计外键（W-8 / P0-3）：operator_staff_id 必须是 user_staff.id ===')
  const staffId = `${TAG}_staff`
  const authUserId = `${TAG}_authuser`
  // 先建真实 auth 用户：user_staff.auth_user_id 是指向 users.id 的外键，
  // 且这样才能走生产同款「authUserId → user_staff.id」翻译路径
  // （而不是 resolveStaffIdForAuthUser 末尾的 id 直配兜底）。
  await db.insert(user).values({
    id: authUserId,
    name: 'W14 验证财务',
    email: `${TAG}@example.test`,
    emailVerified: true,
  } as never)
  // 与生产一致：user_staff.id 独立生成，auth 用户通过 auth_user_id 列关联
  await db.insert(userStaff).values({
    id: staffId,
    displayName: 'W14 验证财务',
    mobile: '13900000000',
    status: 'active',
    roles: ['admin'],
    authUserId,
  } as never)

  const resolved = await staffDataAccess.resolveStaffIdForAuthUser({ id: authUserId })
  check('auth user id 能翻译成 user_staff.id', resolved === staffId, `${authUserId} -> ${resolved}`)

  // 独立账单（用另一个账期，避免影响 W-25 的状态计数）
  const billId = `${TAG}_paidbill`
  await db.insert(supplierBill).values({
    id: billId,
    supplierId: `${TAG}_sup`,
    billMonth: '2026-07',
    cooperationMode: 'idle_time',
    pricingMode: 'card_time',
    billingUnit: 'hour',
    status: 'confirmed',
    totalUsageHours: '10.0000',
    totalAmount: '100.0000',
    networkFee: '0.0000',
    managementFee: '0.0000',
    storageFee: '0.0000',
    finalAmount: '100.0000',
    dueDate: '2026-08-15',
  } as never)

  let paidOk = false, paidErr = ''
  try {
    await suppliersDataAccess.markBillPaid(billId, {
      operatorStaffId: resolved,
      paidBy: '财务张三',
      paymentReference: 'RRN-W14',
      adjustmentReason: null,
    })
    paidOk = true
  } catch (e) {
    paidErr = (e as Error).message.split('\n')[0] ?? ''
  }
  check('markBillPaid 用解析后的 staff id 可成功（非 FK 违约）', paidOk, paidErr)

  const after = await q(`select status from supplier_bill where id='${billId}'`)
  check('账单确实落到 paid 终态', after[0]?.status === 'paid', `status=${after[0]?.status}`)

  const audit = await q(
    `select operator_staff_id from entity_state_transition_log
     where entity_type='supplier_bill' and entity_id='${billId}' and to_state='paid'`,
  )
  check('审计记的是 user_staff.id 而非 auth user id',
    audit[0]?.operator_staff_id === staffId, `operator_staff_id=${audit[0]?.operator_staff_id}`)

  // 反向锁定：把 auth user id 直接塞进去必须失败 —— 防止回归到旧写法
  await db.execute(`update supplier_bill set status='confirmed', paid_at=null, paid_by=null
     where id='${billId}'`)
  let rawRejected = false
  try {
    await suppliersDataAccess.markBillPaid(billId, {
      operatorStaffId: authUserId,
      paidBy: '财务李四',
      paymentReference: 'RRN-RAW',
      adjustmentReason: null,
    })
  } catch {
    rawRejected = true
  }
  check('直接传 auth user id 会被外键拒绝（证明上一条不是侥幸通过）', rawRejected)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}
