/**
 * 充值准入**收口** + 商户冻结/解冻 真库回归
 *
 * 与 merchant-admission.test.ts 的分工：那份测纯判定函数，本份测**接线**——
 * 「准入是否真的在建单前拦住」与「冻结是否真的搬运 available↔reserved」。
 *
 * 覆盖的资金事故场景：
 *   - 商户额度不足时 createRechargeOrder 必须抛错且**不落 payment_order**（脏单是真实事故）
 *   - 额度充足时正常建单
 *   - 冻结：available↓ reserved↑ total 不变；余额不足整笔拒、不写流水
 *   - 解冻：reserved↓ available↑ total 不变；解冻超过冻结额必须报错（reserved 不许为负）
 *   - 冻结/解冻各自幂等：同 key 重放只动一次账
 *   - 冻结额不计入商户「可用总额」→ 冻结后同额用户充值会被准入拦住（两阶段冻结的语义前提）
 */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import {
  IdempotencyConflictError,
  MerchantRechargeBlockedError,
  createRechargeOrder,
  freezeMerchantBalance,
  getMerchantAvailableTotal,
  postMerchantLedger,
  settleFrozenMerchantBalance,
  unfreezeMerchantBalance,
} from "@workspace/billing"

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

const MERCHANT = "00000000-0000-4000-8000-00000000d201"
const TENANT = "00000000-0000-4000-8000-00000000d202"
const MERCHANT_PREFIX = "m1-admit-gate-test-"

let client: pg.Client
let db: any

const q = (sql: string, params: any[] = []) => client.query(sql, params)

/** 池化连接：单 pg.Client 只能承载一个事务，并发用例必须走 Pool */
let poolDb: any

const round = (n: number) => Math.round(Number(n) * 10000) / 10000

async function cleanup() {
  await q(`delete from payment_order where tenant_id = $1`, [TENANT])
  await q(`delete from balance_transaction where tenant_id = $1`, [TENANT])
  await q(`delete from tenant_balance where tenant_id = $1`, [TENANT])
  await q(`delete from "tenant" where id = $1`, [TENANT])
  await q(`delete from merchant_account_ledger where merchant_id = $1`, [MERCHANT])
  await q(`delete from merchant_account_pool_balance where merchant_id = $1`, [MERCHANT])
  await q(`delete from merchant_account where merchant_id = $1`, [MERCHANT])
  await q(`delete from merchant where id = $1`, [MERCHANT])
  await q(`delete from merchant_account where merchant_id = $1`, [MERCHANT])
  await q(
    `update merchant_finance_config set numeric_value = '0'::numeric, updated_by_staff_id = null
     where config_key = 'recharge_block_threshold'`,
  )
}

async function seed() {
  await cleanup()
  await q(
    `insert into merchant (id, code, name, company_full_name, access_mode, type, status, created_at, updated_at)
     values ($1, $2, $2, $2, 'oem', 'oem', 'active', now(), now())
     on conflict (id) do nothing`,
    [MERCHANT, `${MERCHANT_PREFIX}a`],
  )
  // 归属商户的租户
  await q(
    `insert into "tenant" (id, name, merchant_id, status, created_at, updated_at)
     values ($1, 'gate-test-tenant', $2, 'active', now(), now()) on conflict (id) do nothing`,
    [TENANT, MERCHANT],
  )
  await q(
    `insert into merchant_finance_config (config_key, numeric_value, remark, updated_at)
     values ('recharge_block_threshold', '0'::numeric, '全局默认：0=不阻断', now())
     on conflict (config_key) do nothing`,
  )
  await q(
    `insert into merchant_account (id, merchant_id, currency, created_at, updated_at)
     values (gen_random_uuid(), $1, 'CNY', now(), now()) on conflict (merchant_id) do nothing`,
    [MERCHANT],
  )
}

async function grantCash(amount: number, tag: string) {
  await postMerchantLedger(db, {
    merchantId: MERCHANT,
    pool: "cash",
    direction: "credit",
    amount,
    refType: "adjust",
    idempotencyKey: `test-gate-${tag}`,
  })
}

