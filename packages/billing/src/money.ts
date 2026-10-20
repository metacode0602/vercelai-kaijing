/**
 * 精确金额运算（W-19）。
 *
 * ## 为什么不能用 float
 *
 * 库中金额列都是 `numeric(15,4)`，即**十进制定点**、4 位小数。但 JS 的 number 是
 * IEEE-754 二进制浮点：`2160.5805` 实际存为 `2160.580499999999963...`。
 * 于是「先各自 `toFixed(4)` 再 SQL `SUM`」与「先 float 相加再 `toFixed(4)`」
 * 两条路径在边界值上会差 1e-4，导致恒等式对不上：
 *
 * ```
 * 日表路径：toFixed(4) 逐日入账 → SQL SUM(numeric)   ← 精确十进制
 * 月表路径：parseFloat → float 相加 → toFixed(4)     ← 二进制近似
 * ```
 *
 * `toFixed` 本身不是「十进制四舍五入」，它是对二进制近似值做舍入，因此
 * 「四舍五入后再相加」与「相加后再四舍五入」不满足结合律，差额会累积。
 *
 * ## 做法
 *
 * 全部换算成**以 1e-4 为单位的整数（最小货币单位）**，用 BigInt 精确加减，
 * 输出时再拼回十进制字符串。全程不经过 float，无累积误差、无依赖。
 * 之所以选整数而非 decimal.js：billing 包目前零运行时依赖，且定点数天然
 * 贴合 `numeric(15,4)` 的语义，不需要通用十进制库。
 */

/** 金额小数位数，与 `money()` 列定义的 `scale: 4` 一致。改动需同步迁移。 */
export const MONEY_SCALE = 4

const FACTOR = 10n ** BigInt(MONEY_SCALE)

const DECIMAL_RE = /^(-?)(\d*)(?:\.(\d*))?$/

/**
 * 把「放大后带小数余数」的整数除以 `FACTOR`，按**四舍五入（远离零）**取整。
 *
 * 必须与 PostgreSQL `numeric` 的舍入一致：PG 对超出 scale 的部分按
 * half-up（远离零）舍入，而非截断。若这里截断，`1.00005` 写成 `1.0000`，
 * 而直接交给 PG 会存成 `1.0001` —— 同一份数据两个结果，对账必然打架。
 */
function divRoundHalfUp(numerator: bigint): bigint {
  const negative = numerator < 0n
  const abs = negative ? -numerator : numerator
  const quotient = abs / FACTOR
  const remainder = abs % FACTOR
  // 余数 ≥ 半个单位即进位。`remainder * 2n >= FACTOR` 用整数比较，
  // 避免引入浮点。
  const rounded = remainder * 2n >= FACTOR ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

/**
 * 任意金额输入 → 最小单位整数（放大 1e4）。
 *
 * 字符串走精确十进制解析；number 先放大再 `Math.round`（`Math.round` 对负数
 * 是「向 +∞ 取整」，故负数单独处理，避免 -0.5 被舍成 0）。
 */
export function toMinorUnits(value: string | number | null | undefined): bigint {
  if (value == null || value === '') return 0n

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0n
    // 放大 1e4 后按 half-up（远离零）取整。用「加 0.5 再 floor」而非
    // Math.round：后者对负数是向 +∞ 取整（-0.5 → 0），方向与 PG 不一致。
    //
    // ⚠️ number 入参**无法保证精确**：double 只能精确表示部分十进制小数，
    //   故 `1.00005` 的真实二进制值可能是 1.0000500000000000444…，
    //   舍入结果取决于该逼近值。金额请优先传字符串（走下方精确十进制分支）——
    //   DB 读出的 numeric 与配置项本就是字符串。
    const scaled = value * Number(FACTOR)
    const rounded = scaled < 0 ? -Math.floor(-scaled + 0.5) : Math.floor(scaled + 0.5)
    return BigInt(rounded)
  }

  const raw = value.trim()
  if (raw === '') return 0n

  const m = DECIMAL_RE.exec(raw)
  if (!m) {
    // 非规范十进制文本（如 "1e3"、"NaN"）：退回 number 路径，至少不抛错。
    const n = Number(raw)
    return Number.isFinite(n) ? toMinorUnits(n) : 0n
  }

  const negative = m[1] === '-'
  const intPart = m[2] || '0'
  const fracRaw = m[3] || ''
  // 超出 4 位的部分不丢弃：交给 divRoundHalfUp 按 half-up 处理，与 PG 一致。
  const fracScaled = BigInt((fracRaw + '0'.repeat(MONEY_SCALE)).slice(0, MONEY_SCALE) || '0')
  const dropped = fracRaw.slice(MONEY_SCALE)
  let minor = BigInt(intPart) * FACTOR + fracScaled
  if (dropped.length > 0) {
    // 首位 ≥5 进位（后续位非零时首位也必然 ≥5 的情形已由首位判定覆盖）
    if (dropped[0]! >= '5') minor += 1n
  }
  return negative ? -minor : minor
}

/** 最小单位整数 → 规范十进制字符串（固定 4 位小数，恒定点数表示）。 */
export function fromMinorUnits(minor: bigint): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const intPart = abs / FACTOR
  const fracPart = (abs % FACTOR).toString().padStart(MONEY_SCALE, '0')
  return `${negative ? '-' : ''}${intPart}.${fracPart}`
}

/** 精确求和，返回规范 4 位小数字符串。 */
export function sumMoney(values: readonly (string | number | null | undefined)[]): string {
  let total = 0n
  for (const v of values) total += toMinorUnits(v)
  return fromMinorUnits(total)
}

/** 精确求差（`a - b`），返回规范 4 位小数字符串。 */
export function subtractMoney(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): string {
  return fromMinorUnits(toMinorUnits(a) - toMinorUnits(b))
}

/**
 * 金额 × 数量（卡时 × 单价）。
 *
 * 刻意**不做**中间舍入：`unitCost` 与 `usageHours` 都是 4 位定点，相乘最多
 * 8 位小数，交给 `toMinorUnits` 一次性截断到 4 位，与 PostgreSQL 把
 * `numeric(4,4) * numeric(15,4)` 落库时的舍入方向一致。
 */
export function multiplyMoney(unit: string | number | null | undefined, quantity: string | number | null | undefined): string {
  const unitMinor = toMinorUnits(unit)
  const qtyMinor = toMinorUnits(quantity)
  // 两者都已放大 1e4，乘积需右移 1e4 还原；用 half-up 舍入而非整除截断，
  // 与 PG 的 numeric(4,4) * numeric(15,4) 落库结果一致。
  return fromMinorUnits(divRoundHalfUp(unitMinor * qtyMinor))
}

/**
 * 把任意数值量化到金额精度（MONEY_SCALE 位小数），返回**字符串**。
 *
 * 用于「推导值必须在入库精度上封闭」的场景：例如月租折算出的卡时单价
 * （`deriveCardHourPriceFromMonthlyRent`）要落进 `numeric(15,4)` 列，
 * 就必须先量化，否则「存储值」与「参与计算的值」精度不一致，
 * 会让 `unit_cost × usage_hours == amount` 这类审计恒等式失效。
 */
export function roundToMoneyScale(value: string | number): string {
  return fromMinorUnits(toMinorUnits(value))
}
