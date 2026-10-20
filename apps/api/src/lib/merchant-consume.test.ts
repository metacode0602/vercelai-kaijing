/**
 * 商户消费扣减（跨池）+ POST /api/v1/consumption/debit 回归（需真实 DATABASE_URL）
 *
 * 放在 apps/api 而非 packages/billing：billing 未依赖 pg，apps/api 同时依赖
 * @workspace/billing 与 pg，与 merchant-prepay.test.ts 同一约定。
 *
 * 覆盖的「资金事故」场景：
 *   - 跨池拆分严格按 券 → 现金 → 授信 优先级，一笔消费只记实际命中的池
 *   - 额度不足整笔拒绝（**不留半笔账**：无流水、无实时值变动）
 *   - allowCredit=false 时授信池不可动用
 *   - 同 Idempotency-Key 重放不重复扣减；同 key 不同金额 → 409
 *   - 20 路并发同 key 只扣一次
 *   - merchantId 只来自凭证：商户 A 的 key 动不了商户 B 的钱
 *   - scope 不足 403、无凭证 401、缺 Idempotency-Key 400
 *   - 账实恒等：pool_balance.total == Σ ledger.amount
 *
 * 测试数据完全自建（含 merchant 行），不依赖任何既有 seed。
 */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import {
  debitMerchantBalance,
  listMerchantPoolTotalMismatch,
  postMerchantLedger,
  IdempotencyConflictError,
  InsufficientMerchantTotalError,
} from "@workspace/billing"
import { createMerchantApiKey } from "@workspace/auth"

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

const MERCHANT = "00000000-0000-4000-8000-00000000c101"
const OTHER_MERCHANT = "00000000-0000-4000-8000-00000000c102"
const MERCHANT_PREFIX = "m1-consume-test-"

let client: pg.Client
let db: any
/** 被测服务专用连接池（单条 client 无法承载并发） */
let poolDb: any

const q = (sql: string, params: any[] = []) => client.query(sql, params)

async function cleanup() {
  await q(`delete from merchant_account_ledger where merchant_id in ($1, $2)`, [
    MERCHANT,
    OTHER_MERCHANT,
  ])
  await q(`delete from merchant_api_key where merchant_id in ($1, $2)`, [
    MERCHANT,
    OTHER_MERCHANT,
  ])
  await q(`delete from merchant_account_pool_balance where merchant_id in ($1, $2)`, [
    MERCHANT,
    OTHER_MERCHANT,
  ])
  await q(`delete from merchant_account where merchant_id in ($1, $2)`, [
    MERCHANT,
    OTHER_MERCHANT,
  ])
  await q(`delete from merchant where id in ($1, $2)`, [MERCHANT, OTHER_MERCHANT])
}

async function seed() {
  await cleanup()
  for (const [id, name] of [
    [MERCHANT, `${MERCHANT_PREFIX}a`],
    [OTHER_MERCHANT, `${MERCHANT_PREFIX}b`],
  ] as const) {
    await q(
      `insert into merchant (id, code, name, company_full_name, access_mode, type, status, created_at, updated_at)
       values ($1, $2, $2, $2, 'oem', 'oem', 'active', now(), now())
       on conflict (id) do nothing`,
      [id, name],
    )
  }
}

/** 直接给某池入账，用于铺测试余额 */
async function grant(pool: "cash" | "voucher" | "credit", amount: number, tag: string) {
  await postMerchantLedger(db, {
    merchantId: MERCHANT,
    pool,
    direction: "credit",
    amount,
    refType: pool === "voucher" ? "voucher_grant" : "adjust",
    idempotencyKey: `test-grant-${tag}-${pool}`,
  })
}

/**
 * 开通授信额度。
 * 授信池实时值行只能由流水创建（postMerchantLedger 负责建行+写流水+回写汇总），
 * 所以这里必须走一笔 credit 入账，再把 credit_limit 对齐到该额度。
 */
async function setCreditLimit(amount: number, tag: string) {
  await postMerchantLedger(db, {
    merchantId: MERCHANT,
    pool: "credit",
    direction: "credit",
    amount,
    refType: "adjust",
    idempotencyKey: `test-credit-${tag}`,
  })
  await q(`update merchant_account set credit_limit = $2 where merchant_id = $1`, [
    MERCHANT,
    String(amount),
  ])
}

async function poolAvailables(merchantId = MERCHANT) {
  const { rows } = await q(
    `select pool, available::text, reserved::text, total::text
     from merchant_account_pool_balance where merchant_id = $1 order by pool`,
    [merchantId],
  )
  const map: Record<string, number> = { cash: 0, voucher: 0, credit: 0 }
  for (const r of rows) map[r.pool] = Number(r.available)
  return map
}

