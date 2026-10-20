/**
 * 算力券：采购 → 发放 → 核销 → 过期回收
 *
 * ## 钱是怎么流的（这是本模块唯一重要的部分）
 *
 * 商户账户三池：cash（预付现金）/ voucher（券额度）/ credit（授信垫付）。
 *
 *   1. 采购 purchaseMerchantVoucher
 *      cash（或 credit）→ voucher，**商户账户内部搬运**。
 *      两池合计不变，只是把「钱」换成「券额度」。两条流水同事务。
 *
 *   2. 发放 grantMerchantCoupon
 *      voucher available → reserved，并落一张 `coupon` 行。
 *      为什么在发放时就冻结而不是等核销时才扣：券一旦发给终端用户，商户就
 *      欠了一份必须兑现的债。不冻结的话商户可以把同一笔券额度发给 N 个用户，
 *      等用户来核销时余额已经没了 —— 平台只能替商户垫付，或在用户消费时才
 *      报错，而那时用户已经在下单途中了。
 *
 *   3. 核销 redeemMerchantCoupon
 *      消耗券面额，对应商户 reserved 走 settle（释放 + 扣减，total 同步减少）。
 *      同时写 `coupon_usage` 流水，回答「这笔钱抵了哪次消费」。
 *
 *   4. 过期/回收 expireMerchantCoupon
 *      reserved → available（unfreeze），券置为 expired。
 *      未核销的额度必须回到商户池，否则商户的钱被一张没人用的券永久锁死。
 *
 * ## 三条硬规则
 *
 * - **发放必先冻结**：同一事务内冻结 + 建券。冻结失败就没有券。
 * - **核销不得超额**：券面额 `surplus_amount` 为唯一真相，条件更新保证并发下
 *   不会把同一张券核销成负数。
 * - **幂等键按券派生**：同一张券的核销可用不同金额多次发生（部分核销），
 *   所以键要带调用方 requestId，而发放/回收这类一次性动作的键只带券 id。
 */

import { and, eq, sql, type SQL } from "drizzle-orm"
import { coupon, merchant, merchantAccountLedger } from "@workspace/db"
import {
  freezeMerchantBalance,
  postMerchantLedger,
  settleFrozenMerchantBalance,
  unfreezeMerchantBalance,
} from "./merchant-account"
import type { MerchantAccountPool } from "@workspace/db"

type Db = any

// ---------------------------------------------------------------------------
// 错误
// ---------------------------------------------------------------------------

export class VoucherInsufficientError extends Error {
  readonly code = "VOUCHER_INSUFFICIENT"
  readonly required: number
  readonly available: number
  constructor(required: number, available: number, pool: string) {
    super(
      `${pool === "voucher" ? "券额度" : pool === "cash" ? "现金" : "授信"}余额不足：` +
        `需要 ¥${required.toFixed(2)}，可用 ¥${available.toFixed(2)}`,
    )
    this.name = "VoucherInsufficientError"
    this.required = required
    this.available = available
  }
}

export class CouponNotFoundError extends Error {
  readonly code = "COUPON_NOT_FOUND"
  constructor(id: string) {
    super(`券不存在：${id}`)
    this.name = "CouponNotFoundError"
  }
}

export class CouponNotUsableError extends Error {
  readonly code = "COUPON_NOT_USABLE"
  readonly status: string
  constructor(id: string, status: string) {
    super(`券 ${id} 当前状态为 ${status}，不可使用`)
    this.name = "CouponNotUsableError"
    this.status = status
  }
}

export class CouponExpiredError extends Error {
  readonly code = "COUPON_EXPIRED"
  constructor(id: string) {
    super(`券 ${id} 已过期`)
    this.name = "CouponExpiredError"
  }
}

export class CouponNotOwnedError extends Error {
  readonly code = "COUPON_NOT_OWNED"
  constructor() {
    super("券不属于该商户")
    this.name = "CouponNotOwnedError"
  }
}

/**
 * 订单金额未达券的最低消费门槛（coupon.min_amount）。
 *
 * 这条不能省：`min_amount` 在商户端券列表和「租户可用券」里都直接展示给用户，
 * 是一条对外承诺的消费门槛。若核销时不校验，平台等于给出了一张写着
 * 「满 ¥500 可用」实际任何金额都能抵扣的券 —— 用户按承诺凑单，商户侧却没有任何约束。
 */