async function setGlobal(value: number) {
  await q(
    `insert into merchant_finance_config (config_key, numeric_value, updated_at)
     values ('recharge_block_threshold', $1::numeric, now())
     on conflict (config_key) do update set numeric_value = excluded.numeric_value, updated_at = now()`,
    [String(value)],
  )
}

async function setOverride(value: number | null) {
  await q(`update merchant_account set recharge_block_threshold = $2 where merchant_id = $1`, [
    MERCHANT,
    value === null ? null : String(value),
  ])
}

/**
 * 把账户重置为「全零、无流水」起点。
 *
 * settle 用例必须自带已知起点：grantCash 是累加的，若沿用上一个用例的余额，
 * 断言里的绝对值会全部漂移（曾把 700 误算成 0）。
 */
async function resetAccount() {
  await q(`delete from merchant_account_ledger where merchant_id = $1`, [MERCHANT])
  await q(`delete from merchant_account_pool_balance where merchant_id = $1`, [MERCHANT])
  await q(
    `update merchant_account
        set cash_balance = 0, voucher_balance = 0, credit_used = 0, frozen = 0
      where merchant_id = $1`,
    [MERCHANT],
  )
}

async function poolRow(pool: string) {
  const { rows } = await q(
    `select available, reserved, total from merchant_account_pool_balance
     where merchant_id = $1 and pool = $2`,
    [MERCHANT, pool],
  )
  if (rows.length === 0) return { available: 0, reserved: 0, total: 0 }
  return {
    available: round(rows[0].available),
    reserved: round(rows[0].reserved),
    total: round(rows[0].total),
  }
}

async function ledgerCount() {
  const { rows } = await q(
    `select count(*)::int n from merchant_account_ledger where merchant_id = $1`,
    [MERCHANT],
  )
  return rows[0].n
}

function futureExpiry() {
  const d = new Date()
  d.setMinutes(d.getMinutes() + 30)
  return d
}

describeDb("充值准入收口 createRechargeOrder（DEC-F4）", () => {
  before(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    db = drizzle(client)
    poolDb = drizzle(new pg.Pool({ connectionString: DATABASE_URL, max: 12 }))
    await seed()
  })

  after(async () => {
    await cleanup()
    await client.end()
    await (poolDb.$client as pg.Pool).end()
  })

  it("商户额度低于全局阈值 → 抛错且不落 payment_order", async () => {
    await grantCash(100, "gate1")
    await setOverride(null)
    await setGlobal(500)

    await assert.rejects(
      () =>
        createRechargeOrder(db, {
          tenantId: TENANT,
          scene: "recharge",
          amount: 10,
          paymentMethod: "wechat",
          expiredAt: futureExpiry(),
        }),
      (e: unknown) => {
        assert.ok(e instanceof MerchantRechargeBlockedError)
        assert.equal(e.merchantId, MERCHANT)
        assert.equal(round(e.availableTotal), 100)
        assert.equal(e.threshold, 500)
        assert.equal(e.thresholdSource, "global")
        return true
      },
    )

    const { rows } = await q(`select count(*)::int n from payment_order where tenant_id = $1`, [TENANT])
    assert.equal(rows[0].n, 0, "被拒后不得留下脏单")
  })

  it("额度充足 → 正常建单", async () => {
    await setOverride(50)
    const { order } = await createRechargeOrder(db, {
      tenantId: TENANT,
      scene: "recharge",
      amount: 10,
      paymentMethod: "wechat",
      expiredAt: futureExpiry(),
    })
    assert.ok(order.id)
    assert.equal(Number(order.amount), 10)
  })

  it("商户显式 0 覆盖全局阈值 → 放行（不因全局默认误伤）", async () => {
    await setGlobal(9999)
    await setOverride(0)
    const { order } = await createRechargeOrder(db, {
      tenantId: TENANT,
      scene: "recharge",
      amount: 1,
      paymentMethod: "alipay",
      expiredAt: futureExpiry(),
    })
    assert.ok(order.id)
  })

  it("准入只读：判定不改任何账户余额", async () => {
    // 阈值须**高于**当前可用额才会拒（available < threshold 才拦），
    // 写成 1 会被 750 的现金余额直接放行，用例就废掉了。
    await setOverride(null)
    await setGlobal(100_000)
    const before = await poolRow("cash")
    await assert.rejects(() =>
      createRechargeOrder(db, {
        tenantId: TENANT,
        scene: "recharge",
        amount: 1,
        paymentMethod: "wechat",
        expiredAt: futureExpiry(),
      }),
    )
    assert.deepEqual(await poolRow("cash"), before)
  })
})