async function accountRow(merchantId = MERCHANT) {
  const { rows } = await q(
    `select cash_balance::text, voucher_balance::text, credit_limit::text, credit_used::text
     from merchant_account where merchant_id = $1`,
    [merchantId],
  )
  return rows[0]
}

/**
 * 账实恒等：pool_balance.total == Σ 带符号流水（credit 正 / debit 负，只算 effect='available'）。
 * 直接复用生产侧的对账函数，避免测试里另写一份口径而两处对不上。
 */
async function assertLedgerConsistent(merchantId = MERCHANT) {
  const mismatches = await listMerchantPoolTotalMismatch(poolDb, { merchantId })
  assert.deepEqual(
    mismatches,
    [],
    `账实不符：${JSON.stringify(mismatches)}`,
  )
}

// 连接是文件级共享的：两个 suite 都用同一条 client，
// 若把 client.end() 放进任一 suite 的 after，后一个 suite 会拿到已关闭的连接。
before(async () => {
  if (!DATABASE_URL) return
  client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  db = drizzle(client)
  poolDb = drizzle(new pg.Pool({ connectionString: DATABASE_URL, max: 12 }))
  await seed()
})

after(async () => {
  if (!DATABASE_URL) return
  await cleanup()
  try {
    const { pool } = await import("../lib/db")
    await pool.end()
  } catch {
    /* 路由模块未加载时无连接池可关 */
  }
  await client.end()
  await (poolDb.$client as pg.Pool).end()
})

