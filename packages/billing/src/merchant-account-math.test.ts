import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MONEY_EPSILON,
  computePoolMovement,
  signedAmount,
  signedReservedAmount,
  InsufficientMerchantBalanceError,
} from './merchant-account-math.ts'

const MERCHANT = 'm-1'

test('预付入账：available 与 total 同步增加', () => {
  const m = computePoolMovement(MERCHANT, 'cash', { available: 100, reserved: 0, total: 100 }, {
    direction: 'credit',
    amount: 50,
  })

  assert.equal(m.availableAfter, 150)
  assert.equal(m.reservedAfter, 0)
  assert.equal(m.totalAfter, 150)
  assert.equal(m.availableDelta, 50)
  assert.equal(m.reservedDelta, 0)
  assert.equal(m.totalDelta, 50)
})

test('消费出账：available 与 total 同步减少', () => {
  const m = computePoolMovement(MERCHANT, 'cash', { available: 100, reserved: 0, total: 100 }, {
    direction: 'debit',
    amount: 30,
  })

  assert.equal(m.availableAfter, 70)
  assert.equal(m.totalAfter, 70)
  assert.equal(m.availableDelta, -30)
})

test('额度不足抛错，绝不产生负可用（冻结前 available 也不为负）', () => {
  assert.throws(
    () =>
      computePoolMovement(MERCHANT, 'cash', { available: 10, reserved: 0, total: 10 }, {
        direction: 'debit',
        amount: 100,
      }),
    (err: unknown) => err instanceof InsufficientMerchantBalanceError && err.code === 'INSUFFICIENT_BALANCE',
  )
})

test('allowNegative 仅对 available 生效（授信垫付）', () => {
  const m = computePoolMovement(
    MERCHANT,
    'credit',
    { available: 10, reserved: 0, total: 10 },
    { direction: 'debit', amount: 100, allowNegative: true },
  )

  assert.equal(m.availableAfter, -90)
})

test('冻结：available 与 reserved 之间搬运，total 不变', () => {
  const m = computePoolMovement(
    MERCHANT,
    'cash',
    { available: 100, reserved: 0, total: 100 },
    { direction: 'debit', amount: 40, effect: 'reserved' },
  )

  assert.equal(m.availableAfter, 60)
  assert.equal(m.reservedAfter, 40)
  assert.equal(m.balanceAfter, 60, '冻结后可用侧余额')
  assert.equal(m.totalAfter, 100, '冻结不改变 total')
  assert.equal(m.availableDelta, -40)
  assert.equal(m.reservedDelta, 40)
  assert.equal(m.totalDelta, 0)
  assert.equal(m.balanceBefore, 100, '流水记录被作用的一侧（available）')
  assert.equal(m.balanceAfter, 60)
})

test('解冻：反向搬运，total 不变', () => {
  const m = computePoolMovement(
    MERCHANT,
    'cash',
    { available: 60, reserved: 40, total: 100 },
    { direction: 'credit', amount: 40, effect: 'reserved' },
  )

  assert.equal(m.availableAfter, 100)
  assert.equal(m.reservedAfter, 0)
  assert.equal(m.totalAfter, 100)
  assert.equal(m.reservedDelta, -40)
  assert.equal(m.totalDelta, 0)
  // balance_* 恒为可用侧：解冻后商户可花余额回到 100，而不是冻结侧的 0
  assert.equal(m.balanceBefore, 60, 'balance_before 取可用侧')
  assert.equal(m.balanceAfter, 100, 'balance_after 取可用侧')
  assert.equal(m.reservedBefore, 40, 'reserved_before 仍记录冻结侧')
  assert.equal(m.reservedAfter, 0)
})

test('可解冻额不能超过冻结额（即使 allowNegative 也不允许）', () => {
  assert.throws(
    () =>
      computePoolMovement(
        MERCHANT,
        'cash',
        { available: 100, reserved: 10, total: 100 },
        { direction: 'credit', amount: 50, effect: 'reserved', allowNegative: true },
      ),
    (err: unknown) =>
      err instanceof InsufficientMerchantBalanceError && err.scope === 'reserved',
  )
})

test('冻结校验 available：钱拿不出来不能冻结', () => {
  assert.throws(
    () =>
      computePoolMovement(
        MERCHANT,
        'cash',
        { available: 5, reserved: 0, total: 5 },
        { direction: 'debit', amount: 40, effect: 'reserved' },
      ),
    (err: unknown) =>
      err instanceof InsufficientMerchantBalanceError && err.scope === 'available',
  )
})

test('对账恒等式：期初 + Σ带符号流水 = 期末（available / reserved / total 三侧）', () => {
  const begin = { available: 100, reserved: 0, total: 100 }
  const steps: { direction: 'credit' | 'debit'; amount: number; effect?: 'reserved' }[] = [
    { direction: 'credit', amount: 200 }, // 购券
    { direction: 'debit', amount: 50, effect: 'reserved' }, // 提交任务冻结
    { direction: 'debit', amount: 20 }, // 消费
    { direction: 'credit', amount: 50, effect: 'reserved' }, // 结算解冻
  ]

  let cur = begin
  for (const step of steps) {
    const m = computePoolMovement(MERCHANT, 'cash', cur, { ...step })
    cur = { available: m.availableAfter, reserved: m.reservedAfter, total: m.totalAfter }
  }

  // 100 + 200 - 20 = 280（冻结/解冻不改变 total）
  assert.equal(cur.available, 280)
  assert.equal(cur.reserved, 0)
  assert.equal(cur.total, 280)

  // 用流水侧口径重算，必须与实时值一致（这就是对账第 0 环的判定条件）
  const signedTotal = steps.reduce((sum, s) => sum + signedAmount(s.direction, s.amount), 0)
  const signedReserved = steps.reduce(
    (sum, s) => sum + signedReservedAmount(s.direction, s.amount, s.effect ?? 'available'),
    0,
  )
  const signedAvailable = signedTotal

  assert.equal(begin.available + signedAvailable, cur.available)
  assert.equal(begin.reserved + signedReserved, cur.reserved)
  assert.equal(begin.total + signedAvailable, cur.total)
})

test('金额必须为正', () => {
  assert.throws(
    () =>
      computePoolMovement(MERCHANT, 'cash', { available: 10, reserved: 0, total: 10 }, {
        direction: 'credit',
        amount: 0,
      }),
    /amount 必须为正数/,
  )
})

test('容差为 numeric(15,4) 精度：1e-5 的差异不算漂移', () => {
  assert.ok(0.00001 < MONEY_EPSILON)
  assert.ok(0.001 > MONEY_EPSILON)
})