describeDb("商户冻结 / 解冻（阶段② 两阶段冻结）", () => {
  before(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    db = drizzle(client)
    poolDb = drizzle(new pg.Pool({ connectionString: DATABASE_URL, max: 12 }))
    await seed()
  })

  after(async () => {
    await cleanup()
    await client.end()
    await (poolDb.$client as pg.Pool).end()
  })

  it("冻结：available↓ reserved↑ total 不变", async () => {
    await grantCash(1000, "frz0")
    const before = await poolRow("cash")

    await freezeMerchantBalance(db, {
      merchantId: MERCHANT,
      pool: "cash",
      amount: 300,
      idempotencyKey: "frz-a",
      refId: "order-1",
    })

    const after = await poolRow("cash")
    assert.equal(after.available, before.available - 300)
    assert.equal(after.reserved, before.reserved + 300)
    assert.equal(after.total, before.total, "total 恒定不变（桶间搬运）")
  })

  it("冻结额不计入可用总额 → 冻结后同额充值被准入拦住", async () => {
    // 这条是两阶段冻结的语义前提：商户拿不出的钱不能再去背书新用户
    const avail = round(await getMerchantAvailableTotal(db, MERCHANT))
    assert.equal(avail, 700, "1000 现金 − 300 冻结：冻结额不计入可用")
    await setOverride(701) // 恰好比可用额高 1 → 必拦
    await assert.rejects(
      () =>
        createRechargeOrder(db, {
          tenantId: TENANT,
          scene: "recharge",
          amount: 1,
          paymentMethod: "wechat",
          expiredAt: futureExpiry(),
        }),
      (e: unknown) => e instanceof MerchantRechargeBlockedError,
    )
    await setOverride(600) // ≤ 可用额 → 放行
  })

  it("冻结幂等：同 key 重放只动一次账", async () => {
    const before = await poolRow("cash")
    for (let i = 0; i < 3; i++) {
      await freezeMerchantBalance(db, {
        merchantId: MERCHANT,
        pool: "cash",
        amount: 100,
        idempotencyKey: "frz-idem",
      })
    }
    const after = await poolRow("cash")
    assert.equal(after.available, before.available - 100)
    assert.equal(after.reserved, before.reserved + 100)
  })

  it("余额不足 → 整笔拒绝且不写流水", async () => {
    const n0 = await ledgerCount()
    await assert.rejects(() =>
      freezeMerchantBalance(db, {
        merchantId: MERCHANT,
        pool: "cash",
        amount: 10_000_000,
        idempotencyKey: "frz-too-big",
      }),
    )
    assert.equal(await ledgerCount(), n0, "失败不得留下流水")
  })

  it("解冻：reserved↓ available↑ total 不变", async () => {
    const before = await poolRow("cash")
    await unfreezeMerchantBalance(db, {
      merchantId: MERCHANT,
      pool: "cash",
      amount: 150,
      idempotencyKey: "unfrz-a",
    })
    const after = await poolRow("cash")
    assert.equal(after.available, before.available + 150)
    assert.equal(after.reserved, before.reserved - 150)
    assert.equal(after.total, before.total)
  })

  it("解冻超过冻结额 → 报错（reserved 不许为负）", async () => {
    const n0 = await ledgerCount()
    await assert.rejects(() =>
      unfreezeMerchantBalance(db, {
        merchantId: MERCHANT,
        pool: "cash",
        amount: 10_000_000,
        idempotencyKey: "unfrz-too-big",
      }),
    )
    assert.equal(await ledgerCount(), n0)
    const { rows } = await q(
      `select reserved from merchant_account_pool_balance where merchant_id=$1 and pool='cash'`,
      [MERCHANT],
    )
    assert.ok(round(rows[0].reserved) >= 0, "冻结额不得被解成负数")
  })

  it("解冻幂等：同 key 重放只动一次账", async () => {
    const before = await poolRow("cash")
    for (let i = 0; i < 3; i++) {
      await unfreezeMerchantBalance(db, {
        merchantId: MERCHANT,
        pool: "cash",
        amount: 50,
        idempotencyKey: "unfrz-idem",
      })
    }
    const after = await poolRow("cash")
    assert.equal(after.available, before.available + 50)
    assert.equal(after.reserved, before.reserved - 50)
  })

  it("账实恒等：total 只认 available 流水，桶间搬运不进 total", async () => {
    // 恒等式口径：total 恒等于 effect='available' 流水的净变动之和。
    // 冻结/解冻（effect='reserved'）只在 available↔reserved 之间搬运，
    // 把它们的 amount 也算进 net 会让这条式子假报错。
    const { rows } = await q(
      `select p.pool,
              p.available,
              p.reserved,
              p.total,
              coalesce(sum(l.amount) filter (
                where l.effect = 'available' and l.direction = 'credit'), 0)::numeric
              - coalesce(sum(l.amount) filter (
                where l.effect = 'available' and l.direction = 'debit'), 0)::numeric as avail_net,
              coalesce(sum(l.amount) filter (
                where l.effect = 'reserved' and l.direction = 'debit'), 0)::numeric
              - coalesce(sum(l.amount) filter (
                where l.effect = 'reserved' and l.direction = 'credit'), 0)::numeric as freeze_net
       from merchant_account_pool_balance p
       left join merchant_account_ledger l
         on l.merchant_id = p.merchant_id and l.pool = p.pool
       where p.merchant_id = $1
       group by p.pool, p.available, p.reserved, p.total`,
      [MERCHANT],
    )
    assert.ok(rows.length > 0, "应至少有 cash 一行")
    for (const r of rows) {
      assert.equal(round(r.total), round(r.avail_net), `pool ${r.pool}: total ≠ available 流水净额`)
      // available = 现金净入 − 冻结净出；reserved = 冻结净出 − 冻结净入
      assert.equal(
        round(r.available),
        round(r.avail_net - r.freeze_net),
        `pool ${r.pool}: available 与流水不自洽`,
      )
      assert.ok(round(r.reserved) >= 0, `pool ${r.pool}: reserved 为负`)
    }
  })
})

