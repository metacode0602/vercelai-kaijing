/**
 * 商户消费扣减（跨池） — 设计 §3.3 / §3.6 consumption.debit
 *
 * 扣减优先级：券（临期优先）→ 现金 → 授信 → ❌硬阻断。
 *
 * 为什么必须「一个事务 + 一次性锁全部池」：
 *   1. 一次消费可能同时打多个池。若分多次调用 postMerchantLedger，中途额度不足
 *      就会出现「券已扣、现金没扣」的半笔账 —— 钱少了但服务没停。
 *   2. 多池并发扣减若锁顺序不定，A 锁 cash→voucher、B 锁 voucher→cash 会死锁。
 *      这里统一按 pool 名字升序加锁，顺序固定即无死锁。
 *   3. 幂等键按池派生（`consume:{requestId}:{pool}`）并写在同一事务里，
 *      事务回滚即全部消失，因此不会出现「只记了一半池」的幂等残骸。
 */

import { and, asc, eq, inArray, type SQL } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  MERCHANT_ACCOUNT_POOLS,
  merchantAccount,
  merchantAccountLedger,
  merchantAccountPool,
  merchantAccountPoolBalance,
  type MerchantAccountLedgerRefType,
  type MerchantAccountPool,
} from "@workspace/db"
import {
  IdempotencyConflictError,
  InsufficientMerchantBalanceError,
  MONEY_EPSILON,
  computePoolMovement,
  getOrCreateMerchantAccount,
  type MerchantLedgerRow,
  type MerchantPoolBalanceRow,
} from "./merchant-account"

type Db = PostgresJsDatabase<Record<string, never>> | any

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const newId = (): string => crypto.randomUUID()

/** 商户可用总额不足（跨池合计仍不够）→ HTTP 402 INSUFFICIENT_BALANCE */
export class InsufficientMerchantTotalError extends Error {
  readonly code = "INSUFFICIENT_BALANCE"
  constructor(
    public readonly merchantId: string,
    public readonly required: number,
    public readonly available: number,
  ) {
    super(
      `商户 ${merchantId} 可用额度不足：需要 ¥${required.toFixed(4)}，` +
        `三池合计可用 ¥${available.toFixed(4)}（含授信）`,
    )
    this.name = "InsufficientMerchantTotalError"
  }
}

/** 单笔消费在某个池上的扣减结果 */
export interface PoolDebit {
  pool: MerchantAccountPool
  amount: number
  balanceBefore: number
  balanceAfter: number
  ledgerId: string
}

export interface DebitMerchantInput {
  merchantId: string
  /** 扣减总额 */
  amount: number
  /**
   * 业务请求唯一键（来自 Idempotency-Key 头）。
   * 同一 requestId 的重复调用只会真正扣一次。
   */
  requestId: string
  refType?: Extract<MerchantAccountLedgerRefType, "consume">
  /** 关联业务单据（任务 id 等），便于按业务追账 */
  refId?: string | null
  /** 商户侧用户标识（B/C 形态），用于按用户聚合扣减 */
  externalUserRef?: string | null
  traceId?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  occurredAt?: Date
  /**
   * 是否允许动用授信池。默认 true（授信是垫付缓冲，设计 §3.3）。
   * 关掉后仅用券 + 现金。
   */
  allowCredit?: boolean
}

export interface DebitMerchantResult {
  /** 实际扣减总额（应等于入参 amount） */
  amount: number
  /** 逐池拆分明细，按实际扣减顺序 */
  pools: PoolDebit[]
  /** 扣减后三池可用总额 */
  availableAfter: number
  /** true = 命中幂等键，本次未重复扣减 */
  replay: boolean
  /** 扣减前可用总额（重放时为首次的快照） */
  availableBefore: number
}

/** 消费流水幂等键：按池派生，保证一笔消费的多条流水各自唯一且可整体识别 */
export function consumeIdempotencyKey(requestId: string, pool: string): string {
  return `consume:${requestId}:${pool}`
}

/**
 * 读扣减优先级。
 * 设计要求「临期券优先」，券批次（到期时间）属 M2；批次落地前用 merchant_account_pool
 * 的 priority 表达顺序（voucher < cash < credit），批次上线后在这里换成按临期排序即可，
 * 扣减主流程不用改。
 */
async function readPoolPriorities(db: Db): Promise<MerchantAccountPool[]> {
  const rows = await db
    .select({ pool: merchantAccountPool.pool, priority: merchantAccountPool.priority })
    .from(merchantAccountPool)
    .where(eq(merchantAccountPool.platformMerchantId, 0))

  if (rows.length === 0) {
    // 未配置时退化为设计默认顺序
    return ["voucher", "cash", "credit"] as MerchantAccountPool[]
  }
  const priorityOf = new Map<string, number>(
    rows.map((r: { pool: string; priority: number }) => [r.pool, Number(r.priority)]),
  )
  return [...MERCHANT_ACCOUNT_POOLS].sort(
    (a, b) => (priorityOf.get(a) ?? 9999) - (priorityOf.get(b) ?? 9999),
  )
}

