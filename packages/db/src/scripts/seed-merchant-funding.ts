/**
 * 商户资金域种子脚本（DEC-F13）
 *
 * 交互模式：
 *   DATABASE_URL=postgresql://... npx tsx packages/db/src/scripts/seed-merchant-funding.ts
 *
 * 前置条件：
 *   - 数据库 migration 已完成（0028 已建表）
 *
 * 落两样东西：
 *   1. merchant_commission_tier 的 T1/T2/T3 三档佣金阶梯
 *      阶梯区间边界 ¥10,000 / ¥100,000 为**已确认的暂定值**（见设计文档 §附录），
 *      商务后续变更请改本脚本重跑，不要直接改库。
 *   2. merchant_finance_config 的全局充值准入阈值，缺省 0 = 不阻断
 *
 * 为什么要做成脚本而不是写进 migration：
 *   - 种子是**业务数据**（商务可调），schema 才是 migration 的职责；
 *     把可调数据固化进迁移，改一次边界就得再出一个迁移。
 *   - 迁移文件由 drizzle-kit 生成，不应手工编辑。
 *   - 本脚本全量 upsert，可重复执行，新环境 / 存量环境结果一致。
 *
 * 幂等：tier_code 与 config_key 都有唯一约束，冲突时按脚本内的值覆盖，
 *       不会产生重复行，也不会因重跑而报唯一键冲突。
 */

import { createId } from "@paralleldrive/cuid2"
import { and, eq, isNotNull, notExists, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import {
  merchantCommissionTier,
  merchantFinanceConfig,
  merchantPayoutAccount,
  supplier,
} from "../schema"

// =============================================================================
// 配置 — 阶梯边界为已确认的暂定值，商务变更改这里
// =============================================================================

/** 佣金计提基数 = 商户月度账单 gross_profit 落在哪个区间 */
const COMMISSION_TIERS = [
  {
    tierCode: "T1",
    tierName: "T1 基础档",
    monthlyBasisMin: "0",
    monthlyBasisMax: "10000",
    commissionRate: "0.05",
    sortOrder: 1,
  },
  {
    tierCode: "T2",
    tierName: "T2 成长档",
    monthlyBasisMin: "10000",
    monthlyBasisMax: "100000",
    commissionRate: "0.10",
    sortOrder: 2,
  },
  {
    /** 最高档上界留空 = 无上限 */
    tierCode: "T3",
    tierName: "T3 战略档",
    monthlyBasisMin: "100000",
    monthlyBasisMax: null,
    commissionRate: "0.20",
    sortOrder: 3,
  },
] as const

/** 全局充值准入阈值：0 = 不阻断（缺省值，显式落库以便运营在后台可见可改） */
const RECHARGE_BLOCK_THRESHOLD = "0"
const RECHARGE_BLOCK_REMARK = "全局默认：0=不阻断；商户可在商户级覆盖（NULL=继承本值）"

/**
 * 供应商收款账户回填（设计文档 §3.5）
 *
 * supplier 的 4 个平铺银行字段（bank_name / bank_account / bank_branch_name /
 * bank_branch_address）迁入 merchant_payout_account(owner_type='supplier')，
 * 平铺字段标 @deprecated 保留读路径一个版本后 DROP。
 *
 * 两处必须小心：
 *   1. `account_name` 在 supplier 原表**没有**，从 contact_person 预填；
 *   2. 一律落 status='pending_review' —— 平铺数据从未经过户名与营业执照主体名
 *      核对，直接置 active 会让未核实的账户进入打款路径。
 *
 * 幂等：merchant_payout_account 没有 (owner_type, owner_id) 唯一约束（只有
 * active+default 的偏索引），所以靠「该供应商还没有任何收款账户」来防重复，
 * 重跑不会插出第二条。
 */
const SUPPLIER_ACCOUNT_REMARK =
  "由 supplier 平铺银行字段回填（未核对户名，须人工补录核对后方可打款）"

// =============================================================================
// 主逻辑
// =============================================================================

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error("缺少 DATABASE_URL，无法执行种子脚本")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle(pool)

  try {
    // effective_from 是 date 列，传 Date 会被 drizzle 判为不可赋值，用 ISO 日期串
    const effectiveFrom = new Date().toISOString().slice(0, 10)

    for (const tier of COMMISSION_TIERS) {
      await db
        .insert(merchantCommissionTier)
        .values({
          id: createId(),
          tierCode: tier.tierCode,
          tierName: tier.tierName,
          monthlyBasisMin: tier.monthlyBasisMin,
          monthlyBasisMax: tier.monthlyBasisMax,
          commissionRate: tier.commissionRate,
          sortOrder: tier.sortOrder,
          status: "active",
          effectiveFrom,
        })
        .onConflictDoUpdate({
          target: merchantCommissionTier.tierCode,
          set: {
            tierName: tier.tierName,
            monthlyBasisMin: tier.monthlyBasisMin,
            monthlyBasisMax: tier.monthlyBasisMax,
            commissionRate: tier.commissionRate,
            sortOrder: tier.sortOrder,
            updatedAt: new Date(),
          },
        })
      console.log(`✓ 佣金阶梯 ${tier.tierCode} 计提基数 ${tier.commissionRate}`)
    }

    await db
      .insert(merchantFinanceConfig)
      .values({
        configKey: "recharge_block_threshold",
        numericValue: RECHARGE_BLOCK_THRESHOLD,
        remark: RECHARGE_BLOCK_REMARK,
      })
      // 缺失才落缺省：运营在后台调过的值不能被脚本打回 0，
      // 也不该被改写 updatedAt（那会抹掉「谁改的、什么时候改的」）。
      .onConflictDoNothing()

    const [cfg] = await db
      .select()
      .from(merchantFinanceConfig)
      .where(eq(merchantFinanceConfig.configKey, "recharge_block_threshold"))
      .limit(1)
    console.log(
      `✓ 全局充值准入阈值 = ${cfg?.numericValue ?? "(未落库)"}（0 = 不阻断；已存在的值不覆盖）`,
    )

    await backfillSupplierPayoutAccounts(db)

    console.log("\n资金域种子完成：T1/T2/T3 三档 + 全局充值阈值 + 供应商账户回填")
  } finally {
    await pool.end()
  }
}