export class CouponMinAmountNotMetError extends Error {
  readonly code = "COUPON_MIN_AMOUNT_NOT_MET"
  readonly minAmount: number
  readonly orderAmount: number | null
  constructor(couponId: string, minAmount: number, orderAmount: number | null) {
    super(
      orderAmount == null
        ? `券 ${couponId} 需订单满 ¥${minAmount.toFixed(2)} 可用，核销时必须传入订单金额`
        : `券 ${couponId} 需订单满 ¥${minAmount.toFixed(2)} 可用，当前订单 ¥${orderAmount.toFixed(2)}`,
    )
    this.name = "CouponMinAmountNotMetError"
    this.minAmount = minAmount
    this.orderAmount = orderAmount
  }
}

/** 券面额超过该券剩余额度 */
export class CouponOverdrawError extends Error {  readonly code = "COUPON_OVERDRAW"
  readonly requested: number
  readonly remaining: number
  constructor(requested: number, remaining: number) {
    super(
      `核销金额 ¥${requested.toFixed(2)} 超过券剩余额度 ¥${remaining.toFixed(2)}`,
    )
    this.name = "CouponOverdrawError"
    this.requested = requested
    this.remaining = remaining
  }
}

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export interface PurchaseVoucherResult {
  amount: number
  /** 搬运来源池 */
  fromPool: MerchantAccountPool
  /** 采购后 voucher 池可用额 */
  voucherAvailableAfter: number
  /** 采购后来源池可用额 */
  fromAvailableAfter: number
  /** 命中幂等键 */
  replay: boolean
}

export interface GrantCouponInput {
  merchantId: string
  /** 券发给哪个租户（终端用户） */
  tenantId: string
  /** 券面额 */
  amount: number
  name: string
  /** 券码；不传则自动生成 */
  code?: string
  type?: string
  minAmount?: number
  /** 有效天数 */
  validityDay?: number
  /** 绝对到期时间（与 validityDay 二选一，优先） */
  expiredAt?: Date
  remark?: string
  /** 幂等键：同一 requestId 重复发放只发一张 */
  requestId: string
  operatorId?: string
}

export interface GrantCouponResult {
  couponId: string
  code: string
  amount: number
  expiredAt: Date
  issuedAt: Date
  replay: boolean
}

export interface RedeemCouponInput {
  couponId: string
  /**
   * 核销主体的租户 id，**必填**。
   *
   * 券是发给某个租户的，核销时必须校验归属：否则只要拿到券 id 就能替别人
   * 把券花掉，而商户的钱照样扣 —— 用户没得到任何好处，商户却少了余额。
   * 调用方须传**当前会话**的租户，不要接受前端直接传来的值。
   */
  tenantId: string
  /** 核销金额（可部分核销） */
  amount: number
  /**
   * 本次核销对应的**消费单据金额**，券设了 `minAmount`（最低消费）时必填。
   *
   * 传 `undefined` 而券有门槛会直接抛 `CouponMinAmountNotMetError`：
   * 门槛是按订单金额判的，拿不到金额就没有任何办法确认这笔消费够不够，
   * 此时放行等于让门槛形同虚设。
   */
  orderAmount?: number
  /**
   * 幂等键。**必须**由调用方按业务单据派生（如任务实例 id）——
   * 同一张券可以被多次核销，共用一个 key 会导致第二次核销被幂等吞掉。
   */
  requestId: string
  /** 关联业务单据（任务实例 id 等），便于按业务追账 */
  refId?: string
  remark?: string
}

export interface RedeemCouponResult {
  couponId: string
  amount: number
  /** 核销后券剩余额度 */
  remainingAfter: number
  /** 券是否已用尽 */
  exhausted: boolean
  replay: boolean
}

export interface ExpireCouponResult {
  couponId: string
  /** 释放回商户池的额度 */
  released: number
  replay: boolean
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const MONEY_EPSILON = 0.0001
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_VALIDITY_DAY = 90

/** 券码：大写字母数字，避免与其它业务编码歧义 */
function generateCouponCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
  return `VC${body}`
}

/**
 * 发放幂等键：同 requestId 只发一张券。
 *
 * 键由 requestId 而非券 id 派生 —— 券 id 是发放时新生成的随机 UUID，
 * 拿它派生键等于每次重试都是新键，幂等形同虚设。
 */
function grantIdempotencyKey(requestId: string): string {
  return `voucher_grant:${requestId}:freeze`
}

/** 采购幂等键：两池搬运用同一个 key 前缀 + 池后缀，各自唯一 */
export function voucherPurchaseIdempotencyKey(
  requestId: string,
  pool: string,
): string {
  return `voucher_purchase:${requestId}:${pool}`
}

function couponReleaseKey(couponId: string): string {
  return `voucher_recover:${couponId}:unfreeze`
}

