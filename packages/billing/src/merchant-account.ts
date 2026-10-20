/**
 * 商户账户原语 — 设计依据 apps/merchant/content/design/merchant-module-review-and-design.md §3
 *
 * 与 tenant 账户（balance.ts）共用一套账本语义，但额外保证三件事：
 *   1. **逐池实时值**：merchant_account_pool_balance 一行一池，与流水同事务写入
 *      → 对账第 0 环可直接读实时值，无需聚合全部流水
 *   2. **幂等**：merchant_account_ledger.idempotency_key 唯一约束
 *      → 跨系统重放（超时/重试/网络分区）只可能产生一笔流水
 *   3. **对账基线**：snapshotMerchantAccount 落 pre_recon 快照，
 *      runMerchantAccountSelfCheck 校验「期初 + Σ流水 == 期末实时值」
 *
 * 所有写操作必须走 postMerchantLedger，禁止绕过它直接改余额 —— 否则实时值与流水发散。
 */

import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  MERCHANT_ACCOUNT_POOLS,
  billingTenant,
  merchantAccount,
  merchantFinanceConfig,
  merchantAccountLedger,
  merchantAccountPool,
  merchantAccountPoolBalance,
  merchantAccountSnapshot,
  type MerchantAccountLedgerRefType,
  type MerchantAccountPool,
  type MerchantAccountSnapshotTrigger,
} from "@workspace/db"
import type { PaginatedResult } from "./types"
import {
  MONEY_EPSILON,
  RECHARGE_BLOCK_CODE_FALLBACK,
  RECHARGE_BLOCK_CONFIG_KEY,
  computePoolMovement,
  isRechargeBlockedByBalance,
  InsufficientMerchantBalanceError,
  IdempotencyConflictError,
} from "./merchant-account-math"

type Db = PostgresJsDatabase<Record<string, never>> | any

/** PG unique_violation。drizzle 把底层错误包在 `.cause`，需沿因果链查找 */
function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    const err = cur as { code?: unknown; cause?: unknown }
    if (err.code === "23505") return true
    cur = err.cause
  }
  return false
}

/** 金额比较容差：numeric(15,4) 下 0.0001 以内视为相等 */

/**
 * 流水对 available 的带符号影响：credit 为正、debit 为负。
 * 冻结/解冻（effect=reserved）对 available 的净影响同样是 signed amount，
 * 因为冻结是 available→reserved、解冻是 reserved→available 的搬运。
 */
const signedSql = sql<string>`case when ${merchantAccountLedger.direction} = 'debit' then -${merchantAccountLedger.amount} else ${merchantAccountLedger.amount} end`

/** 流水对 reserved 的带符号影响：只有冻结/解冻才动 reserved，方向与 available 相反 */
const reservedSignedSql = sql<string>`case when ${merchantAccountLedger.effect} = 'reserved' then -case when ${merchantAccountLedger.direction} = 'debit' then -${merchantAccountLedger.amount} else ${merchantAccountLedger.amount} end else 0 end`