/**
 * 商户消费扣减（跨池，实时硬阻断）。
 *
 * 全流程在**单个事务**内：锁三池 → 查幂等 → 按优先级拆分 → 逐池写流水与实时值。
 *
 * @throws InsufficientMerchantTotalError 三池合计仍不足（调用方映射为 HTTP 402）
 * @throws IdempotencyConflictError 同一 requestId 但金额/内容不一致
 */
export async function debitMerchantBalance(
  db: Db,
  input: DebitMerchantInput,
): Promise<DebitMerchantResult> {
  const amount = num(input.amount)
  if (!(amount > 0)) {
    throw new Error(`debitMerchantBalance: amount 必须为正数，收到 ${input.amount}`)
  }
  if (!input.requestId || input.requestId.trim().length === 0) {
    throw new Error("debitMerchantBalance: requestId（Idempotency-Key）不能为空")
  }

  const refType: MerchantAccountLedgerRefType = input.refType ?? "consume"
  const occurredAt = input.occurredAt ?? new Date()

  // 账户与三池实时值行必须先存在（正常链路由开户/预付时建好）
  await getOrCreateMerchantAccount(db, input.merchantId)

  const order = await readPoolPriorities(db)
  const allowCredit = input.allowCredit !== false
  const candidatePools = order.filter((p) => (allowCredit ? true : p !== "credit"))

  return db.transaction(async (tx: any) => {
    // 1) 按 pool 名字升序锁全部候选池：顺序固定 → 多商户并发不会死锁
    const locked = await tx
      .select()
      .from(merchantAccountPoolBalance)
      .where(
        and(
          eq(merchantAccountPoolBalance.merchantId, input.merchantId),
          inArray(merchantAccountPoolBalance.pool, candidatePools as unknown as string[]),
        ),
      )
      .orderBy(asc(merchantAccountPoolBalance.pool))
      .for("update")

    const byPool = new Map(
      (locked as MerchantPoolBalanceRow[]).map((r) => [r.pool as MerchantAccountPool, r]),
    )

    // 2) 幂等检查（持锁后查，同 requestId 并发只有一个能走到写流水）
    const conditions: SQL[] = [
      eq(merchantAccountLedger.merchantId, input.merchantId),
      eq(merchantAccountLedger.refType, refType),
      eq(merchantAccountLedger.refId, input.requestId),
    ]
    const existing = await tx
      .select()
      .from(merchantAccountLedger)
      .where(and(...conditions))
      .orderBy(asc(merchantAccountLedger.pool))

    if (existing.length > 0) {
      const rows = existing as MerchantLedgerRow[]
      const existingTotal = rows.reduce((sum, r) => sum + num(r.amount), 0)
      // 同 key 必须同一笔消费，否则宁可报错也不能回放错账
      if (Math.abs(existingTotal - amount) > MONEY_EPSILON) {
        throw new IdempotencyConflictError(input.requestId)
      }

      const afterPools = await tx
        .select()
        .from(merchantAccountPoolBalance)
        .where(eq(merchantAccountPoolBalance.merchantId, input.merchantId))
      const availableAfter = (afterPools as MerchantPoolBalanceRow[]).reduce(
        (sum, r) => sum + num(r.available),
        0,
      )

      return {
        amount: existingTotal,
        pools: rows.map((r) => ({
          pool: r.pool as MerchantAccountPool,
          amount: num(r.amount),
          balanceBefore: num(r.balanceBefore),
          balanceAfter: num(r.balanceAfter),
          ledgerId: r.id,
        })),
        availableAfter,
        availableBefore: replayAvailableBefore(rows),
        replay: true,
      } satisfies DebitMerchantResult
    }

    // 3) 按优先级拆分额度
    const availableBefore = candidatePools.reduce(
      (sum, p) => sum + num(byPool.get(p)?.available),
      0,
    )
    if (availableBefore + MONEY_EPSILON < amount) {
      // 硬阻断：不写任何流水，事务回滚
      throw new InsufficientMerchantTotalError(input.merchantId, amount, availableBefore)
    }

    const allocations: { pool: MerchantAccountPool; amount: number }[] = []
    let remaining = amount
    for (const pool of candidatePools) {
      if (remaining <= MONEY_EPSILON) break
      const available = num(byPool.get(pool)?.available)
      if (available <= MONEY_EPSILON) continue
      const take = Math.min(available, remaining)
      allocations.push({ pool, amount: Number(take.toFixed(4)) })
      remaining -= take
    }
    if (remaining > MONEY_EPSILON) {
      // 理论上不可达（有硬阻断兜底），仍保留以防优先级表配了未知池
      throw new InsufficientMerchantTotalError(input.merchantId, amount, availableBefore)
    }

    // 4) 逐池写流水 + 更新实时值
    const pools: PoolDebit[] = []
    for (const alloc of allocations) {
      const before = byPool.get(alloc.pool)!
      // 单池扣减不允许多扣（allowCredit 只作用于「总额是否够」，池内仍按实际余额扣）
      const movement = computePoolMovement(
        input.merchantId,
        alloc.pool,
        {
          available: num(before.available),
          reserved: num(before.reserved),
          total: num(before.total),
        },
        { direction: "debit", amount: alloc.amount, effect: "available" },
      )

      const ledgerId = newId()
      await tx.insert(merchantAccountLedger).values({
        id: ledgerId,
        merchantId: input.merchantId,
        direction: "debit",
        pool: alloc.pool,
        amount: String(alloc.amount),
        effect: movement.effect,
        availableBefore: String(movement.availableBefore),
        availableAfter: String(movement.availableAfter),
        reservedBefore: String(movement.reservedBefore),
        reservedAfter: String(movement.reservedAfter),
        balanceBefore: String(movement.balanceBefore),
        balanceAfter: String(movement.balanceAfter),
        refType,
        refId: input.requestId,
        idempotencyKey: consumeIdempotencyKey(input.requestId, alloc.pool),
        // 首次扣减前的三池合计可用额随流水一起存档：幂等重放要回放这份快照，
        // 而靠流水行反推不可行 —— 未被扣的池根本没有流水行。
        metadata: { ...(input.metadata ?? {}), accountAvailableBefore: availableBefore },
        traceId: input.traceId ?? null,
        externalUserRef: input.externalUserRef ?? null,
        description: input.description ?? null,
        occurredAt,
      })

      await tx
        .update(merchantAccountPoolBalance)
        .set({
          available: String(movement.availableAfter),
          reserved: String(movement.reservedAfter),
          total: String(movement.totalAfter),
          version: num(before.version) + 1,
          lastLedgerId: ledgerId,
          lastLedgerAt: occurredAt,
          updatedAt: new Date(),
        })
        .where(eq(merchantAccountPoolBalance.id, before.id))

      pools.push({
        pool: alloc.pool,
        amount: alloc.amount,
        balanceBefore: movement.balanceBefore,
        balanceAfter: movement.balanceAfter,
        ledgerId,
      })
    }

    // 5) 账户汇总由三池实时值推导
    const allPools = (await tx
      .select()
      .from(merchantAccountPoolBalance)
      .where(eq(merchantAccountPoolBalance.merchantId, input.merchantId))) as MerchantPoolBalanceRow[]

    const map = new Map(allPools.map((r) => [r.pool as MerchantAccountPool, r]))
    const [accountRow] = await tx
      .select()
      .from(merchantAccount)
      .where(eq(merchantAccount.merchantId, input.merchantId))
      .limit(1)

    const creditLimit = num((accountRow as { creditLimit?: unknown } | undefined)?.creditLimit)
    const creditAvailable = num(map.get("credit")?.available)
    const frozenTotal = allPools.reduce((sum, r) => sum + num(r.reserved), 0)
    const availableAfter = allPools.reduce((sum, r) => sum + num(r.available), 0)

    await tx
      .update(merchantAccount)
      .set({
        cashBalance: String(num(map.get("cash")?.available)),
        voucherBalance: String(num(map.get("voucher")?.available)),
        creditUsed: String(Math.max(0, creditLimit - creditAvailable)),
        frozen: String(frozenTotal),
        version: num((accountRow as { version?: unknown } | undefined)?.version ?? 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(merchantAccount.merchantId, input.merchantId))

    return {
      amount,
      pools,
      availableAfter,
      availableBefore,
      replay: false,
    } satisfies DebitMerchantResult
  })
}

/**
 * 幂等重放时还原「首次扣减前」的账户可用总额。
 *
 * 首选流水 metadata 里的快照（本次上线后写入的 consume 流水都带）。
 * 存量流水没有该字段时退化为 Σ 各池 balance_before —— 该口径只在
 * 「所有池都产生了流水」时等于扣减前总额，但这已优于返回 0。
 */
function replayAvailableBefore(rows: MerchantLedgerRow[]): number {
  const first = rows[0] as
    | (MerchantLedgerRow & { metadata?: { accountAvailableBefore?: unknown } | null })
    | undefined
  const archived = first?.metadata?.accountAvailableBefore
  if (archived !== undefined && archived !== null && Number.isFinite(Number(archived))) {
    return Number(archived)
  }
  return rows.reduce((sum, r) => sum + num(r.balanceBefore), 0)
}

export { InsufficientMerchantBalanceError, IdempotencyConflictError }

// 池类型随扣减结果一起暴露，调用方无需再从 @workspace/db 单独 import
export type { MerchantAccountLedgerRefType, MerchantAccountPool } from "@workspace/db"
