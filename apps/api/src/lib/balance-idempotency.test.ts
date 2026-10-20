/**
 * `debitBalance` 幂等竞态回归测试（P0-7）
 *
 * 这个 bug 很隐蔽：靠 `Promise.all` 并发调用**撞不出来**。原因是同租户请求会被
 * `tenant_balance` 的 FOR UPDATE 行锁串行化，且多数请求在事务开头做幂等前置检查时
 * 就已经能看到赢家插入的流水。旧实现「先扣余额、后插流水」只在下面这个窗口里出事：
 *
 *   T1  前置检查(未命中) → [T2 完整跑完并提交] → 才取到行锁
 *   T2  插流水占用幂等键 → 提交
 *   T1  取到行锁读到的是「已扣过」的余额 → 又扣一次 → 插流水才冲突
 *   旧实现此时返回 replayed=true 且把第二次扣款一并提交
 *   → 余额少 20，流水却只有 1 条 -10，账实不符（且对调用方谎称已回放）
 *
 * 用一个独立连接当「锁闸门」压住余额行，把 T1/T2 确定性地排成队列，
 * 窗口就 100% 可复现。修复后的顺序是「先插流水占用幂等键，再改余额」，
 * 冲突时余额一行未动。
 *
 * 需要可用的 Postgres；无 DATABASE_URL 时整组跳过，不阻塞 CI。
 */

import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { creditBalance, debitBalance, getOrCreateTenantBalance } from "@workspace/billing"

const CONN = process.env.DATABASE_URL
const enabled = Boolean(CONN)