/** 券核销幂等键：带 requestId，允许一张券分多次核销 */
export function couponRedeemKey(couponId: string, requestId: string): string {
  return `voucher_redeem:${couponId}:${requestId}`
}

/**
 * 核销 settle 实际落库的子键。
 *
 * `settleFrozenMerchantBalance` 内部会派生成 `…:settle:release` / `…:settle:consume`
 * 两条流水，幂等判重查的必须是**派生后的真实键**，查父键永远查不到 ——
 * 父键只是入参，从不单独落库。
 */
export function couponRedeemLedgerKey(couponId: string, requestId: string): string {
  return `${couponRedeemKey(couponId, requestId)}:settle:consume`
}

// ---------------------------------------------------------------------------
// 1. 采购：cash/credit → voucher
// ---------------------------------------------------------------------------

/**
 * 采购算力券：把现金（或授信）搬进券额度池。
 *
 * 这是**商户账户内部搬运**，两池合计不变。两条流水（来源池出账 + voucher 入账）
 * 必须在同一事务：只成功一半会让「cash 少了 voucher 没多」或反之，
 * 对账第 0 环立刻失真。
 *
 * 不从 voucher 采购（那是自己买自己，无意义），来源非法直接抛错。
 */
export async function purchaseMerchantVoucher(
  db: Db,
  input: {
    merchantId: string
    amount: number
    /** 来源池，默认 cash */
    fromPool?: Exclude<MerchantAccountPool, "voucher">
    requestId: string
    remark?: string
  },
): Promise<PurchaseVoucherResult> {
  const amount = num(input.amount)
  if (!(amount > 0)) {
    throw new Error(`采购金额必须为正数，收到 ${input.amount}`)
  }
  const fromPool: Exclude<MerchantAccountPool, "voucher"> = input.fromPool ?? "cash"
  if (fromPool === ("voucher" as string)) {
    throw new Error("不能从券额度池采购券")
  }

  return await db.transaction(async (tx: any) => {
    // 来源池出账：不足时 postMerchantLedger 抛 InsufficientMerchantBalanceError
    const out = await postMerchantLedger(
      tx,
      {
        merchantId: input.merchantId,
        pool: fromPool,
        direction: "debit",
        amount,
        effect: "available",
        refType: "voucher_purchase",
        refId: null,
        idempotencyKey: voucherPurchaseIdempotencyKey(input.requestId, `from_${fromPool}`),
        description: `采购算力券 ¥${amount.toFixed(2)}（自${fromPool === "cash" ? "现金" : "授信"}）`,
        metadata: { fromPool, requestId: input.requestId },
      },
      tx,
    )

    // voucher 池入账
    const into = await postMerchantLedger(
      tx,
      {
        merchantId: input.merchantId,
        pool: "voucher",
        direction: "credit",
        amount,
        effect: "available",
        refType: "voucher_purchase",
        refId: null,
        idempotencyKey: voucherPurchaseIdempotencyKey(input.requestId, "to_voucher"),
        description: `采购算力券入账 ¥${amount.toFixed(2)}`,
        metadata: { fromPool, requestId: input.requestId },
      },
      tx,
    )

    return {
      amount,
      fromPool,
      voucherAvailableAfter: num(into.poolBalance.available),
      fromAvailableAfter: num(out.poolBalance.available),
      replay: out.replay || into.replay,
    }
  })
}

// ---------------------------------------------------------------------------
// 2. 发放：voucher available → reserved + 建券
// ---------------------------------------------------------------------------

/**
 * 向终端用户发放一张算力券。
 *
 * 冻结与建券同事务：冻结失败就没有券，建券失败则冻结回滚。
 * 券行是商户「已兑现承诺」的凭据，少了它 reserved 就成了无主的钱。
 */