/**
 * settle 配对测试（阶段② 核销）。
 *
 * settle 是冻结的唯一「已消费」终结路径，必须与 freeze 成对出现；
 * 设计文档 §5.3 要求「释放 reserved −X；若已消费则 available −X；合计只减少一次」。
 * 下面每条都在验证这个恒等式不被破坏：
 *   - settle 账实恒等：total 只减少一次，不是两次
 *   - freeze→unfreeze 与 freeze→settle 两条终结路径互不串号（子键回归）
 *   - settle 幂等 / 并发 settle 只核销一次
 *   - 核销时第二笔失败必须整体回滚（不得留下半笔 reserved 归零）
 *   - settle 后商户可用额可继续用于新的冻结
 */
describeDb("商户冻结核销 settle（阶段②）", () => {
  before(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL })
    await client.connect()
    db = drizzle(client)
    poolDb = drizzle(new pg.Pool({ connectionString: DATABASE_URL, max: 12 }))
    await seed()
  })

  after(async () => {
    await cleanup()
    await client.end()
    await (poolDb.$client as pg.Pool).end()
  })

  it("settle：释放冻结 + 核销扣减，total 只减少一次", async () => {
    await resetAccount()
    await grantCash(1000, "st0")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT,
      pool: "cash",
      amount: 300,
      idempotencyKey: "stl-freeze-1",
      refId: "order-settle-1",
    })

    const frozen = await poolRow("cash")
    assert.equal(frozen.available, 700)
    assert.equal(frozen.reserved, 300)
    assert.equal(frozen.total, 1000)

    const r = await settleFrozenMerchantBalance(db, {
      merchantId: MERCHANT,
      pool: "cash",
      amount: 300,
      idempotencyKey: "stl-freeze-1",
      refId: "order-settle-1",
    })
    assert.equal(r.replay, false)

    const after = await poolRow("cash")
    assert.equal(after.reserved, 0, "冻结必须被释放干净")
    assert.equal(after.total, 700, "核销只让 total 减少一次（1000→700）")
    assert.equal(after.available, 700, "available 净不变：冻结 −300、核销 −300、释放 +300")
  })

  it("settle 与 unfreeze 不串号：冻结 key 与其终结 key 键空间独立", async () => {
    // 回归：早期 unfreeze 直接复用 freeze 的 idempotencyKey，会命中冻结的幂等行
    // 而「静默回放冻结」—— 表现为 reserved 纹丝不动、available 也回不来。
    // 关键断言：unfreeze(K) 之后 reserved 必须真的归零。
    await resetAccount()
    await grantCash(1000, "st1")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 200, idempotencyKey: "stl-shared-key",
    })
    const held = await poolRow("cash")
    assert.equal(held.available, 800)
    assert.equal(held.reserved, 200)

    const u = await unfreezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 200, idempotencyKey: "stl-shared-key",
    })
    assert.equal(u.replay, false, "unfreeze 不能被 freeze 的幂等行吞掉")

    const back = await poolRow("cash")
    assert.equal(back.available, 1000, "unfreeze 必须真的把 available 加回来")
    assert.equal(back.reserved, 0)
    assert.equal(back.total, 1000, "unfreeze 路径不减少 total")

    // settle 走的是另一组子键，与 unfreeze 也不冲突
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 300, idempotencyKey: "stl-k2",
    })
    await settleFrozenMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 300, idempotencyKey: "stl-k2",
    })
    assert.deepEqual(await poolRow("cash"), { available: 700, reserved: 0, total: 700 })
  })

  it("settle 幂等：同 key 重复核销只扣一次", async () => {
    await resetAccount()
    await grantCash(1000, "st2")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 250, idempotencyKey: "stl-idem",
    })
    for (let i = 0; i < 3; i++) {
      const r = await settleFrozenMerchantBalance(db, {
        merchantId: MERCHANT, pool: "cash", amount: 250, idempotencyKey: "stl-idem",
      })
      if (i === 0) assert.equal(r.replay, false)
      else assert.equal(r.replay, true, "第 2/3 次必须整笔回放")
    }
    assert.deepEqual(await poolRow("cash"), { available: 750, reserved: 0, total: 750 })
  })

  it("并发 settle：12 路同 key 只核销一次", async () => {
    await resetAccount()
    await grantCash(1000, "st3")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 400, idempotencyKey: "stl-conc",
    })
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        settleFrozenMerchantBalance(poolDb, {
          merchantId: MERCHANT, pool: "cash", amount: 400, idempotencyKey: "stl-conc",
        }),
      ),
    )
    const real = results.filter((r) => r.replay === false)
    assert.equal(real.length, 1, `应恰好 1 次真实核销，实际 ${real.length}`)
    assert.deepEqual(await poolRow("cash"), { available: 600, reserved: 0, total: 600 })
  })

  it("settle 第二笔失败 → 整体回滚：release 不留痕、reserved 不归零", async () => {
    // 造第二笔失败不能用「余额不足」：释放那笔恰好把金额补回去，consume 永远够。
    // 真实可发生的第二笔失败是子键被别的业务占用（IdempotencyConflictError）——
    // 例如同一业务 key 下已存在一笔金额不同的核销。
    await resetAccount()
    await grantCash(1000, "st4")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 600, idempotencyKey: "stl-rollback",
    })
    // 预先占用 `stl-rollback:settle:consume` 子键，且金额不同 → 同 key 复用校验会拒绝
    await postMerchantLedger(db, {
      merchantId: MERCHANT,
      pool: "cash",
      direction: "credit",
      amount: 999,
      effect: "available",
      refType: "consume",
      idempotencyKey: "stl-rollback:settle:consume",
    })
    const n0 = await ledgerCount()

    await assert.rejects(
      () => settleFrozenMerchantBalance(db, {
        merchantId: MERCHANT, pool: "cash", amount: 600, idempotencyKey: "stl-rollback",
      }),
      (e: unknown) => e instanceof IdempotencyConflictError,
    )

    assert.equal(await ledgerCount(), n0, "失败不得留下 release 流水（两笔一起回滚）")
    const after = await poolRow("cash")
    assert.equal(after.reserved, 600, "reserved 必须保持冻结态，release 已回滚")
    assert.equal(after.total, 1999, "total 只被那笔预置 credit 影响，settle 未生效")
  })

  it("settle 不足额核销被拒：不得超过已冻结额", async () => {
    await resetAccount()
    await grantCash(1000, "st5")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 100, idempotencyKey: "stl-short",
    })
    const n0 = await ledgerCount()
    await assert.rejects(() =>
      settleFrozenMerchantBalance(db, {
        merchantId: MERCHANT, pool: "cash", amount: 900, idempotencyKey: "stl-short-big",
      }),
    )
    assert.equal(await ledgerCount(), n0, "超冻结额核销必须整笔拒绝")
    const after = await poolRow("cash")
    assert.equal(after.reserved, 100, "原冻结不受影响")
    assert.equal(after.total, 1000)
  })

  it("settle 后可继续冻结新额度（不残留幽灵冻结）", async () => {
    await resetAccount()
    await grantCash(2000, "st6")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 500, idempotencyKey: "stl-a",
    })
    await settleFrozenMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 500, idempotencyKey: "stl-a",
    })
    // available 应回到 1500（2000 − 500 核销），可再冻结 1000
    const r = await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 1000, idempotencyKey: "stl-b",
    })
    assert.equal(r.replay, false)
    const after = await poolRow("cash")
    assert.equal(after.available, 500)
    assert.equal(after.reserved, 1000)
    assert.equal(after.total, 1500)
  })

  it("settle 后账实恒等仍成立（total == available 流水净额）", async () => {
    await resetAccount()
    await grantCash(2000, "st7")
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 400, idempotencyKey: "stl-id-a",
    })
    await settleFrozenMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 400, idempotencyKey: "stl-id-a",
    })
    await freezeMerchantBalance(db, {
      merchantId: MERCHANT, pool: "cash", amount: 150, idempotencyKey: "stl-id-b",
    })
    const { rows } = await q(
      `select p.pool, p.available, p.reserved, p.total,
              coalesce(sum(l.amount) filter (
                where l.effect='available' and l.direction='credit'),0)::numeric
              - coalesce(sum(l.amount) filter (
                where l.effect='available' and l.direction='debit'),0)::numeric as avail_net,
              coalesce(sum(l.amount) filter (
                where l.effect='reserved' and l.direction='debit'),0)::numeric
              - coalesce(sum(l.amount) filter (
                where l.effect='reserved' and l.direction='credit'),0)::numeric as freeze_net
         from merchant_account_pool_balance p
         left join merchant_account_ledger l
           on l.merchant_id = p.merchant_id and l.pool = p.pool
         where p.merchant_id = $1
         group by p.pool, p.available, p.reserved, p.total`,
      [MERCHANT],
    )
    assert.ok(rows.length > 0)
    for (const r of rows) {
      assert.equal(round(r.total), round(r.avail_net), `pool ${r.pool}: total ≠ available 流水净额`)
      assert.equal(round(r.available), round(r.avail_net - r.freeze_net), `pool ${r.pool}: available 不自洽`)
      assert.ok(round(r.reserved) >= 0, `pool ${r.pool}: reserved 为负`)
    }
  })
})
