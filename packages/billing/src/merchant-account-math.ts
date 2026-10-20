/**
 * 商户账户记账数学（纯函数，无 DB / 无框架依赖）
 *
 * 这里集中定义「一笔流水如何改变 available / reserved / total」的唯一口径，
 * postMerchantLedger 与对账自检共用同一套推导，避免两处各算一遍而对不上。
 *
 * 恒等式（按 merchant_id + pool）：
 *   available + reserved == 持有总额的一部分，total 恒为 available 累计净变动
 *   · effect='available'：available ± amount，total 同步 ± amount（真实现金/券流入流出）
 *   · effect='reserved' ：available ∓ amount、reserved ± amount 互搬，total 不变
 *                         （冻结 debit：available−、reserved+；解冻 credit：反向）
 */

/** 金额比较容差（numeric(15,4) 最小精度 0.0001） */
export const MONEY_EPSILON = 0.0001

/**
 * 资金模式（merchant.funding_mode 的取值，权威定义在 db 层 CHECK 约束）
 * 依据：apps/merchant/content/design/merchant-funding-addendum.md §2
 */
export type FundingMode = "prepay" | "commission"

/**
 * 资金性质 —— 由 funding_mode 派生，**不落库**（DEC-F9）。
 * 预收款属负债、不得确认为收入；佣金结余性质不同。混在一个 available 里会让营收口径算错，
 * 故对账单与 rollup 必须按此分类，而分类的唯一来源是本函数（禁止各处自行 if）。
 */
export type FundNature = "prepaid_liability" | "commission_balance"

export function deriveFundNature(fundingMode: FundingMode): FundNature {
  return fundingMode === "prepay" ? "prepaid_liability" : "commission_balance"
}

/**
 * 充值准入阈值（DEC-F10/F14）
 *
 * 三态语义，**空值含义与 lowBalanceThreshold 相反**（后者 0 = 不生效）：
 *   null  = 继承全局默认
 *   > 0   = 商户覆盖全局
 *   = 0   = 该商户显式永不阻断（信用极好的商户的逃生舱）
 *
 * 解析顺序：商户覆盖 → merchant_finance_config 全局默认 → 代码兜底。
 * 兜底常量的存在是防御性的：配置行被误删时判定仍可用，不会得到 undefined。
 */
export const RECHARGE_BLOCK_CONFIG_KEY = "recharge_block_threshold"

/** 配置表无行时的最后兜底。0 = 不阻断（保持与种子默认值一致） */
export const RECHARGE_BLOCK_CODE_FALLBACK = 0

export function resolveRechargeBlockThreshold(input: {
  merchantOverride: number | null | undefined
  globalDefault: number | null | undefined
}): number {
  const { merchantOverride, globalDefault } = input
  if (merchantOverride !== null && merchantOverride !== undefined) return merchantOverride
  if (globalDefault !== null && globalDefault !== undefined) return globalDefault
  return RECHARGE_BLOCK_CODE_FALLBACK
}

/**
 * 准入判定（DEC-F4）：商户可用额低于阈值时其终端用户充值失败。
 * 阈值为 0 表示不阻断，与 merchant-prepay.ts 的低余额判定式同构。
 */
export function isRechargeBlockedByBalance(input: {
  availableTotal: number
  threshold: number
}): boolean {
  return input.threshold > 0 && input.availableTotal < input.threshold
}

export type PoolName = "cash" | "voucher" | "credit"

/** 流水作用面：available = 真实流入流出；reserved = 冻结/解冻的桶间搬运 */
export type PoolEffect = "available" | "reserved"

export type LedgerDirection = "credit" | "debit"

export interface PoolBalance {
  available: number
  reserved: number
  total: number
}

export interface MovementInput {
  direction: LedgerDirection
  amount: number
  effect?: PoolEffect
  /** 允许结果为负（授信池垫付）；默认 false，额度不足直接抛错 */
  allowNegative?: boolean
}

export interface PoolMovement {
  effect: PoolEffect
  availableBefore: number
  availableAfter: number
  reservedBefore: number
  reservedAfter: number
  totalBefore: number
  totalAfter: number
  /** 三个侧的带符号增量，供对账累加 */
  availableDelta: number
  reservedDelta: number
  totalDelta: number
  /**
   * 流水 balance_before/balance_after：**恒为可用侧**（商户真正能花的余额）。
   *
   * 早期只有 balance_* 一对列时，冻结/解冻会把 balance 记成冻结侧，
   * 导致 UED「变动后余额」在解冻行显示成 0。三侧拆开后
   * available_before/after 与 reserved_before/after 各自表意，
   * balance_before/after 固定为可用侧，以保持旧列语义可用。
   */
  balanceBefore: number
  balanceAfter: number
}