export async function grantMerchantCoupon(
  db: Db,
  input: GrantCouponInput,
): Promise<GrantCouponResult> {
  const amount = num(input.amount)
  if (!(amount > 0)) {
    throw new Error(`券面额必须为正数，收到 ${input.amount}`)
  }

  const issuedAt = new Date()
  const expiredAt =
    input.expiredAt ??
    new Date(issuedAt.getTime() + (input.validityDay ?? DEFAULT_VALIDITY_DAY) * DAY_MS)

  return await db.transaction(async (tx: any) => {
    // 幂等：同 requestId 已发过则返回原券。
    //
    // 判定依据是 **freeze 流水的 idempotency_key**（唯一约束），不是券码：
    // 券码是随机生成的，按 `__grant__:<key>` 去查券表永远查不到自己，
    // 重试会再次冻结 + 再次建券 —— 只要券池余额够，就会静默多发出一张券。
    // 流水的 ref_id 存的就是券 id，拿到它再回查券行。
    const freezeKey = grantIdempotencyKey(input.requestId)
    const [priorFreeze] = await tx
      .select({ refId: merchantAccountLedger.refId })
      .from(merchantAccountLedger)
      .where(
        and(
          eq(merchantAccountLedger.merchantId, input.merchantId),
          eq(merchantAccountLedger.idempotencyKey, freezeKey),
        ),
      )
      .limit(1)
    if (priorFreeze?.refId) {
      const [existing] = await tx
        .select()
        .from(coupon)
        .where(eq(coupon.id, priorFreeze.refId))
        .limit(1)
      if (existing) {
        return {
          couponId: existing.id,
          code: existing.code ?? "",
          amount: num(existing.value),
          expiredAt: existing.expiredAt,
          issuedAt: existing.issuedAt,
          replay: true,
        }
      }
    }

    const couponId = globalThis.crypto.randomUUID()
    const code = input.code ?? generateCouponCode()

    // 先冻结：券额度不足以覆盖本次发放时整笔失败，不会出现「发了但没冻结」
    await freezeMerchantBalance(tx, {
      merchantId: input.merchantId,
      pool: "voucher",
      amount,
      idempotencyKey: freezeKey,
      refId: couponId,
      description: `发放算力券 ${code} 冻结 ¥${amount.toFixed(2)}`,
      metadata: {
        tenantId: input.tenantId,
        code,
        requestId: input.requestId,
        operatorId: input.operatorId ?? null,
      },
    })

    await tx.insert(coupon).values({
      id: couponId,
      tenantId: input.tenantId,
      merchantId: input.merchantId,
      name: input.name,
      code,
      type: input.type ?? "cash",
      value: String(amount),
      surplusAmount: String(amount),
      minAmount: input.minAmount != null ? String(input.minAmount) : null,
      status: "active",
      remark: input.remark ?? null,
      validityDay: input.validityDay ?? DEFAULT_VALIDITY_DAY,
      issuedAt,
      expiredAt,
      platformUpdatedAt: issuedAt,
      syncedAt: issuedAt,
    })

    return {
      couponId,
      code,
      amount,
      expiredAt,
      issuedAt,
      replay: false,
    }
  })
}

/**
 * 校验券属于该租户。
 *
 * 报错文案刻意不区分「券不存在」与「券属于别人」——两种情况对调用方是同一件事，
 * 统一报成不存在，避免通过报错探测别人的券 id。
 */
function assertCouponOwnedBy(
  row: { tenantId?: string | null } | undefined,
  couponId: string,
  tenantId: string,
): void {
  if (!row || row.tenantId !== tenantId) {
    throw new CouponNotFoundError(couponId)
  }
}

// ---------------------------------------------------------------------------
// 3. 核销：券额度 reserved → settle
// ---------------------------------------------------------------------------

/**
 * 核销券（可部分核销）。
 *
 * 幂等键必须带 `requestId`：同一张券会在多个消费场景被核销，若只按券 id 派生键，
 * 第二次核销会被静默吞掉，商户的钱就少扣了 —— 而用户确实用掉了券。
 * 这也是本函数**不接受**调用方省略 requestId 的原因。
 *
 * 并发安全：`surplus_amount` 用条件更新递减（`surplus_amount >= amount`），
 * 抢占失败即判定为超额核销，不会把券扣成负数。
 */