describeDb("M1 商户消费扣减（跨池）", () => {
  before(async () => {
    await cleanup()
    await seed()
  })

  it("跨池拆分：券 → 现金 → 授信，只记实际命中的池", async () => {
    await grant("voucher", 30, "split")
    await grant("cash", 50, "split")
    await setCreditLimit(200, "split")

    const r = await debitMerchantBalance(poolDb, {
      merchantId: MERCHANT,
      amount: 100,
      requestId: "req-split",
    })

    assert.equal(r.replay, false)
    assert.equal(r.amount, 100)
    assert.deepEqual(
      r.pools.map((p) => [p.pool, p.amount]),
      [
        ["voucher", 30],
        ["cash", 50],
        ["credit", 20],
      ],
      "扣减顺序必须是券 → 现金 → 授信",
    )

    const avail = await poolAvailables()
    assert.equal(avail.voucher, 0, "券池应被取尽")
    assert.equal(avail.cash, 0, "现金池应被取尽")
    assert.equal(avail.credit, 180)
    assert.equal(r.availableAfter, 180)
    await assertLedgerConsistent()
  })

  it("只扣一个池时不产生多余流水", async () => {
    await q(`delete from merchant_account_ledger where merchant_id = $1`, [MERCHANT])
    await q(`delete from merchant_account_pool_balance where merchant_id = $1`, [MERCHANT])
    await q(`delete from merchant_account where merchant_id = $1`, [MERCHANT])
    await grant("cash", 100, "single")

    const r = await debitMerchantBalance(poolDb, {
      merchantId: MERCHANT,
      amount: 40,
      requestId: "req-single",
    })
    assert.equal(r.pools.length, 1)
    const only = r.pools[0]!
    assert.equal(only.pool, "cash")
    assert.equal(only.amount, 40)
    assert.equal(only.balanceBefore, 100)
    assert.equal(only.balanceAfter, 60)
    assert.equal(
      (
        await q(`select count(*)::int as c from merchant_account_ledger where merchant_id = $1`, [
          MERCHANT,
        ])
      ).rows[0].c,
      2,
      "1 笔入账 + 1 笔扣减，不应有第 3 条",
    )
    await assertLedgerConsistent()
  })

  it("账户汇总与逐池实时值一致", async () => {
    const acc = await accountRow()
    const avail = await poolAvailables()
    assert.equal(Number(acc.cash_balance), avail.cash)
    assert.equal(Number(acc.voucher_balance), avail.voucher)
    // credit_used = creditLimit − 授信池可用
    assert.equal(
      Number(acc.credit_used),
      Math.max(0, Number(acc.credit_limit) - (avail.credit ?? 0)),
    )
  })

  it("allowCredit=false 时不动用授信池", async () => {
    await q(`delete from merchant_account_ledger where merchant_id = $1`, [MERCHANT])
    await q(`delete from merchant_account_pool_balance where merchant_id = $1`, [MERCHANT])
    await q(`delete from merchant_account where merchant_id = $1`, [MERCHANT])
    await grant("cash", 10, "nocredit")
    await setCreditLimit(1000, "nocredit")

    // 现金只有 10，授信有 1000；禁用授信后必须整笔拒绝
    await assert.rejects(
      () =>
        debitMerchantBalance(poolDb, {
          merchantId: MERCHANT,
          amount: 500,
          requestId: "req-nocredit",
          allowCredit: false,
        }),
      InsufficientMerchantTotalError,
    )
    const avail = await poolAvailables()
    assert.equal(avail.cash, 10, "拒绝后现金池不得变动")
    assert.equal(avail.credit, 1000, "拒绝后授信池不得变动")
  })

  it("额度不足整笔拒绝，不留半笔账", async () => {
    await q(`delete from merchant_account_ledger where merchant_id = $1`, [MERCHANT])
    await q(`delete from merchant_account_pool_balance where merchant_id = $1`, [MERCHANT])
    await q(`delete from merchant_account where merchant_id = $1`, [MERCHANT])
    await grant("voucher", 20, "short")
    await grant("cash", 30, "short")

    const before = await poolAvailables()
    const ledgersBefore = (
      await q(`select count(*)::int as c from merchant_account_ledger where merchant_id = $1`, [
        MERCHANT,
      ])
    ).rows[0].c

    await assert.rejects(
      () => debitMerchantBalance(poolDb, { merchantId: MERCHANT, amount: 100, requestId: "req-short" }),
      InsufficientMerchantTotalError,
    )

    const after = await poolAvailables()
    assert.deepEqual(after, before, "拒绝后各池可用额必须完全不变")
    const ledgersAfter = (
      await q(`select count(*)::int as c from merchant_account_ledger where merchant_id = $1`, [
        MERCHANT,
      ])
    ).rows[0].c
    assert.equal(ledgersAfter, ledgersBefore, "拒绝后不得写入任何流水（尤其不能只扣掉券）")
  })

  it("同 Idempotency-Key 重放不重复扣减", async () => {
    const first = await debitMerchantBalance(poolDb, {
      merchantId: MERCHANT,
      amount: 10,
      requestId: "req-replay",
    })
    const availAfterFirst = await poolAvailables()

    const second = await debitMerchantBalance(poolDb, {
      merchantId: MERCHANT,
      amount: 10,
      requestId: "req-replay",
    })
    assert.equal(first.replay, false)
    assert.equal(second.replay, true, "第二次应命中幂等")
    assert.deepEqual(await poolAvailables(), availAfterFirst, "重放不得改动余额")
    assert.deepEqual(
      second.pools.map((p) => p.ledgerId),
      first.pools.map((p) => p.ledgerId),
      "重放必须回放首次的流水 id",
    )
    assert.equal(second.availableBefore, first.availableBefore)
  })

  it("同 Idempotency-Key 但金额不同 → 冲突", async () => {
    await assert.rejects(
      () => debitMerchantBalance(poolDb, { merchantId: MERCHANT, amount: 999, requestId: "req-replay" }),
      IdempotencyConflictError,
    )
  })

  it("20 路并发同 key 只扣一次", async () => {
    const before = await poolAvailables()
    const beforeTotal = Object.values(before).reduce((a, b) => a + b, 0)

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        debitMerchantBalance(poolDb, { merchantId: MERCHANT, amount: 5, requestId: "req-concurrent" }),
      ),
    )

    const after = await poolAvailables()
    const afterTotal = Object.values(after).reduce((a, b) => a + b, 0)
    assert.equal(beforeTotal - afterTotal, 5, "并发只应真实扣减一次")
    assert.equal(results.filter((r) => r.replay === false).length, 1, "只有一次是真实扣减")
    assert.equal(results.filter((r) => r.replay === true).length, 19)
  })

  it("跨商户隔离：商户 B 的余额不受商户 A 消费影响", async () => {
    await postMerchantLedger(poolDb, {
      merchantId: OTHER_MERCHANT,
      pool: "cash",
      direction: "credit",
      amount: 500,
      refType: "adjust",
      idempotencyKey: "test-grant-other",
    })
    const otherBefore = await poolAvailables(OTHER_MERCHANT)
    await debitMerchantBalance(poolDb, { merchantId: MERCHANT, amount: 5, requestId: "req-iso" })
    assert.deepEqual(await poolAvailables(OTHER_MERCHANT), otherBefore)
  })

  it("参数非法直接抛错", async () => {
    for (const bad of [0, -1, Number.NaN]) {
      await assert.rejects(
        () => debitMerchantBalance(poolDb, { merchantId: MERCHANT, amount: bad, requestId: "req-bad" }),
        /amount 必须为正数/,
      )
    }
    await assert.rejects(
      () => debitMerchantBalance(poolDb, { merchantId: MERCHANT, amount: 1, requestId: "  " }),
      /requestId/,
    )
  })
})