export class InsufficientMerchantBalanceError extends Error {
  readonly code = "INSUFFICIENT_BALANCE"
  /** 触发校验的那一侧余额 */
  readonly available: number
  readonly scope: PoolEffect

  constructor(
    merchantId: string,
    pool: string,
    required: number,
    available: number,
    scope: PoolEffect = "available",
  ) {
    super(
      `商户 ${merchantId} 的 ${pool} 池${scope === "reserved" ? "冻结额" : "可用额"}不足：需要 ${required}，可用 ${available}`,
    )
    this.name = "InsufficientMerchantBalanceError"
    this.available = available
    this.scope = scope
  }
}

/** 幂等键命中但请求内容不一致（防止 key 复用导致错账） */
export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT"

  constructor(idempotencyKey: string) {
    super(`幂等键 ${idempotencyKey} 已被不同内容的流水占用，拒绝回放`)
    this.name = "IdempotencyConflictError"
  }
}

/** 流水对 available 的带符号影响：credit 正、debit 负 */
export function signedAmount(direction: LedgerDirection, amount: number): number {
  return direction === "credit" ? amount : -amount
}

/** 流水对 reserved 的带符号影响：只有冻结/解冻动 reserved，且与 available 反向 */
export function signedReservedAmount(
  direction: LedgerDirection,
  amount: number,
  effect: PoolEffect,
): number {
  return effect === "reserved" ? -signedAmount(direction, amount) : 0
}

/**
 * 推导一笔流水对三侧实时值的影响。纯计算，不写库。
 *
 * 校验规则：
 *   · 冻结（effect=reserved & debit）校验 available —— 钱要拿得出来
 *   · 解冻（effect=reserved & credit）校验 reserved  —— 不能解冻不存在的预留
 *   · 直接动 available 校验 available
 * 任何一侧不足都抛 InsufficientMerchantBalanceError，调用方据此整笔回滚、绝不写流水。
 */
export function computePoolMovement(
  merchantId: string,
  pool: string,
  balance: PoolBalance,
  input: MovementInput,
): PoolMovement {
  const amount = input.amount
  if (!(amount > 0)) {
    throw new Error(`computePoolMovement: amount 必须为正数，收到 ${input.amount}`)
  }

  const effect: PoolEffect = input.effect ?? "available"
  const signed = signedAmount(input.direction, amount)

  const availableBefore = balance.available
  const reservedBefore = balance.reserved
  const totalBefore = balance.total

  // effect=available：真实流入流出，total 同步
  // effect=reserved ：桶间搬运，total 不变
  const availableDelta = signed
  const reservedDelta = signedReservedAmount(input.direction, amount, effect)
  const totalDelta = effect === "reserved" ? 0 : signed

  const availableAfter = availableBefore + availableDelta
  const reservedAfter = reservedBefore + reservedDelta
  const totalAfter = totalBefore + totalDelta

  // 校验哪一侧：解冻校验冻结额，其余校验可用额
  const scope: PoolEffect =
    effect === "reserved" && input.direction === "credit" ? "reserved" : "available"
  const scopeBefore = scope === "reserved" ? reservedBefore : availableBefore
  const scopeAfter = scope === "reserved" ? reservedAfter : availableAfter


  if (scopeAfter < -MONEY_EPSILON && !input.allowNegative) {
    throw new InsufficientMerchantBalanceError(merchantId, pool, amount, scopeBefore, scope)
  }
  // 预留额本身不允许为负：即使 allowNegative 也不允许解冻超过冻结额
  if (reservedAfter < -MONEY_EPSILON) {
    throw new InsufficientMerchantBalanceError(merchantId, pool, amount, reservedBefore, "reserved")
  }

  return {
    effect,
    availableBefore,
    availableAfter,
    reservedBefore,
    reservedAfter,
    totalBefore,
    totalAfter,
    availableDelta,
    reservedDelta,
    totalDelta,
    balanceBefore: availableBefore,
    balanceAfter: availableAfter,
  }
}
