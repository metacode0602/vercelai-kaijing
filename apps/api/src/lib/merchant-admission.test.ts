/**
 * 商户充值准入判定（DEC-F4 / DEC-F14）真库回归
 *
 * 放在 apps/api 与 merchant-consume.test.ts / merchant-prepay.test.ts 同一约定：
 * billing 未依赖 pg，apps/api 同时依赖 @workspace/billing 与 pg。
 *
 * 覆盖的资金事故场景：
 *   - 三态阈值：商户覆盖 / 继承全局 / 显式 0（永不阻断）
 *   - **显式 0 不得回退到全局默认**（写成 `override || global` 就会错阻断客户充值）
 *   - 配置行被删时落到代码兜底，判定不得产出 undefined
 *   - 阻断结果必须带可解释原因（商户 / 可用额 / 阈值 / 阈值来源）
 *   - 准入只读不改账：判定前后 merchant_account_pool_balance 必须完全一致
 */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { checkMerchantRechargeAdmission, postMerchantLedger } from "@workspace/billing"

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

const MERCHANT = "00000000-0000-4000-8000-00000000d101"
const MERCHANT_PREFIX = "m1-admission-test-"
const CONFIG_KEY = "recharge_block_threshold"

let client: pg.Client
let db: any

const q = (sql: string, params: any[] = []) => client.query(sql, params)

async function cleanup() {
  await q(`delete from merchant_account_ledger where merchant_id = $1`, [MERCHANT])
  await q(`delete from merchant_account_pool_balance where merchant_id = $1`, [MERCHANT])
  await q(`delete from merchant_account where merchant_id = $1`, [MERCHANT])
  await q(`delete from merchant where id = $1`, [MERCHANT])
}

async function seed() {
  await cleanup()
  await q(
    `insert into merchant (id, code, name, company_full_name, access_mode, type, status, created_at, updated_at)
     values ($1, $2, $2, $2, 'oem', 'oem', 'active', now(), now())
     on conflict (id) do nothing`,
    [MERCHANT, `${MERCHANT_PREFIX}a`],
  )
}

/** 铺可用余额；走 postMerchantLedger 以同步维护 pool_balance 实时值 */
async function grantCash(amount: number, tag: string) {
  await postMerchantLedger(db, {
    merchantId: MERCHANT,
    pool: "cash",
    direction: "credit",
    amount,
    refType: "adjust",
    idempotencyKey: `test-admission-${tag}`,
  })
}

async function setMerchantOverride(value: number | null) {
  await q(`update merchant_account set recharge_block_threshold = $2 where merchant_id = $1`, [
    MERCHANT,
    value === null ? null : String(value),
  ])
}

async function setGlobalDefault(value: number | null) {
  if (value === null) {
    await q(`delete from merchant_finance_config where config_key = $1`, [CONFIG_KEY])
    return
  }
  await q(
    `insert into merchant_finance_config (config_key, numeric_value, updated_at)
     values ($1, $2, now())
     on conflict (config_key) do update set numeric_value = excluded.numeric_value, updated_at = now()`,
    [CONFIG_KEY, String(value)],
  )
}

async function poolSnapshot() {
  const { rows } = await q(
    `select pool, available::text, reserved::text, total::text
     from merchant_account_pool_balance where merchant_id = $1 order by pool`,
    [MERCHANT],
  )
  return JSON.stringify(rows)
}

before(async () => {
  if (!DATABASE_URL) return
  client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  db = drizzle(client)
  await seed()
  await grantCash(500, "seed")
})

after(async () => {
  if (!DATABASE_URL) return
  // 恢复全局默认值，避免污染其他用例
  await setGlobalDefault(0)
  await cleanup()
  await client.end()
})

describeDb("商户充值准入判定（真实 PG）", () => {
  it("商户覆盖阈值：低于阈值时阻断", async () => {
    await setGlobalDefault(0)
    await setMerchantOverride(1000)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.blocked, true)
    assert.equal(r.threshold, 1000)
    assert.equal(r.thresholdSource, "merchant")
    assert.equal(r.availableTotal, 500)
  })

  it("商户覆盖阈值：可用额充足时放行", async () => {
    await setMerchantOverride(100)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.blocked, false)
    assert.equal(r.thresholdSource, "merchant")
  })

  it("商户阈值为 NULL：继承全局默认", async () => {
    await setGlobalDefault(1000)
    await setMerchantOverride(null)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.threshold, 1000)
    assert.equal(r.thresholdSource, "global")
    assert.equal(r.blocked, true)
  })

  it("商户显式 0：永不阻断，且不回退全局默认", async () => {
    // 本设计最容易被写错的一处：`override || global` 会让显式 0 被当成未配置而错阻断
    await setGlobalDefault(1000)
    await setMerchantOverride(0)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.threshold, 0)
    assert.equal(r.thresholdSource, "merchant")
    assert.equal(r.blocked, false)
  })

  it("商户覆盖优先于全局默认", async () => {
    await setGlobalDefault(1000)
    await setMerchantOverride(100)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.threshold, 100)
    assert.equal(r.thresholdSource, "merchant")
    assert.equal(r.blocked, false)
  })

  it("全局为 0：任何商户都不阻断", async () => {
    await setGlobalDefault(0)
    await setMerchantOverride(null)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.threshold, 0)
    assert.equal(r.blocked, false)
  })

  it("配置行缺失：落到代码兜底，阈值不得为 undefined/NaN", async () => {
    await setGlobalDefault(null)
    await setMerchantOverride(null)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.thresholdSource, "fallback")
    assert.equal(typeof r.threshold, "number")
    assert.equal(Number.isNaN(r.threshold), false)
    assert.equal(r.threshold, 0)
  })

  it("阻断结果带可解释原因（商户 / 可用额 / 阈值 / 来源）", async () => {
    await setGlobalDefault(0)
    await setMerchantOverride(1000)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.blocked, true)
    // 终端用户充值失败时必须能回传这些，否则用户无从判断是商户额度还是自己账户
    assert.equal(r.merchantId, MERCHANT)
    assert.equal(typeof r.availableTotal, "number")
    assert.equal(r.threshold, 1000)
    assert.ok(["merchant", "global", "fallback"].includes(r.thresholdSource))
  })

  it("准入判定只读：判定前后实时值完全一致", async () => {
    await setMerchantOverride(1000)
    const before = await poolSnapshot()
    await checkMerchantRechargeAdmission(db, MERCHANT)
    await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(await poolSnapshot(), before)
  })

  it("阈值边界：可用额恰好等于阈值时放行", async () => {
    await setGlobalDefault(0)
    await setMerchantOverride(500)
    const r = await checkMerchantRechargeAdmission(db, MERCHANT)
    assert.equal(r.availableTotal, 500)
    assert.equal(r.threshold, 500)
    assert.equal(r.blocked, false)
  })

  it("非本商户查询不串号：未知商户返回 0 可用且不阻断", async () => {
    await setGlobalDefault(0)
    const unknown = "00000000-0000-4000-8000-00000000ffff"
    const r = await checkMerchantRechargeAdmission(db, unknown)
    assert.equal(r.availableTotal, 0)
    assert.equal(r.threshold, 0)
    assert.equal(r.blocked, false)
  })

  after(() => {
    return setGlobalDefault(0).then(() => setMerchantOverride(null))
  })
})
