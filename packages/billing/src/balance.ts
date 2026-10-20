import { eq, and, desc, count } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { tenantBalance, balanceTransaction } from "@workspace/db"
import { ensureBillingTenant } from "./ensure-tenant"
import type {
  CreditBalanceInput,
  FreezeBalanceInput,
  UnfreezeBalanceInput,
  ConsumeReservedInput,
  TenantBalance,
  BalanceTransaction,
  PaginatedResult,
} from "./types"

// ---------------------------------------------------------------------------
// Get tenant balance
// ---------------------------------------------------------------------------

export async function getTenantBalance(
  db: PostgresJsDatabase<Record<string, never>> | any,
  tenantId: string,
): Promise<TenantBalance | undefined> {
  const [row] = await db
    .select()
    .from(tenantBalance)
    .where(eq(tenantBalance.tenantId, tenantId))
    .limit(1)

  return row as TenantBalance | undefined
}

// ---------------------------------------------------------------------------
// Get or create tenant balance (init with zeros)
// ---------------------------------------------------------------------------

export async function getOrCreateTenantBalance(
  db: PostgresJsDatabase<Record<string, never>> | any,
  tenantId: string,
  organizationId: string,
): Promise<TenantBalance> {
  const existing = await getTenantBalance(db, tenantId)
  if (existing) return existing

  await ensureBillingTenant(db, tenantId, { organizationId })

  const [row] = await db
    .insert(tenantBalance)
    .values({
      tenantId,
      organizationId,
      availableBalance: "0",
      reservedBalance: "0",
      currency: "CNY",
    })
    .onConflictDoNothing()
    .returning()

  if (row) return row as TenantBalance

  const created = await getTenantBalance(db, tenantId)
  if (!created) {
    throw new Error(`Failed to create tenant_balance for tenant ${tenantId}`)
  }
  return created
}

// ---------------------------------------------------------------------------
// Credit balance (recharge / refund / bonus)
// ---------------------------------------------------------------------------