/** supplier 平铺银行字段 → merchant_payout_account(owner_type='supplier') */
async function backfillSupplierPayoutAccounts(db: ReturnType<typeof drizzle>) {
  const rows = await db
    .select({
      id: supplier.id,
      bankName: supplier.bankName,
      bankAccount: supplier.bankAccount,
      bankBranchName: supplier.bankBranchName,
      contactPerson: supplier.contactPerson,
    })
    .from(supplier)
    .where(
      and(
        isNotNull(supplier.bankAccount),
        isNotNull(supplier.bankName),
        // 该供应商尚无任何收款账户 → 回填；已有则跳过（重跑安全）
        notExists(
          db
            .select({ one: sql`1` })
            .from(merchantPayoutAccount)
            .where(
              and(
                eq(merchantPayoutAccount.ownerType, "supplier"),
                eq(merchantPayoutAccount.ownerId, supplier.id),
              ),
            ),
        ),
      ),
    )

  if (rows.length === 0) {
    console.log("· 供应商收款账户回填：无需回填")
    return
  }

  await db.insert(merchantPayoutAccount).values(
    rows.map((r) => ({
      id: createId(),
      ownerType: "supplier" as const,
      ownerId: r.id,
      // account_name 原表没有，从联系人预填
      accountName: r.contactPerson ?? "",
      accountNo: r.bankAccount ?? "",
      bankName: r.bankName ?? "",
      bankBranch: r.bankBranchName,
      accountType: "enterprise" as const,
      currency: "CNY",
      // 平铺数据未经户名核对，一律 pending_review，不得直接可打款
      status: "pending_review" as const,
      isDefault: false,
      remark: SUPPLIER_ACCOUNT_REMARK,
    })),
  )

  console.log(`✓ 供应商收款账户回填 ${rows.length} 条（均置 pending_review，待人工核对）`)
}

main().catch((err) => {
  console.error("资金域种子失败：", err)
  process.exit(1)
})