describeDb("POST /api/v1/consumption/debit 端点契约", () => {
  let app: any
  let apiKey: string
  let readOnlyKey: string

  before(async () => {
    // 路由模块会建 db 连接池，env 必须先备齐
    process.env.DATABASE_URL = DATABASE_URL
    process.env.BETTER_AUTH_SECRET ??= "consume-test-secret"
    process.env.AGENT_API_KEY ??= "consume-test-agent-key"
    const mod = await import("../routes/consumption")
    app = mod.default

    await cleanup()
    await seed()
    await postMerchantLedger(poolDb, {
      merchantId: MERCHANT,
      pool: "cash",
      direction: "credit",
      amount: 1000,
      refType: "adjust",
      idempotencyKey: "test-grant-endpoint",
    })

    const k1 = await createMerchantApiKey(poolDb, {
      merchantId: MERCHANT,
      name: `${MERCHANT_PREFIX}write`,
      scopes: ["consumption:write"],
    })
    apiKey = k1.plaintext
    const k2 = await createMerchantApiKey(poolDb, {
      merchantId: MERCHANT,
      name: `${MERCHANT_PREFIX}readonly`,
      scopes: ["balance:read"],
    })
    readOnlyKey = k2.plaintext
  })

  const post = (body: unknown, key: string | null, idem?: string) =>
    app.request("/debit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(idem ? { "Idempotency-Key": idem } : {}),
      },
      body: JSON.stringify(body),
    })

  it("无凭证 → 401", async () => {
    const res = await post({ amount: 1, request_id: "x" }, null, "k-401")
    assert.equal(res.status, 401)
  })

  it("scope 不足 → 403 且带 requiredScope", async () => {
    const res = await post({ amount: 1, request_id: "x" }, readOnlyKey, "k-403")
    assert.equal(res.status, 403)
    const body = (await res.json()) as Record<string, unknown>
    assert.equal(body.requiredScope, "consumption:write")
  })

  it("缺 Idempotency-Key → 400", async () => {
    const res = await post({ amount: 1, request_id: "x" }, apiKey)
    assert.equal(res.status, 400)
    const body = (await res.json()) as Record<string, unknown>
    assert.equal(body.code, "IDEMPOTENCY_KEY_REQUIRED")
  })

  it("扣减成功返回逐池明细与 balance_after", async () => {
    const res = await post({ amount: 12.5, request_id: "consume-http-1" }, apiKey, "idem-http-1")
    assert.equal(res.status, 200)
    assert.equal(res.headers.get("X-Idempotent-Replay"), "false")
    const body = (await res.json()) as Record<string, any>
    assert.equal(body.amount, 12.5)
    assert.equal(body.replay, false)
    assert.equal(body.request_id, "idem-http-1")
    assert.ok(body.ledger_id)
    assert.ok(Array.isArray(body.pools) && body.pools.length > 0)
    assert.equal(
      body.pools.reduce((s: number, p: { amount: number }) => s + p.amount, 0),
      12.5,
    )
  })

  it("重放：X-Idempotent-Replay=true 且余额不变", async () => {
    const res = await post({ amount: 7, request_id: "consume-http-2" }, apiKey, "idem-http-2")
    assert.equal(res.status, 200)
    const first = (await res.json()) as Record<string, any>
    assert.equal(first.replay, false)
    // 快照取「首次扣减之后」：首次扣钱是预期行为，重放不得再扣
    const afterFirst = await poolAvailables()

    const res2 = await post({ amount: 7, request_id: "consume-http-2" }, apiKey, "idem-http-2")
    assert.equal(res2.status, 200)
    assert.equal(res2.headers.get("X-Idempotent-Replay"), "true", "重放必须带响应头")
    const second = (await res2.json()) as Record<string, any>
    assert.equal(second.replay, true)
    assert.equal(second.ledger_id, first.ledger_id, "重放必须回放首次流水 id")
    assert.deepEqual(await poolAvailables(), afterFirst, "重放不得再扣钱")
  })

  it("同 key 不同金额 → 409", async () => {
    await post({ amount: 3, request_id: "consume-http-3" }, apiKey, "idem-http-3")
    const res = await post({ amount: 999, request_id: "consume-http-3" }, apiKey, "idem-http-3")
    assert.equal(res.status, 409)
    const body = (await res.json()) as Record<string, unknown>
    assert.equal(body.code, "IDEMPOTENCY_CONFLICT")
  })

  it("额度不足 → 402，且不部分扣减", async () => {
    const before = await poolAvailables()
    const res = await post({ amount: 9_999_999, request_id: "consume-http-4" }, apiKey, "idem-http-4")
    assert.equal(res.status, 402)
    const body = (await res.json()) as Record<string, unknown>
    assert.equal(body.code, "INSUFFICIENT_BALANCE")
    assert.deepEqual(await poolAvailables(), before, "402 后余额不得有任何变化")
  })

  it("金额非法 → 400", async () => {
    for (const amount of [0, -5]) {
      const res = await post({ amount, request_id: "consume-http-5" }, apiKey, `idem-bad-${amount}`)
      assert.equal(res.status, 400, `amount=${amount} 应被拒`)
    }
  })
})