export async function redeemMerchantCoupon(
  db: Db,
  input: RedeemCouponInput,
): Promise<RedeemCouponResult> {
  const amount = num(input.amount)
  if (!(amount > 0)) {
    throw new Error(`核销金额必须为正数，收到 ${input.amount}`)
  }

  const settleKey = couponRedeemKey(input.couponId, input.requestId)
  const settleLedgerKey = couponRedeemLedgerKey(input.couponId, input.requestId)

  return await db.transaction(async (tx: any) => {
    // 幂等检查必须**先于**扣减券余额。
    //
    // settle 自带幂等：重试时它识别出同 requestId 直接返回 replay、不再动钱。
    // 但券余额的扣减若不先判重，就会照扣不误 —— 于是「券面值少了 12000、
    // 账上一分钱没动」，钱和券从此对不上，且没有任何流水能解释这 12000 去了哪。
    // 这类差异恰恰是最难事后排查的一类，所以判重必须在最前面。
    const [priorSettle] = await tx
      .select({ id: merchantAccountLedger.id })
      .from(merchantAccountLedger)
      .where(
        and(
          eq(merchantAccountLedger.refType, "voucher_redeem"),
          eq(merchantAccountLedger.idempotencyKey, settleLedgerKey),
        ),
      )
      .limit(1)
    if (priorSettle) {
      const [row] = await tx
        .select()
        .from(coupon)
        .where(eq(coupon.id, input.couponId))
        .limit(1)
      assertCouponOwnedBy(row, input.couponId, input.tenantId)
      const remainingAfter = num(row?.surplusAmount)
      return {
        couponId: input.couponId,
        amount,
        remainingAfter,
        exhausted: remainingAfter <= MONEY_EPSILON,
        replay: true,
      }
    }

    const [row] = await tx
      .select()
      .from(coupon)
      .where(eq(coupon.id, input.couponId))
    if (!row) {
      throw new CouponNotFoundError(input.couponId)
    }
    assertCouponOwnedBy(row, input.couponId, input.tenantId)
    if (row.status === "expired" || row.status === "void") {
      throw new CouponNotUsableError(input.couponId, row.status)
    }
    if (row.expiredAt.getTime() <= Date.now()) {
      throw new CouponExpiredError(input.couponId)
    }

    // 最低消费门槛：UI 把 minAmount 作为对外承诺展示，核销侧必须同样认它。
    // orderAmount 缺失时也拦下 —— 无法判断门槛是否达成时放行，前端文案就成了空话。
    const minAmount = row.minAmount == null ? 0 : num(row.minAmount)
    if (minAmount > MONEY_EPSILON) {
      const orderAmount = input.orderAmount == null ? null : num(input.orderAmount)
      if (orderAmount == null || orderAmount < minAmount - MONEY_EPSILON) {
        throw new CouponMinAmountNotMetError(input.couponId, minAmount, orderAmount)
      }
    }

    const remaining = num(row.surplusAmount)
    if (remaining < amount - MONEY_EPSILON) {
      throw new CouponOverdrawError(amount, remaining)
    }

    // 条件递减：并发下只有一个赢家能扣成功。
    //
    // SET 里必须写**相对差值** `surplus_amount - amount`，不能写 `remaining - amount`
    // 这个从上面 SELECT 读来的绝对值：PostgreSQL 的 SET 表达式按锁定后的最新行版本
    // 求值，用相对差值才不会发生丢失更新（两路并发都读到 20000、各自写回 15000，
    // 券面值凭空少了 5000，而核销却记了两笔）。
    const updated = await tx
      .update(coupon)
      .set({
        surplusAmount: sql`${coupon.surplusAmount} - ${amount}`,
        status: sql`case when ${coupon.surplusAmount} - ${amount} <= ${MONEY_EPSILON}
                    then 'used' else ${coupon.status} end`,
        usedAt: sql`case when ${coupon.surplusAmount} - ${amount} <= ${MONEY_EPSILON}
                    then now() else ${coupon.usedAt} end`,
      })
      .where(
        and(
          eq(coupon.id, input.couponId),
          sql`${coupon.surplusAmount} >= ${amount}`,
          // 与回收互斥：回收把 status 改成 expired 后，本条件会让核销失败，
          // 反之亦然。两边靠同一行锁 + 同一组条件串行化，额度才不会被花两次。
          sql`${coupon.status} not in ('expired','void')`,
        ),
      )
      .returning({
        id: coupon.id,
        surplusAmount: coupon.surplusAmount,
        status: coupon.status,
      })

    if (!updated || updated.length === 0) {
      // 抢占失败：重读区分「被并发核销掉了」与「已被回收作废」
      const [fresh] = await tx.select().from(coupon).where(eq(coupon.id, input.couponId))
      if (fresh && (fresh.status === "expired" || fresh.status === "void")) {
        throw new CouponNotUsableError(input.couponId, fresh.status)
      }
      throw new CouponOverdrawError(amount, num(fresh?.surplusAmount))
    }

    // 商户侧 reserved → settle（释放 + 扣减，total 同步减少）
    const settled = await settleFrozenMerchantBalance(tx, {
      merchantId: row.merchantId,
      pool: "voucher",
      amount,
      idempotencyKey: settleKey,
      refType: "voucher_redeem",
      refId: input.refId ?? input.couponId,
      description: `算力券核销 ${row.code ?? input.couponId} ¥${amount.toFixed(2)}`,
      metadata: {
        couponId: input.couponId,
        code: row.code,
        tenantId: row.tenantId,
        requestId: input.requestId,
        remark: input.remark ?? null,
      },
    })

    const remainingAfter = num(updated[0].surplusAmount)

    return {
      couponId: input.couponId,
      amount,
      remainingAfter,
      exhausted: remainingAfter <= MONEY_EPSILON,
      replay: settled.replay,
    }
  })
}