export async function creditBalance(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: CreditBalanceInput,
): Promise<{ balance: TenantBalance; tx: BalanceTransaction }> {
  return db.transaction(async (tx: any) => {
    // 1. Get or create balance row with row-level lock
    const [balRow] = await tx
      .select()
      .from(tenantBalance)
      .where(eq(tenantBalance.tenantId, input.tenantId))
    .for("update")
      .limit(1)

    let balance: TenantBalance
    if (!balRow) {
      await ensureBillingTenant(tx, input.tenantId, {
        organizationId: input.organizationId,
      })
      const [created] = await tx
        .insert(tenantBalance)
        .values({
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          availableBalance: "0",
          reservedBalance: "0",
          currency: "CNY",
        })
        .onConflictDoNothing()
        .returning()
      if (created) {
        balance = created as TenantBalance
      } else {
        const [locked] = await tx
          .select()
          .from(tenantBalance)
          .where(eq(tenantBalance.tenantId, input.tenantId))
          .for("update")
          .limit(1)
        balance = locked as TenantBalance
      }
    } else {
      balance = balRow as TenantBalance
    }

    // 2. Compute new balance
    const availBefore = Number(balance.availableBalance)
    const reservedBefore = Number(balance.reservedBalance)
    const availAfter = availBefore + input.amount
    const reservedAfter = reservedBefore
    const balanceBefore = availBefore + reservedBefore
    const balanceAfter = availAfter + reservedAfter

    // 3. Update balance
    const [updatedBal] = await tx
      .update(tenantBalance)
      .set({
        availableBalance: String(availAfter),
        reservedBalance: String(reservedAfter),
        updatedAt: new Date(),
      })
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .returning()

    // 4. Create transaction record
    const txId = crypto.randomUUID()
    const [txRow] = await tx
      .insert(balanceTransaction)
      .values({
        id: txId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        type: input.txType,
        amount: String(input.amount),
        availableBefore: String(availBefore),
        availableAfter: String(availAfter),
        reservedBefore: String(reservedBefore),
        reservedAfter: String(reservedAfter),
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        description: input.description ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning()

    return {
      balance: updatedBal as TenantBalance,
      tx: txRow as BalanceTransaction,
    }
  })
}

// ---------------------------------------------------------------------------
// Debit balance (deduction / auto_deduction)
// Returns null if insufficient funds
// ---------------------------------------------------------------------------

/**
 * 幂等键复用校验（P0-7）。
 *
 * 同一个 key 只允许代表**同一笔**扣款。租户/组织/金额/类型/引用任一不同，
 * 说明上游把 key 复用在了不同请求上（典型：重试时改了金额，或两个商户
 * 撞了同一 request_id）。此时必须报错让上游发现，而不是静默回放
 * 上一笔的流水 —— 否则调用方会以为新请求扣成功了，实际账没扣。
 */
function assertIdempotencyContentMatch(
  existing: BalanceTransaction,
  input: {
    tenantId: string
    organizationId: string
    amount: number
    txType: string
    idempotencyKey?: string
    refType?: string | null
    refId?: string | null
  },
): void {
  const mismatch: string[] = []
  if (existing.tenantId !== input.tenantId) mismatch.push(`tenantId ${existing.tenantId} != ${input.tenantId}`)
  if (existing.organizationId !== input.organizationId)
    mismatch.push(`organizationId ${existing.organizationId} != ${input.organizationId}`)
  if (Number(existing.amount) !== -input.amount)
    mismatch.push(`amount ${existing.amount} != ${-input.amount}`)
  if (existing.type !== input.txType) mismatch.push(`type ${existing.type} != ${input.txType}`)
  if ((existing.refType ?? null) !== (input.refType ?? null))
    mismatch.push(`refType ${existing.refType ?? "null"} != ${input.refType ?? "null"}`)
  if ((existing.refId ?? null) !== (input.refId ?? null))
    mismatch.push(`refId ${existing.refId ?? "null"} != ${input.refId ?? "null"}`)

  if (mismatch.length > 0) {
    throw new Error(
      `IDEMPOTENCY_KEY_CONFLICT: 幂等键 ${input.idempotencyKey ?? "(未提供)"} 已被另一笔扣款占用，内容不一致 -> ${mismatch.join("; ")}`,
    )
  }
}

export async function debitBalance(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: Omit<CreditBalanceInput, "txType"> & {
    txType: "deduction" | "auto_deduction"
    /**
     * 幂等键（P0-7）。B/C 跨网络调用**必须**传（通常取上游 request_id）：
     * 超时/重试/网络分区下，缺了它同一笔消费会被重复扣商户额度。
     *
     * 传入时：首次扣款落库并返回；重复调用回放首次结果（`replayed: true`），
     * 余额不再变动。
     */
    idempotencyKey?: string
  },
): Promise<{ balance: TenantBalance; tx: BalanceTransaction; replayed: boolean } | null> {
  return db.transaction(async (tx: any) => {
    // 幂等前置检查：命中则整笔不动余额，回放首次结果。
    // 放在 FOR UPDATE 之前，让纯重试不必白等行锁。
    if (input.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(balanceTransaction)
        .where(eq(balanceTransaction.idempotencyKey, input.idempotencyKey))
        .limit(1)

      if (existing) {
        // 跨租户复用与内容不一致都视为调用方 bug，绝不静默回放别人的流水
        assertIdempotencyContentMatch(existing as BalanceTransaction, input)
        const [replayBal] = await tx
          .select()
          .from(tenantBalance)
          .where(eq(tenantBalance.tenantId, input.tenantId))
          .limit(1)
        return {
          balance: replayBal as TenantBalance,
          tx: existing as BalanceTransaction,
          replayed: true,
        }
      }
    }

    const [balRow] = await tx
      .select()
      .from(tenantBalance)
      .where(eq(tenantBalance.tenantId, input.tenantId))
    .for("update")
      .limit(1)

    if (!balRow) return null

    const balance = balRow as TenantBalance
    const availBefore = Number(balance.availableBalance)

    if (availBefore < input.amount) {
      // Insufficient funds — do not modify balance
      return null
    }

    const availAfter = availBefore - input.amount
    const reservedBefore = Number(balance.reservedBalance)
    const reservedAfter = reservedBefore
    const balanceBefore = availBefore + reservedBefore
    const balanceAfter = availAfter + reservedAfter

    const txId = crypto.randomUUID()
    // 顺序至关重要：**先抢占幂等键，再改余额**。
    // 旧实现先 UPDATE 余额再插流水，两个并发请求会都扣到余额、
    // 靠 ON CONFLICT 回查赢家后把 `replayed: true` 返回给输家 ——
    // 结果是「回放成功但钱扣了两次」。先插流水则冲突时余额一行未动。
    const [txRow] = await tx
      .insert(balanceTransaction)
      .values({
        id: txId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        type: input.txType,
        amount: String(-input.amount),
        availableBefore: String(availBefore),
        availableAfter: String(availAfter),
        reservedBefore: String(reservedBefore),
        reservedAfter: String(reservedAfter),
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        description: input.description ?? null,
        createdBy: input.createdBy ?? null,
      })
      .onConflictDoNothing({ target: balanceTransaction.idempotencyKey })
      .returning()

    if (!txRow) {
      // 幂等键已被别人抢到：余额尚未被本事务改动，直接回放赢家那一笔。
      // 不能像旧实现那样把余额更新留在事务里。
      const [winner] = await tx
        .select()
        .from(balanceTransaction)
        .where(eq(balanceTransaction.idempotencyKey, input.idempotencyKey as string))
        .limit(1)
      if (!winner) {
        throw new Error(`IDEMPOTENCY_RACE: 幂等键 ${input.idempotencyKey} 冲突但回查不到记录`)
      }
      assertIdempotencyContentMatch(winner as BalanceTransaction, input)

      const [replayBal] = await tx
        .select()
        .from(tenantBalance)
        .where(eq(tenantBalance.tenantId, input.tenantId))
        .limit(1)
      return {
        balance: replayBal as TenantBalance,
        tx: winner as BalanceTransaction,
        replayed: true,
      }
    }

    // 幂等键已归本事务所有，此刻扣余额必然只有一次
    const [updatedBal] = await tx
      .update(tenantBalance)
      .set({
        availableBalance: String(availAfter),
        updatedAt: new Date(),
      })
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .returning()

    return {
      balance: updatedBal as TenantBalance,
      tx: txRow as BalanceTransaction,
      replayed: false,
    }
  })
}

// ---------------------------------------------------------------------------
// Freeze balance (available → reserved)
// Used when a task is submitted: lock funds for potential usage
// ---------------------------------------------------------------------------

export async function freezeBalance(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: FreezeBalanceInput,
): Promise<{ balance: TenantBalance; tx: BalanceTransaction } | null> {
  return db.transaction(async (tx: any) => {
    const [balRow] = await tx
      .select()
      .from(tenantBalance)
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .for("update")
      .limit(1)

    if (!balRow) return null

    const balance = balRow as TenantBalance
    const availBefore = Number(balance.availableBalance)

    if (availBefore < input.amount) {
      return null // Insufficient funds
    }

    const reservedBefore = Number(balance.reservedBalance)
    const availAfter = availBefore - input.amount
    const reservedAfter = reservedBefore + input.amount
    const balanceBefore = availBefore + reservedBefore
    const balanceAfter = availAfter + reservedAfter

    const [updatedBal] = await tx
      .update(tenantBalance)
      .set({
        availableBalance: String(availAfter),
        reservedBalance: String(reservedAfter),
        updatedAt: new Date(),
      })
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .returning()

    const txId = crypto.randomUUID()
    const [txRow] = await tx
      .insert(balanceTransaction)
      .values({
        id: txId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        type: "freeze",
        amount: String(input.amount),
        availableBefore: String(availBefore),
        availableAfter: String(availAfter),
        reservedBefore: String(reservedBefore),
        reservedAfter: String(reservedAfter),
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        description: input.description ?? null,
      })
      .returning()

    return {
      balance: updatedBal as TenantBalance,
      tx: txRow as BalanceTransaction,
    }
  })
}

// ---------------------------------------------------------------------------
// Unfreeze balance (reserved → available)
// Used when a task ends: release remaining frozen funds
// ---------------------------------------------------------------------------

export async function unfreezeBalance(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: UnfreezeBalanceInput,
): Promise<{ balance: TenantBalance; tx: BalanceTransaction } | null> {
  return db.transaction(async (tx: any) => {
    const [balRow] = await tx
      .select()
      .from(tenantBalance)
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .for("update")
      .limit(1)

    if (!balRow) return null

    const balance = balRow as TenantBalance
    const reservedBefore = Number(balance.reservedBalance)

    if (reservedBefore < input.amount) {
      return null // Cannot unfreeze more than reserved
    }

    const availBefore = Number(balance.availableBalance)
    const availAfter = availBefore + input.amount
    const reservedAfter = reservedBefore - input.amount
    const balanceBefore = availBefore + reservedBefore
    const balanceAfter = availAfter + reservedAfter

    const [updatedBal] = await tx
      .update(tenantBalance)
      .set({
        availableBalance: String(availAfter),
        reservedBalance: String(reservedAfter),
        updatedAt: new Date(),
      })
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .returning()

    const txId = crypto.randomUUID()
    const [txRow] = await tx
      .insert(balanceTransaction)
      .values({
        id: txId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        type: "unfreeze",
        amount: String(-input.amount),
        availableBefore: String(availBefore),
        availableAfter: String(availAfter),
        reservedBefore: String(reservedBefore),
        reservedAfter: String(reservedAfter),
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        description: input.description ?? null,
      })
      .returning()

    return {
      balance: updatedBal as TenantBalance,
      tx: txRow as BalanceTransaction,
    }
  })
}

// ---------------------------------------------------------------------------
// Consume reserved (reserved → consumed)
// Used for periodic billing: deduct from reserved for actual GPU usage
// The deducted amount is removed from reserved but NOT added to available
// (it's real consumption, not a transfer back to available)
// ---------------------------------------------------------------------------

export async function consumeReserved(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: ConsumeReservedInput,
): Promise<{ balance: TenantBalance; tx: BalanceTransaction; replayed: boolean } | null> {
  return db.transaction(async (tx: any) => {
    if (input.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(balanceTransaction)
        .where(eq(balanceTransaction.idempotencyKey, input.idempotencyKey))
        .limit(1)

      if (existing) {
        assertIdempotencyContentMatch(existing as BalanceTransaction, {
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          amount: input.amount,
          txType: "auto_deduction",
          idempotencyKey: input.idempotencyKey,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
        })
        const [replayBal] = await tx
          .select()
          .from(tenantBalance)
          .where(eq(tenantBalance.tenantId, input.tenantId))
          .limit(1)
        return {
          balance: replayBal as TenantBalance,
          tx: existing as BalanceTransaction,
          replayed: true,
        }
      }
    }

    const [balRow] = await tx
      .select()
      .from(tenantBalance)
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .for("update")
      .limit(1)

    if (!balRow) return null

    const balance = balRow as TenantBalance
    const reservedBefore = Number(balance.reservedBalance)

    if (reservedBefore < input.amount) {
      return null // Cannot consume more than reserved
    }

    const availBefore = Number(balance.availableBalance)
    const reservedAfter = reservedBefore - input.amount
    const balanceBefore = availBefore + reservedBefore
    const balanceAfter = availBefore + reservedAfter // available unchanged

    const txId = crypto.randomUUID()
    const [txRow] = await tx
      .insert(balanceTransaction)
      .values({
        id: txId,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        type: "auto_deduction",
        amount: String(-input.amount),
        availableBefore: String(availBefore),
        availableAfter: String(availBefore),
        reservedBefore: String(reservedBefore),
        reservedAfter: String(reservedAfter),
        balanceBefore: String(balanceBefore),
        balanceAfter: String(balanceAfter),
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        description: input.description ?? null,
      })
      .onConflictDoNothing({ target: balanceTransaction.idempotencyKey })
      .returning()

    if (!txRow) {
      if (!input.idempotencyKey) {
        return null
      }
      const [winner] = await tx
        .select()
        .from(balanceTransaction)
        .where(eq(balanceTransaction.idempotencyKey, input.idempotencyKey))
        .limit(1)
      if (!winner) {
        throw new Error(`IDEMPOTENCY_RACE: 幂等键 ${input.idempotencyKey} 冲突但回查不到记录`)
      }
      assertIdempotencyContentMatch(winner as BalanceTransaction, {
        tenantId: input.tenantId,
        organizationId: input.organizationId,
        amount: input.amount,
        txType: "auto_deduction",
        idempotencyKey: input.idempotencyKey,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      })
      const [replayBal] = await tx
        .select()
        .from(tenantBalance)
        .where(eq(tenantBalance.tenantId, input.tenantId))
        .limit(1)
      return {
        balance: replayBal as TenantBalance,
        tx: winner as BalanceTransaction,
        replayed: true,
      }
    }

    const [updatedBal] = await tx
      .update(tenantBalance)
      .set({
        reservedBalance: String(reservedAfter),
        updatedAt: new Date(),
      })
      .where(eq(tenantBalance.tenantId, input.tenantId))
      .returning()

    return {
      balance: updatedBal as TenantBalance,
      tx: txRow as BalanceTransaction,
      replayed: false,
    }
  })
}

// ---------------------------------------------------------------------------
// List balance transactions (paginated)
// ---------------------------------------------------------------------------

export async function listBalanceTransactions(
  db: PostgresJsDatabase<Record<string, never>> | any,
  params: {
    tenantId: string
    type?: string
    page?: number
    pageSize?: number
  },
): Promise<PaginatedResult<BalanceTransaction>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const conditions = [eq(balanceTransaction.tenantId, params.tenantId)]

  if (params.type) {
    conditions.push(eq(balanceTransaction.type, params.type))
  }

  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(balanceTransaction)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select()
    .from(balanceTransaction)
    .where(where)
    .orderBy(desc(balanceTransaction.createdAt))
    .limit(pageSize)
    .offset(offset)

  return {
    items: rows as BalanceTransaction[],
    total,
    page,
    pageSize,
  }
}