describe("debitBalance 幂等：并发只扣一次", { skip: enabled ? false : "需要 DATABASE_URL" }, () => {
  const TENANT = `p07-it-${randomUUID().slice(0, 8)}`
  const ORG = `p07-it-org-${randomUUID().slice(0, 8)}`
  const KEY = `p07-it-key-${randomUUID().slice(0, 8)}`
  const START = 1000
  const AMOUNT = 10

  let client: pg.Client
  let db: ReturnType<typeof drizzle>
  const available = async () =>
    Number(
      (
        await client.query(`select available_balance from tenant_balance where organization_id = $1`, [ORG])
      ).rows[0].available_balance,
    )
  const cleanup = async () => {
    await client.query(`delete from balance_transaction where idempotency_key = $1`, [KEY])
    await client.query(`delete from balance_transaction where organization_id = $1`, [ORG])
    await client.query(`delete from tenant_balance where organization_id = $1`, [ORG])
  }

  before(async () => {
    client = new pg.Client({ connectionString: CONN })
    await client.connect()
    db = drizzle(client) as never
    await cleanup()
    await client.query(
      `insert into tenant (id, name, merchant_id, status, is_default, created_at, updated_at)
       values ($1, 'P0-7 幂等回归测试', 'merchant-demo', 'active', false, now(), now())
       on conflict (id) do nothing`,
      [TENANT],
    )
  })

  after(async () => {
    if (!client) return
    await cleanup()
    await client.query(`delete from tenant where id = $1`, [TENANT])
    await client.end()
  })

  it("50 个真并发同 key 请求：只扣一次，其余回放", async () => {
    await cleanup()
    await getOrCreateTenantBalance(db as never, TENANT, ORG)
    await creditBalance(db as never, { tenantId: TENANT, organizationId: ORG, amount: START, txType: "recharge" })

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        debitBalance(db as never, {
          tenantId: TENANT,
          organizationId: ORG,
          amount: AMOUNT,
          txType: "deduction",
          idempotencyKey: KEY,
          refType: "compute_base",
          refId: "concurrent-task",
        }),
      ),
    )

    assert.equal(results.filter((r) => r?.replayed === false).length, 1, "恰好一次真正扣款")
    assert.equal(results.filter((r) => r?.replayed === true).length, 49, "其余全部回放")

    const { rows } = await client.query(
      `select count(*)::int as n, coalesce(sum(abs(amount)), 0) as s
       from balance_transaction where idempotency_key = $1`,
      [KEY],
    )
    assert.equal(rows[0].n, 1, "同 key 只有一条流水")
    assert.equal(Number(rows[0].s), AMOUNT, "流水累计只扣一次")
    assert.equal(await available(), START - AMOUNT, "余额只扣一次")
  })

  it("锁闸门确定性交错：账实相符，不重复扣款", async () => {
    await cleanup()
    await getOrCreateTenantBalance(db as never, TENANT, ORG)
    await creditBalance(db as never, { tenantId: TENANT, organizationId: ORG, amount: START, txType: "recharge" })

    // 闸门：独立连接压住余额行，把 T1/T2 排成确定顺序
    const gate = new pg.Client({ connectionString: CONN })
    await gate.connect()
    await gate.query("begin")
    await gate.query(`select tenant_id from tenant_balance where tenant_id = $1 for update`, [TENANT])

    const call = () =>
      debitBalance(db as never, {
        tenantId: TENANT,
        organizationId: ORG,
        amount: AMOUNT,
        txType: "deduction",
        idempotencyKey: KEY,
        refType: "compute_base",
        refId: "same-task",
      }).then(
        (r) => ({ ok: true as const, replayed: r?.replayed === true }),
        (e: Error) => ({ ok: false as const, msg: e.message }),
      )

    const p1 = call()
    await new Promise((r) => setTimeout(r, 300))
    const p2 = call()
    await new Promise((r) => setTimeout(r, 300))

    await gate.query("commit")
    await gate.end()
    const [r1, r2] = await Promise.all([p1, p2])

    const { rows } = await client.query(
      `select count(*)::int as n, coalesce(sum(abs(amount)), 0) as s
       from balance_transaction where idempotency_key = $1`,
      [KEY],
    )
    const ledger = Number(rows[0].s)
    const bal = await available()

    assert.equal(rows[0].n, 1, "同 key 只有一条流水")
    assert.equal(ledger, AMOUNT, "流水累计只扣一次")
    // 核心断言：余额必须与流水一致。旧实现此处 bal=980 而 ledger=10，账实不符
    assert.equal(bal, START - ledger, "余额与流水一致（账实相符）")
    assert.equal(bal, START - AMOUNT, "余额只扣一次")
    assert.equal([r1, r2].filter((r) => r.ok && !r.replayed).length, 1, "恰好一个请求真正扣款")
    assert.equal([r1, r2].filter((r) => r.ok && r.replayed).length, 1, "另一个请求回放")
  })

  it("同 key 金额不一致：报 IDEMPOTENCY_KEY_CONFLICT，不静默回放", async () => {
    await cleanup()
    await getOrCreateTenantBalance(db as never, TENANT, ORG)
    await creditBalance(db as never, { tenantId: TENANT, organizationId: ORG, amount: START, txType: "recharge" })

    const call = (amount: number) =>
      debitBalance(db as never, {
        tenantId: TENANT,
        organizationId: ORG,
        amount,
        txType: "deduction",
        idempotencyKey: KEY,
        refType: "compute_base",
        refId: "same-task",
      }).then(
        (r) => ({ ok: true as const, replayed: r?.replayed === true }),
        (e: Error) => ({ ok: false as const, msg: e.message }),
      )

    const settled = await Promise.all([call(AMOUNT), call(999), call(999)])
    const rejected = settled.filter((r) => !r.ok)
    assert.ok(rejected.length >= 1, "金额不一致的请求被拒")
    for (const r of rejected) {
      assert.match(r.msg, /IDEMPOTENCY_KEY_CONFLICT/)
    }

    const { rows } = await client.query(
      `select count(*)::int as n, min(abs(amount)) as a from balance_transaction where idempotency_key = $1`,
      [KEY],
    )
    assert.equal(rows[0].n, 1, "该 key 下只有一条流水")
    // 余额 = 1000 - 赢家那一笔，绝不能出现 10 与 999 叠加
    assert.equal(await available(), START - Number(rows[0].a), "余额只被扣了赢家那一笔")
  })

  it("余额不足返回 null，不留下占用幂等键的脏流水", async () => {
    await cleanup()
    await getOrCreateTenantBalance(db as never, TENANT, ORG)
    await creditBalance(db as never, { tenantId: TENANT, organizationId: ORG, amount: 5, txType: "recharge" })

    const call = () =>
      debitBalance(db as never, {
        tenantId: TENANT,
        organizationId: ORG,
        amount: 100,
        txType: "deduction",
        idempotencyKey: KEY,
        refType: "compute_base",
        refId: "same-task",
      })
    assert.equal(await call(), null)
    assert.equal(await call(), null)

    const { rows } = await client.query(`select count(*)::int as n from balance_transaction where idempotency_key = $1`, [
      KEY,
    ])
    assert.equal(rows[0].n, 0, "失败的尝试没有占死幂等键")
    assert.equal(await available(), 5, "余额未变")

    // 充值后同一 key 应能正常扣款
    await creditBalance(db as never, { tenantId: TENANT, organizationId: ORG, amount: 1000, txType: "recharge" })
    const ok = await call()
    assert.ok(ok && ok.replayed === false, "充值后同 key 可正常扣款")
  })
})