// ---------------------------------------------------------------------------
// 4. 过期/回收：voucher reserved → available
// ---------------------------------------------------------------------------

/**
 * 回收券：过期或商户主动作废，把未核销额度释放回券池。
 *
 * 只释放**剩余**额度（`surplus_amount`），已核销部分不动 —— 释放全额会让商户
 * 多拿回钱。
 *
 * 幂等：键只带券 id，且与发放的 freeze 键不同后缀，故同一张券重复回收安全。
 */
export async function expireMerchantCoupon(
  db: Db,
  input: {
    couponId: string
    /** 作废原因 */
    reason?: string
    operatorId?: string
  },
): Promise<ExpireCouponResult> {
  return await db.transaction(async (tx: any) => {
    const [row] = await tx.select().from(coupon).where(eq(coupon.id, input.couponId))
    if (!row) {
      throw new CouponNotFoundError(input.couponId)
    }
    // 已核销完/已作废：无剩余可释放，直接返回（幂等重放的常见落点）
    if (row.status === "expired" || row.status === "void" || row.status === "used") {
      return { couponId: input.couponId, released: 0, replay: true }
    }

    // 先**原子抢占**这张券，再谈释放多少额度。
    //
    // 「读余额 → 释放 → 改状态」三步之间若有并发核销插入，就会把刚被核销掉的
    // 额度也释放掉：核销已经把 reserved 花掉，回收又把它退回 available，
    // 同一笔钱被释放两次，商户资产凭空膨胀。
    // 抢占用带 status 条件的 UPDATE，与 redeem 的 status 条件互为反面，
    // 两者靠同一行锁串行化，谁先提交谁赢。
    //
    // 注意这一步**只改 status、不碰 surplus_amount**：RETURNING 返回的是更新后的行，
    // 若在这里把 surplus 清零，读到的剩余额度就成了 0，钱会被留在 reserved 里
    // 谁也取不出来。清零放到释放之后单独做。
    const claimed = await tx
      .update(coupon)
      .set({ status: "expired", platformUpdatedAt: new Date() })
      .where(
        and(
          eq(coupon.id, input.couponId),
          sql`${coupon.status} not in ('expired','void','used')`,
        ),
      )
      .returning({ surplusAmount: coupon.surplusAmount })
    if (!claimed || claimed.length === 0) {
      // 并发下已被核销/回收处理，不重复释放
      return { couponId: input.couponId, released: 0, replay: true }
    }

    // 用抢占回来的余额释放。行锁仍握在手里，这期间不会有核销插进来。
    const remaining = num(claimed[0].surplusAmount)
    if (remaining > MONEY_EPSILON) {
      await unfreezeMerchantBalance(tx, {
        merchantId: row.merchantId,
        pool: "voucher",
        amount: remaining,
        idempotencyKey: couponReleaseKey(input.couponId),
        refId: input.couponId,
        description: `算力券回收释放 ¥${remaining.toFixed(2)}（${input.reason ?? "过期"}）`,
        metadata: {
          couponId: input.couponId,
          code: row.code,
          reason: input.reason ?? "expired",
          operatorId: input.operatorId ?? null,
        },
      })
    }

    // 钱已退回券池，券就不能再报着面值：否则任何按「面值 − 剩余 = 已使用」
    // 口径出的报表，都会把已退回的额度算成已消费。此处已持锁，条件放宽。
    await tx
      .update(coupon)
      .set({ surplusAmount: "0" })
      .where(eq(coupon.id, input.couponId))

    return { couponId: input.couponId, released: remaining, replay: false }
  })
}

// ---------------------------------------------------------------------------
// 查询
// ---------------------------------------------------------------------------

/** 商户券列表（DB 级分页） */
export async function listMerchantCoupons(
  db: Db,
  input: {
    merchantId: string
    tenantId?: string
    status?: string
    page: number
    pageSize: number
  },
): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, input.page)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  const conditions: SQL[] = [eq(coupon.merchantId, input.merchantId)]
  if (input.tenantId) {
    conditions.push(eq(coupon.tenantId, input.tenantId))
  }
  if (input.status) {
    conditions.push(eq(coupon.status, input.status))
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(coupon)
    .where(where)
  const total = Number(totalRow?.total ?? 0)

  const rows = await db
    .select({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      tenantId: coupon.tenantId,
      tenantName: sql<string | null>`(select t.name from tenant t where t.id = ${coupon.tenantId})`,
      type: coupon.type,
      value: coupon.value,
      surplusAmount: coupon.surplusAmount,
      minAmount: coupon.minAmount,
      status: coupon.status,
      validityDay: coupon.validityDay,
      issuedAt: coupon.issuedAt,
      expiredAt: coupon.expiredAt,
      usedAt: coupon.usedAt,
    })
    .from(coupon)
    .where(where)
    .orderBy(sql`${coupon.issuedAt} desc`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((r: any) => ({
      ...r,
      value: num(r.value),
      surplusAmount: num(r.surplusAmount),
      minAmount: r.minAmount != null ? num(r.minAmount) : null,
    })),
    total,
    page,
    pageSize,
  }
}

