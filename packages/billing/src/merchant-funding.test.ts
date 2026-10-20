import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  RECHARGE_BLOCK_CODE_FALLBACK,
  RECHARGE_BLOCK_CONFIG_KEY,
  deriveFundNature,
  isRechargeBlockedByBalance,
  resolveRechargeBlockThreshold,
} from './merchant-account-math.ts'

// ---------------------------------------------------------------------------
// 资金性质派生（DEC-F9）—— 不落库，由 funding_mode 唯一决定
// ---------------------------------------------------------------------------

test('资金性质：prepay 商户为预收款负债', () => {
  assert.equal(deriveFundNature('prepay'), 'prepaid_liability')
})

test('资金性质：commission 商户为佣金结余', () => {
  assert.equal(deriveFundNature('commission'), 'commission_balance')
})

test('资金性质：prepay 与 commission 不得派生为同一性质', () => {
  assert.notEqual(deriveFundNature('prepay'), deriveFundNature('commission'))
})

// ---------------------------------------------------------------------------
// 充值准入阈值解析（DEC-F14）
// 三态：null=继承全局 / >0=覆盖 / 0=显式永不阻断
// ---------------------------------------------------------------------------

test('阈值解析：商户覆盖优先于全局默认', () => {
  assert.equal(resolveRechargeBlockThreshold({ merchantOverride: 500, globalDefault: 100 }), 500)
})

test('阈值解析：商户为 null 时继承全局默认', () => {
  assert.equal(resolveRechargeBlockThreshold({ merchantOverride: null, globalDefault: 100 }), 100)
})

test('阈值解析：商户为 undefined 时同样继承全局默认', () => {
  assert.equal(resolveRechargeBlockThreshold({ merchantOverride: undefined, globalDefault: 100 }), 100)
})

test('阈值解析：商户显式 0 表示永不阻断，不得回退到全局默认', () => {
  // 这是本设计的核心三态：0 是「显式不阻断」，不是「未配置」。
  // 若实现写成 `override || globalDefault`，此处会得到全局值而错误阻断商户客户充值。
  assert.equal(resolveRechargeBlockThreshold({ merchantOverride: 0, globalDefault: 100 }), 0)
})

test('阈值解析：商户与全局均为 null 时落到代码兜底', () => {
  assert.equal(
    resolveRechargeBlockThreshold({ merchantOverride: null, globalDefault: null }),
    RECHARGE_BLOCK_CODE_FALLBACK,
  )
})

test('阈值解析：全局为 undefined（配置行缺失）不得产出 undefined', () => {
  const resolved = resolveRechargeBlockThreshold({ merchantOverride: null, globalDefault: undefined })
  assert.equal(resolved, RECHARGE_BLOCK_CODE_FALLBACK)
  assert.equal(typeof resolved, 'number')
})

test('配置键名与兜底常量须稳定（schema 与代码耦合）', () => {
  assert.equal(RECHARGE_BLOCK_CONFIG_KEY, 'recharge_block_threshold')
  assert.equal(RECHARGE_BLOCK_CODE_FALLBACK, 0)
})

// ---------------------------------------------------------------------------
// 准入判定（DEC-F4）
// ---------------------------------------------------------------------------

test('准入判定：阈值为 0 时不阻断（与低余额判定式同构）', () => {
  assert.equal(isRechargeBlockedByBalance({ availableTotal: 0, threshold: 0 }), false)
})

test('准入判定：可用额低于阈值时阻断', () => {
  assert.equal(isRechargeBlockedByBalance({ availableTotal: 99, threshold: 100 }), true)
})

test('准入判定：可用额高于阈值时放行', () => {
  assert.equal(isRechargeBlockedByBalance({ availableTotal: 101, threshold: 100 }), false)
})

test('准入判定：可用额恰好等于阈值时放行（严格小于才阻断）', () => {
  assert.equal(isRechargeBlockedByBalance({ availableTotal: 100, threshold: 100 }), false)
})

test('准入判定：阈值为 0 且可用额为 0 时仍不阻断', () => {
  // 双重 0 是「未配置」与「真没钱」最难分辨的场景，判定必须为放行
  assert.equal(isRechargeBlockedByBalance({ availableTotal: 0, threshold: 0 }), false)
})

test('准入判定：授信未用满也算可用（与 getMerchantAvailableTotal 口径一致）', () => {
  // availableTotal 已把未用授信计入 available，此处只需按给定值判定
  assert.equal(isRechargeBlockedByBalance({ availableTotal: 80, threshold: 80 }), false)
})
