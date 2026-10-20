import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  merchant,
  merchantAccount,
  merchantFinanceConfig,
  merchantFinanceConfigAuditLog,
} from '@workspace/db'
import type { PaginatedResult } from '@workspace/billing'

/**
 * 商户充值阻断阈值配置（DEC-F7）
 *
 * 三态语义（NULL 有业务含义，不可"顺手"改成 0）：
 *   - 全局配置 `recharge_block_threshold`
 *   - 商户 `merchant.recharge_block_threshold`
 *     · NULL  → 继承全局
 *     · > 0   → 商户覆盖
 *     · = 0   → **显式永不阻断**（即使全局 > 0）
 *
 * 改动阈值会直接影响所有商户能否继续接单，因此：
 *   - 一律写审计（旧值/新值/操作人）
 *   - 降阈值时返回受影响商户数，让运营在 UI 上确认
 */

export const RECHARGE_BLOCK_THRESHOLD_KEY = 'recharge_block_threshold'

/** 单次最多影响的商户数上限提示用；不截断，只提示 */
export interface GlobalThresholdImpact {
  /** 原本会被阻断、调整后不再阻断的商户数 */
  unblocked: number
  /** 原本不阻断、调整后会被阻断的商户数 */
  newlyBlocked: number
  /** 继承全局（阈值为 NULL）的商户数 */
  inheriting: number
}

type StaffRef = { id: string; name: string }

function toNum(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const merchantFinanceConfigDataAccess = {
  /** 读取全部财务配置（当前只有阈值一项，结构上支持后续扩展） */
  async listConfigs(): Promise<
    Array<{ configKey: string; numericValue: number; remark: string | null; updatedAt: string }>
  > {
    const rows = await db
      .select({
        configKey: merchantFinanceConfig.configKey,
        numericValue: merchantFinanceConfig.numericValue,
        remark: merchantFinanceConfig.remark,
        updatedAt: merchantFinanceConfig.updatedAt,
      })
      .from(merchantFinanceConfig)
      .orderBy(asc(merchantFinanceConfig.configKey))

    return rows.map((r) => ({
      configKey: r.configKey,
      numericValue: toNum(r.numericValue),
      remark: r.remark,
      updatedAt: r.updatedAt!.toISOString(),
    }))
  },

  async getNumericValue(configKey: string): Promise<number | null> {
    const [row] = await db
      .select({ v: merchantFinanceConfig.numericValue })
      .from(merchantFinanceConfig)
      .where(eq(merchantFinanceConfig.configKey, configKey))
      .limit(1)
    return row ? toNum(row.v) : null
  },

  /**
   * 预览全局阈值调整的真实影响面。
   *
   * 只数「有覆盖值的商户」是不够的：真正决定阻断与否的是可用额，
   * 所以这里取所有商户的实时 available 合计，用与准入闸门
   * （checkMerchantRechargeAdmission）**完全相同**的判定逻辑算 before/after，
   * 保证 UI 上的数字和用户实际遇到的 402 一致。
   */
  async previewThresholdChange(newThreshold: number): Promise<GlobalThresholdImpact> {
    const global = (await this.getNumericValue(RECHARGE_BLOCK_THRESHOLD_KEY)) ?? 0

    // 取所有商户的阈值覆盖值 + 实时可用额
    const rows = await db
      .select({
        id: merchant.id,
        override: merchantAccount.rechargeBlockThreshold,
        available: sql<string>`coalesce((
          select sum(b.available) from merchant_account_pool_balance b
          where b.merchant_id = ${merchant.id}
        ), 0)::text`,
      })
      .from(merchant)
      .leftJoin(merchantAccount, eq(merchantAccount.merchantId, merchant.id))

    let unblocked = 0
    let newlyBlocked = 0
    let inheriting = 0

    for (const r of rows) {
      const override = r.override === null ? null : toNum(r.override)
      if (override === null) {
        inheriting++
        // 继承全局：阈值调整会直接改变该商户的阻断结果
        const available = Number(r.available)
        const before = global > 0 && available < global
        const after = newThreshold > 0 && available < newThreshold
        if (before && !after) unblocked++
        if (!before && after) newlyBlocked++
        continue
      }
      if (override === 0) continue // 显式永不阻断，两种阈值下都不受影响
      // 商户覆盖 > 0：全局阈值变更对其无影响
    }

    return { unblocked, newlyBlocked, inheriting }
  },

  /**
   * 写入全局阈值并留审计。
   * upsert 语义：键不存在则插入，重复配置不会报错。
   */
  async setNumericValue(
    configKey: string,
    value: number,
    staff: StaffRef,
    remark?: string,
  ): Promise<{ oldValue: number | null; newValue: number }> {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('阈值必须为不小于 0 的数字')
    }

    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ v: merchantFinanceConfig.numericValue })
        .from(merchantFinanceConfig)
        .where(eq(merchantFinanceConfig.configKey, configKey))
        .for('update')
        .limit(1)

      const oldValue = existing ? toNum(existing.v) : null

      await tx
        .insert(merchantFinanceConfig)
        .values({
          configKey,
          numericValue: String(value),
          remark: remark ?? null,
          updatedByStaffId: staff.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: merchantFinanceConfig.configKey,
          set: {
            numericValue: String(value),
            remark: remark ?? null,
            updatedByStaffId: staff.id,
            updatedAt: new Date(),
          },
        })

      await tx.insert(merchantFinanceConfigAuditLog).values({
        id: crypto.randomUUID(),
        configKey,
        oldValue: oldValue === null ? null : String(oldValue),
        newValue: String(value),
        operatorStaffId: staff.id,
        operatorName: staff.name,
        occurredAt: new Date(),
        remark: remark ?? null,
      })

      return { oldValue, newValue: value }
    })
  },

  /** 配置变更审计（DB 级分页） */
  async listConfigAudit(
    configKey?: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedResult<{
    id: string
    configKey: string
    oldValue: number | null
    newValue: number
    operatorName: string
    occurredAt: string
    remark: string | null
  }>> {
    const p = Math.max(1, page)
    const size = Math.min(100, Math.max(1, pageSize))
    const conds: SQL[] = []
    if (configKey) conds.push(eq(merchantFinanceConfigAuditLog.configKey, configKey))
    const where = conds.length ? and(...conds) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(merchantFinanceConfigAuditLog)
      .where(where)

    const rows = await db
      .select({
        id: merchantFinanceConfigAuditLog.id,
        configKey: merchantFinanceConfigAuditLog.configKey,
        oldValue: merchantFinanceConfigAuditLog.oldValue,
        newValue: merchantFinanceConfigAuditLog.newValue,
        operatorName: merchantFinanceConfigAuditLog.operatorName,
        occurredAt: merchantFinanceConfigAuditLog.occurredAt,
        remark: merchantFinanceConfigAuditLog.remark,
      })
      .from(merchantFinanceConfigAuditLog)
      .where(where)
      .orderBy(desc(merchantFinanceConfigAuditLog.occurredAt))
      .limit(size)
      .offset((p - 1) * size)

    return {
      items: rows.map((r) => ({
        id: r.id,
        configKey: r.configKey,
        oldValue: r.oldValue === null ? null : toNum(r.oldValue),
        newValue: toNum(r.newValue),
        operatorName: r.operatorName,
        occurredAt: r.occurredAt.toISOString(),
        remark: r.remark,
      })),
      total: Number(totalRow?.total ?? 0),
      page: p,
      pageSize: size,
    }
  },
}