/** 某租户可用于抵扣的券（active + 未过期 + 有余额） */
export async function listTenantUsableCoupons(
  db: Db,
  input: { tenantId: string; merchantId?: string },
): Promise<any[]> {
  const conditions: SQL[] = [
    eq(coupon.tenantId, input.tenantId),
    eq(coupon.status, "active"),
    sql`${coupon.surplusAmount} > 0`,
    sql`${coupon.expiredAt} > now()`,
  ]
  if (input.merchantId) {
    conditions.push(eq(coupon.merchantId, input.merchantId))
  }
  return await db
    .select({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      merchantId: coupon.merchantId,
      value: coupon.value,
      surplusAmount: coupon.surplusAmount,
      minAmount: coupon.minAmount,
      expiredAt: coupon.expiredAt,
    })
    .from(coupon)
    .where(and(...conditions))
    .orderBy(coupon.expiredAt)
}

/**
 * 券核销明细（回答「这张券抵了哪几次消费」）。
 *
 * **刻意从 `merchant_account_ledger` 派生，而不是另建一张核销流水表**：
 * 核销与资金变动是同一件事的两种视角，另建表就多一处可能与账本不一致的地方 ——
 * 而「券说抵扣了 100、账上只扣了 80」正是最难排查的那类资金差异。
 * settle 每次写两笔（release + consume），取 consume 那一笔即核销事实，
 * amount 恒为正（正负在 direction 上），故这里取绝对值。
 */
export async function listCouponRedemptions(
  db: Db,
  input: { couponId: string; limit?: number; merchantId?: string },
): Promise<
  Array<{
    id: string
    amount: number
    occurredAt: Date
    refId: string | null
    description: string | null
    metadata: unknown
  }>
> {
  const rows = await db
    .select({
      id: merchantAccountLedger.id,
      amount: merchantAccountLedger.amount,
      occurredAt: merchantAccountLedger.occurredAt,
      refId: merchantAccountLedger.refId,
      description: merchantAccountLedger.description,
      metadata: merchantAccountLedger.metadata,
    })
    .from(merchantAccountLedger)
    .where(
      and(
        // 商户侧查询必须按 merchant_id 收口：券 id 泄露即可读到别人的核销记录
        ...(input.merchantId
          ? [eq(merchantAccountLedger.merchantId, input.merchantId)]
          : []),
        eq(merchantAccountLedger.refType, "voucher_redeem"),
        // 不能按 refId 查券：refId 是「被抵扣的对象」（任务实例 id），
        // 同一笔核销传不同 refId 就查不到了。券 id 存在 metadata 里。
        sql`${merchantAccountLedger.metadata}->>'couponId' = ${input.couponId}`,
        // settle 写两笔：release（reserved/credit）与 consume（available/debit）。
        // 只取 consume 那笔，避免同一笔核销被数两次。
        eq(merchantAccountLedger.direction, "debit"),
      ),
    )
    .orderBy(sql`${merchantAccountLedger.occurredAt} desc`)
    .limit(Math.min(200, Math.max(1, input.limit ?? 50)))

  return rows.map((r: any) => ({ ...r, amount: Math.abs(num(r.amount)) }))
}

/** 商户存在性校验（发放/采购前确认账户主体真实存在） */
export async function assertMerchantExists(db: Db, merchantId: string): Promise<void> {
  const [row] = await db
    .select({ id: merchant.id })
    .from(merchant)
    .where(eq(merchant.id, merchantId))
  if (!row) {
    throw new Error(`商户不存在：${merchantId}`)
  }
}

// ---------------------------------------------------------------------------
// 运营侧查询（跨商户）
// ---------------------------------------------------------------------------

/** 券状态白名单：DB 里无 enum 约束，这里收窄入参与筛选口径 */
export const COUPON_STATUSES = ['active', 'used', 'expired', 'void'] as const
export type CouponStatus = (typeof COUPON_STATUSES)[number]

/**
 * 运营侧券列表（跨商户，DB 级分页）。
 *
 * 与 `listMerchantCoupons` 的区别只有「不锁定单个商户」，但**必须**带上
 * merchantName / tenantName：运营是跨商户视角，只给一串 id 没法判断这张券
 * 是谁家的，出问题时无法定位到人。
 */