export interface MerchantAccountRow {
  id: string
  merchantId: string
  cashBalance: string
  voucherBalance: string
  creditLimit: string
  creditUsed: string
  frozen: string
  lowBalanceThreshold: string
  autoRechargeEnabled: boolean
  autoRechargeAmount: string
  currency: string
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface MerchantPoolBalanceRow {
  id: string
  merchantId: string
  pool: string
  available: string
  reserved: string
  total: string
  version: number
  lastLedgerId: string | null
  lastLedgerAt: Date | null
  updatedAt: Date
}

export interface MerchantLedgerRow {
  id: string
  merchantId: string
  direction: string
  pool: string
  amount: string
  balanceBefore: string
  balanceAfter: string
  refType: string
  refId: string | null
  idempotencyKey: string
  traceId: string | null
  externalUserRef: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  occurredAt: Date
}

export interface MerchantAccountSnapshotRow {
  id: string
  merchantId: string
  trigger: string
  snapshotAt: Date
  cashAvailable: string
  cashReserved: string
  cashTotal: string
  voucherAvailable: string
  voucherReserved: string
  voucherTotal: string
  creditAvailable: string
  creditReserved: string
  creditTotal: string
  creditLimit: string
  ledgerCount: number
  consumeAmount: string
  createdAt: Date
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const newId = (): string => crypto.randomUUID()

// ---------------------------------------------------------------------------
// 账户初始化
// ---------------------------------------------------------------------------

/**
 * 获取或创建商户账户，并保证三个池的实时值行存在。
 * 幂等：并发调用只会成功创建一次（unique index merchant_id + pool）。
 */
export async function getOrCreateMerchantAccount(
  db: Db,
  merchantId: string,
): Promise<MerchantAccountRow> {
  const existing = await getMerchantAccount(db, merchantId)
  if (existing) return existing

  await db
    .insert(merchantAccount)
    .values({ id: newId(), merchantId, currency: "CNY" })
    .onConflictDoNothing()

  // 逐池实时值行：缺失则补齐（已存在的池不覆盖，保留实时值）
  for (const pool of MERCHANT_ACCOUNT_POOLS) {
    await db
      .insert(merchantAccountPoolBalance)
      .values({ id: newId(), merchantId, pool })
      .onConflictDoNothing()
  }

  const account = await getMerchantAccount(db, merchantId)
  if (!account) {
    throw new Error(`Failed to create merchant_account for merchant ${merchantId}`)
  }
  return account
}

export async function getMerchantAccount(
  db: Db,
  merchantId: string,
): Promise<MerchantAccountRow | undefined> {
  const [row] = await db
    .select()
    .from(merchantAccount)
    .where(eq(merchantAccount.merchantId, merchantId))
    .limit(1)

  return row as MerchantAccountRow | undefined
}

/** 读取逐池实时值（对账与 UED 的数据源） */
export async function listMerchantPoolBalances(
  db: Db,
  merchantId: string,
): Promise<MerchantPoolBalanceRow[]> {
  const rows = await db
    .select()
    .from(merchantAccountPoolBalance)
    .where(eq(merchantAccountPoolBalance.merchantId, merchantId))

  return rows as MerchantPoolBalanceRow[]
}

/** 扣减优先级：券（临期优先）→ 现金 → 授信 */
export async function listMerchantPoolPriorities(
  db: Db,
): Promise<{ pool: string; priority: number }[]> {
  const rows: { pool: string; priority: number }[] = await db
    .select({ pool: merchantAccountPool.pool, priority: merchantAccountPool.priority })
    .from(merchantAccountPool)

  const fallback: { pool: string; priority: number }[] = MERCHANT_ACCOUNT_POOLS.map(
    (pool, idx) => ({ pool, priority: (idx + 1) * 10 }),
  )
  if (rows.length === 0) return fallback

  const map = new Map<string, number>(rows.map((r) => [r.pool, r.priority]))
  return fallback
    .map(({ pool }) => ({ pool, priority: map.get(pool) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.priority - b.priority)
}

// ---------------------------------------------------------------------------
// 唯一写入口：postMerchantLedger
// ---------------------------------------------------------------------------

export type PostLedgerPoolEffect = "available" | "reserved"

export interface PostMerchantLedgerInput {
  merchantId: string
  pool: MerchantAccountPool
  /** credit=入账 / debit=出账；amount 恒为正 */
  direction: "credit" | "debit"
  /** 正数金额 */
  amount: number
  /**
   * 作用于 available 还是 reserved（默认 available）。
   *
   * - `available`（发券/购券/授信/消费等）：available ± amount，total 同步 ± amount。
   * - `reserved`（提交任务冻结 / 结算解冻）：**只在 available 与 reserved 之间搬运**，
   *   total 恒定不变。
   *     · direction=debit  → 冻结：available −= amount，reserved += amount
   *     · direction=credit → 解冻：available += amount，reserved −= amount
   */
  effect?: PostLedgerPoolEffect
  refType: MerchantAccountLedgerRefType
  refId?: string | null
  /** 幂等键：调用方提供的业务唯一键，跨系统重放安全 */
  idempotencyKey: string
  traceId?: string | null
  externalUserRef?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  occurredAt?: Date
  /**
   * 允许 available 变负（授信池垫付场景）。
   * 默认 false：额度不足直接抛错，绝不写流水。
   */
  allowNegative?: boolean
}

export interface PostMerchantLedgerResult {
  ledger: MerchantLedgerRow
  poolBalance: MerchantPoolBalanceRow
  account: MerchantAccountRow
  /** true = 命中幂等键，返回首次结果，未重复记账 */
  replay: boolean
}

// 记账数学与错误类型集中在 merchant-account-math，这里转出以保持单一导入口
export {
  MONEY_EPSILON,
  InsufficientMerchantBalanceError,
  IdempotencyConflictError,
  computePoolMovement,
  signedAmount,
  signedReservedAmount,
} from "./merchant-account-math"
export type { PoolEffect, PoolMovement } from "./merchant-account-math"

/**
 * 写入一笔账户流水，并**同事务**更新逐池实时值与账户汇总。
 *
 * 事务内顺序：
 *   1. 幂等键命中 → 直接回放首次结果
 *   2. SELECT ... FOR UPDATE 锁住该 (merchant_id, pool) 实时值行
 *   3. 计算 available / reserved / total 的新实时值
 *   4. INSERT merchant_account_ledger（带前后实时值快照）
 *   5. UPDATE merchant_account_pool_balance（实时值 + version +1 + lastLedgerId）
 *   6. UPDATE merchant_account（汇总三池）
 */
export async function postMerchantLedger(
  db: Db,
  input: PostMerchantLedgerInput,
  /**
   * 可选的外部事务句柄。
   *
   * 传入时本函数**加入该事务而不新开事务**——`settleFrozenMerchantBalance`
   * 需要「释放冻结 + 核销扣减」两笔流水严格同生共死：只成功一半会让
   * reserved 归零而 total 未减（或反之），对账第 0 环立刻失真。
   * 不传时行为与原来完全一致（自己开事务）。
   */
  tx?: any,
): Promise<PostMerchantLedgerResult> {
  const amount = num(input.amount)
  if (!(amount > 0)) {
    throw new Error(`postMerchantLedger: amount 必须为正数，收到 ${input.amount}`)
  }

  const effect: PostLedgerPoolEffect = input.effect ?? "available"
  const occurredAt = input.occurredAt ?? new Date()
  const signedAmount = input.direction === "credit" ? amount : -amount

  /** 命中幂等键时组装回放结果（正常路径与并发兜底共用同一份口径） */
  const buildReplay = async (runner: any, ledger: MerchantLedgerRow) => {
    // 幂等键复用校验：同 key 必须是同一笔业务，否则宁可报错也不能回放错账
    const sameRequest =
      ledger.merchantId === input.merchantId &&
      ledger.pool === input.pool &&
      ledger.direction === input.direction &&
      num(ledger.amount) === amount &&
      ledger.refType === input.refType &&
      (ledger.refId ?? null) === (input.refId ?? null)
    if (!sameRequest) {
      throw new IdempotencyConflictError(input.idempotencyKey)
    }

    const [poolRow] = await runner
      .select()
      .from(merchantAccountPoolBalance)
      .where(
        and(
          eq(merchantAccountPoolBalance.merchantId, input.merchantId),
          eq(merchantAccountPoolBalance.pool, input.pool),
        ),
      )
      .limit(1)
    const [accountRow] = await runner
      .select()
      .from(merchantAccount)
      .where(eq(merchantAccount.merchantId, input.merchantId))
      .limit(1)

    return {
      ledger,
      poolBalance: poolRow as MerchantPoolBalanceRow,
      account: accountRow as MerchantAccountRow,
      replay: true,
    }
  }

  const run = async (runner: any) => {
    // 1) 幂等：命中则回放，不重复记账
    const [existingLedger] = await runner
      .select()
      .from(merchantAccountLedger)
      .where(eq(merchantAccountLedger.idempotencyKey, input.idempotencyKey))
      .limit(1)

    if (existingLedger) {
      return buildReplay(runner, existingLedger as MerchantLedgerRow)
    }

    // 2) 锁住逐池实时值行（不存在则补齐后重试一次）
    let [poolRow] = await runner
      .select()
      .from(merchantAccountPoolBalance)
      .where(
        and(
          eq(merchantAccountPoolBalance.merchantId, input.merchantId),
          eq(merchantAccountPoolBalance.pool, input.pool),
        ),
      )
      .for("update")
      .limit(1)

    // 2b) 锁后复查幂等键（双重检查锁定）
    //
    // step 1 的检查发生在**拿锁之前**，并发下多路会同时判定「未命中」并一起等锁；
    // 先到者提交后，后到者拿到锁时账已被改动，此时若不复查就会拿着过期的池余额
    // 去算账，表现为「冻结额不足」这类**假失败**（甚至把真实成功的业务报成失败）。
    // 锁内的复查才是正确性的关键：它让并发重投收敛为「恰好一次」。
    const [ledgerAfterLock] = await runner
      .select()
      .from(merchantAccountLedger)
      .where(eq(merchantAccountLedger.idempotencyKey, input.idempotencyKey))
      .limit(1)
    if (ledgerAfterLock) {
      return buildReplay(runner, ledgerAfterLock as MerchantLedgerRow)
    }

    if (!poolRow) {
      await runner
        .insert(merchantAccount)
        .values({ id: newId(), merchantId: input.merchantId, currency: "CNY" })
        .onConflictDoNothing()
      await runner
        .insert(merchantAccountPoolBalance)
        .values({ id: newId(), merchantId: input.merchantId, pool: input.pool })
        .onConflictDoNothing()
      ;[poolRow] = await runner
        .select()
        .from(merchantAccountPoolBalance)
        .where(
          and(
            eq(merchantAccountPoolBalance.merchantId, input.merchantId),
            eq(merchantAccountPoolBalance.pool, input.pool),
          ),
        )
        .for("update")
        .limit(1)
    }

    if (!poolRow) {
      throw new Error(
        `postMerchantLedger: 无法为商户 ${input.merchantId} 建立 ${input.pool} 池实时值行`,
      )
    }

    const balance = poolRow as MerchantPoolBalanceRow
    // 2.1) 交由纯函数推导三侧实时值并做额度校验
    //      （额度不足直接抛错 → 事务回滚，绝不写流水）
    const movement = computePoolMovement(
      input.merchantId,
      input.pool,
      {
        available: num(balance.available),
        reserved: num(balance.reserved),
        total: num(balance.total),
      },
      {
        direction: input.direction,
        amount,
        effect,
        allowNegative: input.allowNegative,
      },
    )

    // 4) 流水（带前后实时值快照：balance* 记录被作用的那一侧）
    const ledgerId = newId()
    const [ledgerRow] = await runner
      .insert(merchantAccountLedger)
      .values({
        id: ledgerId,
        merchantId: input.merchantId,
        direction: input.direction,
        pool: input.pool,
        amount: String(amount),
        effect: movement.effect,
        availableBefore: String(movement.availableBefore),
        availableAfter: String(movement.availableAfter),
        reservedBefore: String(movement.reservedBefore),
        reservedAfter: String(movement.reservedAfter),
        balanceBefore: String(movement.balanceBefore),
        balanceAfter: String(movement.balanceAfter),
        refType: input.refType,
        refId: input.refId ?? null,
        idempotencyKey: input.idempotencyKey,
        traceId: input.traceId ?? null,
        externalUserRef: input.externalUserRef ?? null,
        description: input.description ?? null,
        metadata: input.metadata ?? null,
        occurredAt,
      })
      .returning()

    // 5) 逐池实时值
    const [updatedPool] = await runner
      .update(merchantAccountPoolBalance)
      .set({
        available: String(movement.availableAfter),
        reserved: String(movement.reservedAfter),
        total: String(movement.totalAfter),
        version: balance.version + 1,
        lastLedgerId: ledgerId,
        lastLedgerAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(merchantAccountPoolBalance.id, balance.id))
      .returning()

    // 6) 账户汇总（完全由三池实时值推导，保证与逐池实时值一致）
    const allPools = (await runner
      .select()
      .from(merchantAccountPoolBalance)
      .where(eq(merchantAccountPoolBalance.merchantId, input.merchantId))) as MerchantPoolBalanceRow[]

    const byPool = new Map(allPools.map((r) => [r.pool, r]))
    const cash = byPool.get("cash")
    const voucher = byPool.get("voucher")
    const credit = byPool.get("credit")

    const [accountRow] = await runner
      .select()
      .from(merchantAccount)
      .where(eq(merchantAccount.merchantId, input.merchantId))
      .limit(1)
    const account = accountRow as MerchantAccountRow

    const frozenTotal = allPools.reduce((sum, r) => sum + num(r.reserved), 0)
    // 授信上限是配置项（不参与实时值推导）；已用授信 = 上限 − 授信池可用
    const creditLimitValue = num(account?.creditLimit)
    const creditAvailable = num(credit?.available)

    const [updatedAccount] = await runner
      .update(merchantAccount)
      .set({
        cashBalance: String(num(cash?.available)),
        voucherBalance: String(num(voucher?.available)),
        creditUsed: String(Math.max(0, creditLimitValue - creditAvailable)),
        frozen: String(frozenTotal),
        version: sql`${merchantAccount.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(merchantAccount.merchantId, input.merchantId))
      .returning()

    return {
      ledger: ledgerRow as MerchantLedgerRow,
      poolBalance: updatedPool as MerchantPoolBalanceRow,
      account: updatedAccount as MerchantAccountRow,
      replay: false,
    }
  }

  // 外部事务：加入调用方事务；否则自己开一个
  if (tx) return run(tx)

  try {
    return await db.transaction(run)
  } catch (e) {
    // 并发兜底：N 路同时重投时，step 1 的幂等检查都在对方提交**之前**完成，
    // 于是全部判定「未命中」并一起走到 insert，只有一路能成功，其余撞
    // idempotency_key 唯一约束。这不是失败，而是同一笔业务的回放 —— 重读后
    // 按回放返回，业务方拿到的仍是「恰好入账一次」。
    //
    // 仅限自开事务：传入外部事务时本次失败已使该事务 abort，必须原样抛出
    // 由调用方整体回滚，绝不能在这里「补记」造成两笔。
    if (!isUniqueViolation(e)) throw e

    const [existingLedger] = await db
      .select()
      .from(merchantAccountLedger)
      .where(eq(merchantAccountLedger.idempotencyKey, input.idempotencyKey))
      .limit(1)
    if (!existingLedger) throw e

    return buildReplay(db, existingLedger as MerchantLedgerRow)
  }
}

// ---------------------------------------------------------------------------
// 流水查询（DB 级分页）
// ---------------------------------------------------------------------------

export interface ListMerchantLedgerParams {
  merchantId: string
  pool?: MerchantAccountPool
  direction?: "credit" | "debit"
  refType?: MerchantAccountLedgerRefType
  externalUserRef?: string
  traceId?: string
  occurredFrom?: Date
  occurredTo?: Date
  page?: number
  pageSize?: number
}

/** 账户流水列表：count + limit/offset（禁止前端分页） */
export async function listMerchantLedger(
  db: Db,
  params: ListMerchantLedgerParams,
): Promise<PaginatedResult<MerchantLedgerRow>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))

  const conditions: SQL[] = [eq(merchantAccountLedger.merchantId, params.merchantId)]
  if (params.pool) conditions.push(eq(merchantAccountLedger.pool, params.pool))
  if (params.direction) conditions.push(eq(merchantAccountLedger.direction, params.direction))
  if (params.refType) conditions.push(eq(merchantAccountLedger.refType, params.refType))
  if (params.externalUserRef) {
    conditions.push(eq(merchantAccountLedger.externalUserRef, params.externalUserRef))
  }
  if (params.traceId) conditions.push(eq(merchantAccountLedger.traceId, params.traceId))
  if (params.occurredFrom) {
    conditions.push(gte(merchantAccountLedger.occurredAt, params.occurredFrom))
  }
  if (params.occurredTo) {
    conditions.push(lte(merchantAccountLedger.occurredAt, params.occurredTo))
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(merchantAccountLedger)
    .where(where)

  const rows = await db
    .select()
    .from(merchantAccountLedger)
    .where(where)
    .orderBy(desc(merchantAccountLedger.occurredAt), desc(merchantAccountLedger.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows as MerchantLedgerRow[],
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
  }
}

// ---------------------------------------------------------------------------
// 对账基线快照
// ---------------------------------------------------------------------------

/**
 * 落一份账户快照（读当前实时值，不做任何写操作）。
 * trigger=pre_recon 时由对账任务在区间计算前调用，保证期初与实时值严格对齐。
 */
export async function snapshotMerchantAccount(
  db: Db,
  params: {
    merchantId: string
    trigger: MerchantAccountSnapshotTrigger
    snapshotAt?: Date
  },
): Promise<MerchantAccountSnapshotRow> {
  const snapshotAt = params.snapshotAt ?? new Date()

  return db.transaction(async (tx: any) => {
    const pools = (await tx
      .select()
      .from(merchantAccountPoolBalance)
      .where(eq(merchantAccountPoolBalance.merchantId, params.merchantId))) as MerchantPoolBalanceRow[]

    const byPool = new Map(pools.map((r) => [r.pool, r]))
    const [accountRow] = await tx
      .select()
      .from(merchantAccount)
      .where(eq(merchantAccount.merchantId, params.merchantId))
      .limit(1)

    const agg = await tx
      .select({
        ledgerCount: count(),
        consumeAmount: sql<string>`coalesce(sum(case when ${merchantAccountLedger.refType} = 'consume' then ${signedSql} else 0 end), 0)::text`,
      })
      .from(merchantAccountLedger)
      .where(eq(merchantAccountLedger.merchantId, params.merchantId))

    const pool = (name: MerchantAccountPool): MerchantPoolBalanceRow | undefined =>
      byPool.get(name)

    const [row] = await tx
      .insert(merchantAccountSnapshot)
      .values({
        id: newId(),
        merchantId: params.merchantId,
        trigger: params.trigger,
        snapshotAt,
        cashAvailable: String(num(pool("cash")?.available)),
        cashReserved: String(num(pool("cash")?.reserved)),
        cashTotal: String(num(pool("cash")?.total)),
        voucherAvailable: String(num(pool("voucher")?.available)),
        voucherReserved: String(num(pool("voucher")?.reserved)),
        voucherTotal: String(num(pool("voucher")?.total)),
        creditAvailable: String(num(pool("credit")?.available)),
        creditReserved: String(num(pool("credit")?.reserved)),
        creditTotal: String(num(pool("credit")?.total)),
        creditLimit: String(num((accountRow as MerchantAccountRow | undefined)?.creditLimit)),
        ledgerCount: Number(agg[0]?.ledgerCount ?? 0),
        consumeAmount: String(agg[0]?.consumeAmount ?? "0"),
      })
      .onConflictDoNothing()
      .returning()

    if (row) return row as MerchantAccountSnapshotRow

    const [existing] = await tx
      .select()
      .from(merchantAccountSnapshot)
      .where(
        and(
          eq(merchantAccountSnapshot.merchantId, params.merchantId),
          eq(merchantAccountSnapshot.snapshotAt, snapshotAt),
        ),
      )
      .limit(1)

    return existing as MerchantAccountSnapshotRow
  })
}

export async function getMerchantAccountSnapshot(
  db: Db,
  params: { merchantId: string; snapshotAt: Date },
): Promise<MerchantAccountSnapshotRow | undefined> {
  const [row] = await db
    .select()
    .from(merchantAccountSnapshot)
    .where(
      and(
        eq(merchantAccountSnapshot.merchantId, params.merchantId),
        eq(merchantAccountSnapshot.snapshotAt, params.snapshotAt),
      ),
    )
    .limit(1)

  return row as MerchantAccountSnapshotRow | undefined
}

/** 列出某商户的最近快照（UED 展示 + 漂移定位） */
export async function listMerchantAccountSnapshots(
  db: Db,
  params: { merchantId: string; limit?: number },
): Promise<MerchantAccountSnapshotRow[]> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 24))
  const rows = await db
    .select()
    .from(merchantAccountSnapshot)
    .where(eq(merchantAccountSnapshot.merchantId, params.merchantId))
    .orderBy(desc(merchantAccountSnapshot.snapshotAt))
    .limit(limit)

  return rows as MerchantAccountSnapshotRow[]
}

// ---------------------------------------------------------------------------
// 对账第 0 环：实时值自检
// ---------------------------------------------------------------------------

/** 把快照行的三池三侧摊平成 pool → { available, reserved, total } */
function snapshotBuckets(row: MerchantAccountSnapshotRow): Record<
  string,
  { available: number; reserved: number; total: number }
> {
  return {
    cash: {
      available: num(row.cashAvailable),
      reserved: num(row.cashReserved),
      total: num(row.cashTotal),
    },
    voucher: {
      available: num(row.voucherAvailable),
      reserved: num(row.voucherReserved),
      total: num(row.voucherTotal),
    },
    credit: {
      available: num(row.creditAvailable),
      reserved: num(row.creditReserved),
      total: num(row.creditTotal),
    },
  }
}

export interface MerchantAccountDriftRow {
  pool: string
  /** 哪一侧漂移：available / reserved / total */
  bucket: "available" | "reserved" | "total"
  beginValue: number
  endValue: number
  ledgerDelta: number
  /** 期末实时值 − 期初快照 − Σ区间流水；非 0 即账实漂移 */
  drift: number
}

/**
 * 校验「期初快照 + Σ区间流水 == 期末实时值」。
 *
 * - 返回空数组 = 平台内部账实一致，可进入三方对账（设计 §5.6）
 * - 返回非空 = 账实漂移（P0 资金事故），drift 为漂移金额
 *
 * 不依赖商户，可在日终对账前对全平台跑一次。
 */
export async function runMerchantAccountSelfCheck(
  db: Db,
  params: {
    merchantId: string
    /** 期初快照时间点（通常取 pre_recon 快照的 snapshotAt） */
    beginSnapshotAt: Date
    /** 期末时间点（含），默认当前时刻 */
    endAt?: Date
  },
): Promise<MerchantAccountDriftRow[]> {
  const endAt = params.endAt ?? new Date()

  const [snapshot] = await db
    .select()
    .from(merchantAccountSnapshot)
    .where(
      and(
        eq(merchantAccountSnapshot.merchantId, params.merchantId),
        eq(merchantAccountSnapshot.snapshotAt, params.beginSnapshotAt),
      ),
    )
    .limit(1)

  if (!snapshot) {
    throw new Error(
      `runMerchantAccountSelfCheck: 商户 ${params.merchantId} 在 ${params.beginSnapshotAt.toISOString()} 没有基线快照`,
    )
  }

  const snap = snapshot as MerchantAccountSnapshotRow

  // 期初：按池取三侧基线（不再固定读 cash_*
  const begin = snapshotBuckets(snap)

  const poolRows = (await db
    .select()
    .from(merchantAccountPoolBalance)
    .where(eq(merchantAccountPoolBalance.merchantId, params.merchantId))) as MerchantPoolBalanceRow[]

  // 区间流水：一次取三侧的带符号增量
  const ledgerSums = (await db
    .select({
      pool: merchantAccountLedger.pool,
      availableDelta: sql<string>`coalesce(sum(${signedSql}), 0)::text`,
      reservedDelta: sql<string>`coalesce(sum(${reservedSignedSql}), 0)::text`,
      totalDelta: sql<string>`coalesce(sum(case when ${merchantAccountLedger.effect} = 'available' then ${signedSql} else 0 end), 0)::text`,
    })
    .from(merchantAccountLedger)
    .where(
      and(
        eq(merchantAccountLedger.merchantId, params.merchantId),
        gte(merchantAccountLedger.occurredAt, params.beginSnapshotAt),
        lte(merchantAccountLedger.occurredAt, endAt),
      ),
    )
    .groupBy(merchantAccountLedger.pool)) as {
    pool: string
    availableDelta: string
    reservedDelta: string
    totalDelta: string
  }[]

  const deltaByPool = new Map(
    ledgerSums.map((r) => [
      r.pool,
      {
        available: num(r.availableDelta),
        reserved: num(r.reservedDelta),
        total: num(r.totalDelta),
      },
    ]),
  )

  const drifts: MerchantAccountDriftRow[] = []
  for (const row of poolRows) {
    const base = begin[row.pool] ?? { available: 0, reserved: 0, total: 0 }
    const delta = deltaByPool.get(row.pool) ?? { available: 0, reserved: 0, total: 0 }
    const end = {
      available: num(row.available),
      reserved: num(row.reserved),
      total: num(row.total),
    }

    for (const bucket of ["available", "reserved", "total"] as const) {
      const drift = end[bucket] - base[bucket] - delta[bucket]
      if (Math.abs(drift) > MONEY_EPSILON) {
        drifts.push({
          pool: row.pool,
          bucket,
          beginValue: base[bucket],
          endValue: end[bucket],
          ledgerDelta: delta[bucket],
          drift,
        })
      }
    }
  }

  return drifts
}

/**
 * 实时值与流水的累计一致性（无需快照，任何时刻可跑）：
 *   pool_balance.total == Σ ledger.amount（按 merchant_id + pool）
 */
export async function listMerchantPoolTotalMismatch(
  db: Db,
  params: { merchantId: string },
): Promise<{ pool: string; poolTotal: number; ledgerTotal: number; diff: number }[]> {
  const poolRows = (await db
    .select()
    .from(merchantAccountPoolBalance)
    .where(eq(merchantAccountPoolBalance.merchantId, params.merchantId))) as MerchantPoolBalanceRow[]

  const ledgerSums: { pool: string; total: string }[] = await db
    .select({
      pool: merchantAccountLedger.pool,
      // total 只被 effect='available' 的流水改变；冻结/解冻在两个桶之间搬运，total 不变
      total: sql<string>`coalesce(sum(case when ${merchantAccountLedger.effect} = 'available' then ${signedSql} else 0 end), 0)::text`,
    })
    .from(merchantAccountLedger)
    .where(eq(merchantAccountLedger.merchantId, params.merchantId))
    .groupBy(merchantAccountLedger.pool)

  const ledgerByPool = new Map<string, number>(
    ledgerSums.map((r) => [r.pool, num(r.total)]),
  )
  const mismatches: { pool: string; poolTotal: number; ledgerTotal: number; diff: number }[] = []

  for (const row of poolRows) {
    const poolTotal = num(row.total)
    const ledgerTotal = ledgerByPool.get(row.pool) ?? 0
    const diff = poolTotal - ledgerTotal
    if (Math.abs(diff) > MONEY_EPSILON) {
      mismatches.push({ pool: row.pool, poolTotal, ledgerTotal, diff })
    }
  }

  return mismatches
}

/** 商户账户可用总额（UED KPI 口径）：Σ 池 available（授信池已按可用计） */
export async function getMerchantAvailableTotal(
  db: Db,
  merchantId: string,
): Promise<number> {
  const pools = await listMerchantPoolBalances(db, merchantId)
  return pools.reduce((sum, p) => sum + num(p.available), 0)
}

/** 批量取多商户的可用总额（运营大盘用） */
export async function listMerchantAvailableTotals(
  db: Db,
  merchantIds: string[],
): Promise<Map<string, number>> {
  if (merchantIds.length === 0) return new Map()

  const rows: { merchantId: string; available: string }[] = await db
    .select({
      merchantId: merchantAccountPoolBalance.merchantId,
      available: sql<string>`coalesce(sum(${merchantAccountPoolBalance.available}), 0)::text`,
    })
    .from(merchantAccountPoolBalance)
    .where(inArray(merchantAccountPoolBalance.merchantId, merchantIds))
    .groupBy(merchantAccountPoolBalance.merchantId)

  return new Map<string, number>(rows.map((r) => [r.merchantId, num(r.available)]))
}

// ---------------------------------------------------------------------------
// 充值准入（DEC-F4）
// ---------------------------------------------------------------------------

/** 读取全局充值准入阈值；未配置返回 null（由调用方落到代码兜底） */
export async function getGlobalRechargeBlockThreshold(db: Db): Promise<number | null> {
  const [row] = await db
    .select({ v: merchantFinanceConfig.numericValue })
    .from(merchantFinanceConfig)
    .where(eq(merchantFinanceConfig.configKey, RECHARGE_BLOCK_CONFIG_KEY))
    .limit(1)
  return row ? num(row.v) : null
}

export type RechargeBlockThresholdSource = "merchant" | "global" | "fallback"

export interface RechargeAdmissionDecision {
  merchantId: string
  /** 三池 available 合计（冻结中的额度不计入） */
  availableTotal: number
  threshold: number
  thresholdSource: RechargeBlockThresholdSource
  blocked: boolean
}

/**
 * 判定某商户的终端用户能否继续充值（**只读**）。
 *
 * 阈值三态语义（最容易写错的一处，`override || global` 会让显式 0 被当成
 * 未配置而错阻断）：
 *   商户 override = null → 继承全局
 *   商户 override > 0   → 商户覆盖
 *   商户 override = 0   → **永不阻断**，不回退全局
 *
 * 判定式与阈值 0 的含义见 merchant-account-math.isRechargeBlockedByBalance：
 * `threshold > 0 && availableTotal < threshold` 才阻断（等于即放行）。
 */
export async function checkMerchantRechargeAdmission(
  db: Db,
  merchantId: string,
): Promise<RechargeAdmissionDecision> {
  const [acct] = await db
    .select({ override: merchantAccount.rechargeBlockThreshold })
    .from(merchantAccount)
    .where(eq(merchantAccount.merchantId, merchantId))
    .limit(1)

  const override = acct?.override === null || acct?.override === undefined ? null : num(acct.override)
  const globalDefault = await getGlobalRechargeBlockThreshold(db)

  let threshold: number
  let thresholdSource: RechargeBlockThresholdSource
  if (override !== null) {
    threshold = override
    thresholdSource = "merchant"
  } else if (globalDefault !== null) {
    threshold = globalDefault
    thresholdSource = "global"
  } else {
    threshold = RECHARGE_BLOCK_CODE_FALLBACK
    thresholdSource = "fallback"
  }

  const availableTotal = await getMerchantAvailableTotal(db, merchantId)

  return {
    merchantId,
    availableTotal,
    threshold,
    thresholdSource,
    blocked: isRechargeBlockedByBalance({ availableTotal, threshold }),
  }
}

/**
 * 商户可用额不足导致其终端用户充值被拒。
 *
 * 携带可解释字段而非只抛字符串：用户侧只会看到「充值失败」，运营必须能立刻
 * 区分「商户额度见底」与「用户自己余额问题」，故 merchantId / availableTotal /
 * threshold / thresholdSource 全部随错误一起抛出，由 API 层决定对外文案。
 */
export class MerchantRechargeBlockedError extends Error {
  readonly code = "MERCHANT_RECHARGE_BLOCKED"
  readonly merchantId: string
  readonly availableTotal: number
  readonly threshold: number
  readonly thresholdSource: RechargeBlockThresholdSource

  constructor(input: {
    merchantId: string
    availableTotal: number
    threshold: number
    thresholdSource: RechargeBlockThresholdSource
  }) {
    super(
      `商户 ${input.merchantId} 可用额 ${input.availableTotal} 低于充值准入阈值 ${input.threshold}（来源 ${input.thresholdSource}）`,
    )
    this.name = "MerchantRechargeBlockedError"
    this.merchantId = input.merchantId
    this.availableTotal = input.availableTotal
    this.threshold = input.threshold
    this.thresholdSource = input.thresholdSource
  }
}

/**
 * 终端用户充值准入断言 —— **唯一收口**。
 *
 * 放在 billing 层而非某个 router，是为了让 apps/gpus 与 apps/api 两个充值入口
 * 无法各自漏判：谁建单都先过这道闸。
 */
export async function assertMerchantRechargeAdmission(db: Db, tenantId: string): Promise<void> {
  const [tenant] = await db
    .select({ merchantId: billingTenant.merchantId })
    .from(billingTenant)
    .where(eq(billingTenant.id, tenantId))
    .limit(1)

  // tenant 未归属任何商户（平台直客）时直接放行 —— 阈值语义只约束「商户背书的
  // 用户充值」，平台直客的可用额由另一套账本管，不适用本阈值。
  if (!tenant?.merchantId) return

  const decision = await checkMerchantRechargeAdmission(db, tenant.merchantId)
  if (decision.blocked) {
    throw new MerchantRechargeBlockedError(decision)
  }
}

// ---------------------------------------------------------------------------
// 两阶段冻结（阶段②）
//
// 冻结 available → reserved，到账后二选一终结，二者都必须与冻结配对，
// 否则冻结泄漏（钱被冻住既不释放也不消费，账实不平）：
//   · 未消费 → unfreeze  全额搬回 available，total 不变
//   · 已消费 → settle    释放 reserved 并核销扣减，total 减少一次
// ---------------------------------------------------------------------------

export interface FreezeMerchantBalanceInput {
  merchantId: string
  /** 冻结走哪个池：现金池最常见（商户预付资金背书用户充值） */
  pool: MerchantAccountPool
  /** 正数金额 */
  amount: number
  /**
   * 业务唯一键。同一业务单重复调用只冻结一次（跨系统重放安全）。
   * 例：`tenant-recharge-hold:${paymentOrderId}`
   *
   * 冻结与终结各自派生带后缀的子键（`:unfreeze` / `:settle:release`），
   * 因此调用方**冻结与解冻可以传同一个 key**而不会互相顶掉幂等记录 ——
   * 早期版本两边直接用原 key，解冻会静默命中冻结的幂等行而回放冻结结果，
   * 钱就永久卡在 reserved 里。
   */
  idempotencyKey: string
  /** 业务单号，落 ref_id 便于对账时反查 */
  refId?: string | null
  traceId?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  occurredAt?: Date
}

/**
 * 冻结商户可用额（available → reserved，total 不变）。
 *
 * 语义：用户充值**已提交但尚未到账**时，先把商户侧额度冻结住，防止商户在
 * 资金到账窗口内把同一笔钱再用于给别的用户发券/购券，形成超额承诺。
 * 到账后由结算链路调 unfreeze（未消费）或 settle（已消费）终结。
 *
 * 幂等由 postMerchantLedger 的 idempotency_key 唯一约束保证；
 * 余额不足时整笔抛错、不写流水（不做部分冻结）。
 */
export async function freezeMerchantBalance(
  db: Db,
  input: FreezeMerchantBalanceInput,
): Promise<PostMerchantLedgerResult> {
  return postMerchantLedger(db, {
    merchantId: input.merchantId,
    pool: input.pool,
    direction: "debit",
    amount: input.amount,
    effect: "reserved",
    refType: "freeze",
    refId: input.refId ?? null,
    idempotencyKey: input.idempotencyKey,
    traceId: input.traceId ?? null,
    description: input.description ?? "用户充值在途冻结",
    metadata: input.metadata ?? null,
    occurredAt: input.occurredAt,
  })
}

/**
 * 释放冻结（reserved → available，total 不变）。
 *
 * 用于充值**未消费**的终结路径（失败 / 超时 / 撤单）。
 *
 * 冻结额不足时由 computePoolMovement 抛 InsufficientMerchantBalanceError ——
 * 宁可报错也不允许解冻出负数 reserved，那会让「已冻结」总额大于实际预留，
 * 对账第 0 环立刻失真。
 */
export async function unfreezeMerchantBalance(
  db: Db,
  input: FreezeMerchantBalanceInput,
): Promise<PostMerchantLedgerResult> {
  return postMerchantLedger(db, {
    merchantId: input.merchantId,
    pool: input.pool,
    direction: "credit",
    amount: input.amount,
    effect: "reserved",
    refType: "unfreeze",
    refId: input.refId ?? null,
    // 子键：绝不能与冻结共用，否则解冻会回放冻结的幂等行
    idempotencyKey: `${input.idempotencyKey}:unfreeze`,
    traceId: input.traceId ?? null,
    description: input.description ?? "用户充值未消费，释放冻结",
    metadata: input.metadata ?? null,
    occurredAt: input.occurredAt,
  })
}

export interface SettleFrozenMerchantBalanceResult {
  /** 释放冻结那笔（reserved → available） */
  release: PostMerchantLedgerResult
  /** 核销扣减那笔（available → 出账，total 同步减少） */
  consume: PostMerchantLedgerResult
  /** 两笔都命中幂等回放时为 true */
  replay: boolean
}

/**
 * 核销冻结（settle）—— 充值**已消费**时的终结路径。
 *
 * 为什么必须拆成两笔而不是一笔：
 *   movement 模型只有两种 effect，而恒等式要求
 *   `total == Σ(effect='available' 流水净额)`。
 *   · effect='reserved' 只能搬运、total 恒定 → 无法核销
 *   · effect='available' 会让 total 同步减少、但不动 reserved → 会留下幽灵冻结额
 *   两笔配对（先释放、后扣减）恰好满足恒等式，且与设计文档 §5.3 的
 *   「释放 reserved −X；若已消费则 available −X；合计只减少一次」一致。
 *
 * **两笔同事务**：postMerchantLedger 接受外部事务句柄。只成功一半会让
 * reserved 与 total 永久不一致，对账第 0 环立刻失真，所以绝不允许分两次提交。
 *
 * 幂等：两个子键各自受唯一约束保护，重放不会二次扣钱。
 *
 * `input.refType` 让调用方能给出业务语义（算力券核销传 `voucher_redeem`），
 * 否则流水只会记成通用的 unfreeze/consume —— 事后按业务维度查
 * 「这张券抵扣了哪些消费」就无从下手。默认保持原行为。
 */
export async function settleFrozenMerchantBalance(
  db: Db,
  input: FreezeMerchantBalanceInput & {
    refType?: MerchantAccountLedgerRefType
  },
): Promise<SettleFrozenMerchantBalanceResult> {
  const refType = input.refType ?? "consume"
  const runSettle = async () => db.transaction(async (tx: any) => {
    const release = await postMerchantLedger(
      tx,
      {
        merchantId: input.merchantId,
        pool: input.pool,
        direction: "credit",
        amount: input.amount,
        effect: "reserved",
        refType,
        refId: input.refId ?? null,
        idempotencyKey: `${input.idempotencyKey}:settle:release`,
        traceId: input.traceId ?? null,
        description: input.description ?? "用户充值到账，释放冻结并核销",
        metadata: input.metadata ?? null,
        occurredAt: input.occurredAt,
      },
      tx,
    )

    const consume = await postMerchantLedger(
      tx,
      {
        merchantId: input.merchantId,
        pool: input.pool,
        direction: "debit",
        amount: input.amount,
        effect: "available",
        refType,
        refId: input.refId ?? null,
        idempotencyKey: `${input.idempotencyKey}:settle:consume`,
        traceId: input.traceId ?? null,
        description: input.description ?? "用户充值到账，商户预付资金核销",
        metadata: input.metadata ?? null,
        occurredAt: input.occurredAt,
      },
      tx,
    )

    return { release, consume, replay: release.replay && consume.replay }
  })

  // 并发 settle 的容忍放在**本层**而不是 postMerchantLedger：
  // 下面是外部事务，内层一旦撞唯一键就必须抛，整笔回滚（否则会半笔）。
  // 因此并发下第二路会在此撞 23505 —— 重跑一次即可，届时两笔都命中幂等
  // 回放，返回 replay=true。语义仍是「恰好核销一次」。
  try {
    return await runSettle()
  } catch (e) {
    if (!isUniqueViolation(e)) throw e
    return runSettle()
  }
}