export async function listCouponsForOps(
  db: Db,
  input: {
    merchantId?: string
    tenantId?: string
    status?: string
    /** 券码 / 券名 / 商户名 模糊搜索 */
    search?: string
    page: number
    pageSize: number
  },
): Promise<{ items: any[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, input.page)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))
  const conditions: SQL[] = []
  if (input.merchantId) {
    conditions.push(eq(coupon.merchantId, input.merchantId))
  }
  if (input.tenantId) {
    conditions.push(eq(coupon.tenantId, input.tenantId))
  }
  if (input.status) {
    conditions.push(eq(coupon.status, input.status))
  }
  const search = input.search?.trim()
  if (search) {
    const like = `%${search}%`
    conditions.push(
      sql`(${coupon.code} ilike ${like} or ${coupon.name} ilike ${like} or ${merchant.name} ilike ${like})`,
    )
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(coupon)
    .leftJoin(merchant, eq(merchant.id, coupon.merchantId))
    .where(where)
  const total = Number(totalRow?.total ?? 0)

  const rows = await db
    .select({
      id: coupon.id,
      code: coupon.code,
      name: coupon.name,
      merchantId: coupon.merchantId,
      merchantName: merchant.name,
      tenantId: coupon.tenantId,
      tenantName: sql<string | null>`(select t.name from tenant t where t.id = ${coupon.tenantId})`,
      type: coupon.type,
      value: coupon.value,
      surplusAmount: coupon.surplusAmount,
      minAmount: coupon.minAmount,
      status: coupon.status,
      validityDay: coupon.validityDay,
      remark: coupon.remark,
      issuedAt: coupon.issuedAt,
      expiredAt: coupon.expiredAt,
      usedAt: coupon.usedAt,
    })
    .from(coupon)
    .leftJoin(merchant, eq(merchant.id, coupon.merchantId))
    .where(where)
    .orderBy(sql`${coupon.issuedAt} desc`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((r: Record<string, unknown>) => ({
      ...r,
      value: num(r.value),
      surplusAmount: num(r.surplusAmount),
      minAmount: r.minAmount != null ? num(r.minAmount) : null,
    })),
    total,
    page,
    pageSize,
  }
}

/**
 * 券概览。传 `merchantId` 即为该商户口径，不传为全平台口径。
 *
 * `outstanding`（未核销余额）= Σ `surplus_amount` where status='active'：
 * 这是平台还欠终端用户的额度，也是商户券池里 reserved 的对应面。
 *
 * `redeemed` **不能**用「Σ(面值 − 剩余)」算：过期/作废的券剩余已被清零，
 * 那个口径会把已退回池子的钱算成已消费。所以只能从账本取 voucher_redeem 的
 * debit 流水 —— 与 `listCouponRedemptions` 同一数据源，口径天然一致。
 */
export async function getCouponSummary(
  db: Db,
  input?: { merchantId?: string },
): Promise<{
  total: number
  active: number
  expiringSoon: number
  outstanding: number
  redeemed: number
}> {
  const scope = input?.merchantId ? [eq(coupon.merchantId, input.merchantId)] : []
  const scopeLedger = input?.merchantId
    ? [eq(merchantAccountLedger.merchantId, input.merchantId)]
    : []

  const [agg] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${coupon.status} = 'active' and ${coupon.surplusAmount} > 0)`,
      expiringSoon: sql<number>`count(*) filter (
        where ${coupon.status} = 'active' and ${coupon.surplusAmount} > 0
          and ${coupon.expiredAt} <= now() + interval '7 days'
      )`,
      outstanding: sql<string>`coalesce(sum(${coupon.surplusAmount}) filter (where ${coupon.status} = 'active'), 0)`,
    })
    .from(coupon)
    .where(scope.length > 0 ? and(...scope) : undefined)

  const [redeemedRow] = await db
    .select({
      redeemed: sql<string>`coalesce(sum(${merchantAccountLedger.amount}), 0)`,
    })
    .from(merchantAccountLedger)
    .where(
      and(
        ...scopeLedger,
        eq(merchantAccountLedger.refType, "voucher_redeem"),
        eq(merchantAccountLedger.direction, "debit"),
      ),
    )

  return {
    total: Number(agg?.total ?? 0),
    active: Number(agg?.active ?? 0),
    expiringSoon: Number(agg?.expiringSoon ?? 0),
    outstanding: num(agg?.outstanding),
    redeemed: num(redeemedRow?.redeemed),
  }
}

/** 全平台口径（运营侧角标） */
export async function getCouponOpsSummary(db: Db) {
  return getCouponSummary(db)
}
