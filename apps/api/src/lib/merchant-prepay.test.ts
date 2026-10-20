/**
 * M1 商户预付回归测试（需真实 DATABASE_URL）
 *
 * 放在 apps/api 而非 packages/billing：billing 未依赖 pg，而 apps/api 同时依赖
 * @workspace/billing 与 pg，与 balance-idempotency.test.ts 同一约定。
 *
 * 覆盖的「资金事故」场景：
 *   - 预付到账落 merchant cash 池，绝不进 tenant 余额
 *   - 回调重投 / 20 路并发重投只入账一次
 *   - 金额与订单不符时拒绝到账，订单保持 pending
 *   - 付款方守卫：租户单不能被当商户预付入账，反之亦然
 *   - 低于最低预付额硬阻断
 *   - 退款冲回 cash 池且幂等
 *   - 账实恒等：pool_balance.total == Σ ledger.amount
 *
 * 测试数据完全自建（含 merchant 行），不依赖任何既有 seed。
 */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import {
  createMerchantPrepay,
  handleMerchantPrepayCallback,
  refundMerchantPrepay,
  listMerchantPrepayOrders,
  getMerchantPrepayAccount,
  merchantPrepayIdempotencyKey,
  MERCHANT_PREPAY_MIN_AMOUNT,
  PaymentAmountMismatchError,
} from "@workspace/billing"
import { createPaymentOrder } from "@workspace/billing"
import { handlePaymentCallback } from "@workspace/billing"
import { listMerchantPoolTotalMismatch } from "@workspace/billing"

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

/** 测试商户（merchant_account_ledger 有 FK→merchant.id，故必须是库中真实行） */
const MERCHANT = "00000000-0000-4000-8000-00000000m101"
const OTHER_MERCHANT = "00000000-0000-4000-8000-00000000m102"
/** 测试租户（走 tenant 付款方分支） */
const TENANT = "00000000-0000-4000-8000-00000000t101"
const TENANT_ORG = "00000000-0000-4000-8000-00000000t101"

let client: pg.Client
let db: any
/**
 * 池化连接：**仅供并发用例**。
 *
 * 单个 pg.Client 只能承载一个事务，20 路 Promise.all 会把 20 个
 * db.transaction() 挤进同一条连接互相踩（pg 直接告警
 * "client.query() when already executing a query"，并报 25P02
 * current transaction is aborted）——那测的是 harness 缺陷，不是幂等。
 * 走 Pool 才能让每个事务拿到独立连接，等价于线上真实并发。
 */
let poolDb: any

const q = (sql: string, params: any[] = []) => client.query(sql, params)

/** 删干净本文件所有数据（含并发测试可能遗留的） */
async function cleanup() {
  await q(
    `delete from merchant_account_ledger
     where merchant_id in ($1, $2)`,
    [MERCHANT, OTHER_MERCHANT],
  )
  await q(
    `delete from payment_order
     where merchant_id in ($1, $2) or tenant_id = $3`,
    [MERCHANT, OTHER_MERCHANT, TENANT],
  )
  await q(
    `delete from merchant_account_pool_balance where merchant_id in ($1, $2)`,
    [MERCHANT, OTHER_MERCHANT],
  )
  await q(`delete from merchant_account where merchant_id in ($1, $2)`, [
    MERCHANT,
    OTHER_MERCHANT,
  ])
  await q(`delete from tenant where id = $1`, [TENANT])
  await q(`delete from merchant where id in ($1, $2)`, [MERCHANT, OTHER_MERCHANT])
}

/** 按稳定前缀标记本文件的 merchant 行，cleanup 只清自己造的 */
const MERCHANT_PREFIX = "m1-prepay-test-"

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
  await q(
    `insert into tenant (id, name, merchant_id, is_default, status, balance, type, created_at, updated_at)
     values ($1, $2, $3, true, 'active', 0, 'external', now(), now())
     on conflict (id) do nothing`,
    [TENANT, MERCHANT_PREFIX + "tenant", MERCHANT],
  )
}

describeDb("M1 商户预付", () => {
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

  it("预付到账进 merchant cash 池，不带 tenant", async () => {
    const { order, idempotencyKey } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 50_000,
      paymentMethod: "bank_transfer",
    })
    assert.equal(order.scene, "merchant_prepay")
    assert.equal(order.merchantId, MERCHANT)
    assert.equal(order.tenantId, null, "商户预付单不应有 tenant_id")
    assert.equal(order.status, "pending")
    assert.equal(idempotencyKey, merchantPrepayIdempotencyKey(order.id))

    const r = await handleMerchantPrepayCallback(db, {
      orderNo: order.orderNo,
      channelOrderNo: "ch-" + order.orderNo,
      channelStatus: "SUCCESS",
      paidAmount: 50_000,
    })
    assert.equal(r.outcome, "credited")
    assert.equal(r.replay, false)
    assert.equal(r.poolBalance.pool, "cash")
    assert.equal(Number(r.poolBalance.available), 50_000)
    assert.equal(r.ledger.refType, "prepay")
    assert.equal(Number(r.account.cashBalance), 50_000)

    // 账户必须存在于 merchant_account，而非 tenant_balance
    const { rows: acctRows } = await q(`select cash_balance from merchant_account where merchant_id=$1`, [MERCHANT])
    const acct = acctRows[0]
    assert.equal(Number(acct.cash_balance), 50_000)
  })

  it("回调重投只入账一次（幂等）", async () => {
    const { order } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 1_000,
      paymentMethod: "wechat",
    })
    const first = await handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: 1_000 })
    const second = await handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: 1_000 })
    const third = await handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: 1_000 })

    assert.equal(first.replay, false)
    assert.equal(second.replay, true)
    assert.equal(third.replay, true)
    assert.equal(second.outcome, "already_credited")

    const { rows } = await q(
      `select count(*)::int as n from merchant_account_ledger where idempotency_key=$1`,
      [merchantPrepayIdempotencyKey(order.id)],
    )
    assert.equal(rows[0].n, 1, "三次回调只能有一条流水")
  })

  it("20 路并发重投只入账一次", async () => {
    const { order } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 2_000,
      paymentMethod: "alipay",
    })
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        handleMerchantPrepayCallback(poolDb, { orderNo: order.orderNo, paidAmount: 2_000 }),
      ),
    )
    const credited = results.filter((r) => r.replay === false)
    assert.equal(credited.length, 1, `应恰好 1 次真实入账，实际 ${credited.length}`)

    const { rows } = await q(
      `select count(*)::int as n from merchant_account_ledger where idempotency_key=$1`,
      [merchantPrepayIdempotencyKey(order.id)],
    )
    assert.equal(rows[0].n, 1)

    // 账户总额 = 50000 + 1000 + 2000，没有多记
    const acct = await getMerchantPrepayAccount(db, MERCHANT)
    assert.equal(acct.availableTotal, 53_000)
  })

  it("金额不符拒绝到账，订单保持 pending", async () => {
    const { order } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 3_000,
      paymentMethod: "wechat",
    })
    await assert.rejects(
      () => handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: 2_999.99 }),
      (e: unknown) => e instanceof PaymentAmountMismatchError,
    )
    const { rows: afterRows } = await q(`select status from payment_order where id=$1`, [order.id])
    const after = afterRows[0]
    assert.equal(after.status, "pending", "金额不符时订单必须保持 pending")

    const { rows } = await q(
      `select count(*)::int as n from merchant_account_ledger where idempotency_key=$1`,
      [merchantPrepayIdempotencyKey(order.id)],
    )
    assert.equal(rows[0].n, 0, "金额不符不得产生流水")
  })

  it("低于最低预付额被硬阻断", async () => {
    await assert.rejects(
      () =>
        createMerchantPrepay(db, {
          merchantId: MERCHANT,
          amount: MERCHANT_PREPAY_MIN_AMOUNT - 0.01,
          paymentMethod: "wechat",
        }),
      /低于最低预付额/,
    )
    await assert.rejects(
      () => createMerchantPrepay(db, { merchantId: MERCHANT, amount: 0, paymentMethod: "wechat" }),
      /必须为正数/,
    )
  })

  it("付款方守卫：租户单不能走商户预付回调", async () => {
    const order = await createPaymentOrder(db, {
      tenantId: TENANT,
      scene: "recharge",
      amount: 500,
      paymentMethod: "wechat",
      expiredAt: new Date(Date.now() + 600_000),
    })
    assert.equal(order.tenantId, TENANT)
    assert.equal(order.merchantId, null)
    await assert.rejects(
      () => handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: 500 }),
      /不是 merchant_prepay/,
    )
  })

  it("付款方守卫：商户单不能入 tenant 余额", async () => {
    const { order } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 777,
      paymentMethod: "wechat",
    })
    await assert.rejects(
      () =>
        handlePaymentCallback(db, {
          orderNo: order.orderNo,
          organizationId: TENANT_ORG,
          paidAmount: 777,
        }),
      /no tenant payer/,
    )
  })

  it("商户不匹配时拒绝入账（防串号）", async () => {
    const { order } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 888,
      paymentMethod: "wechat",
    })
    await assert.rejects(
      () =>
        handleMerchantPrepayCallback(db, {
          orderNo: order.orderNo,
          merchantId: OTHER_MERCHANT,
          paidAmount: 888,
        }),
      /付款商户不匹配/,
    )
  })

  it("退款冲回 cash 池且幂等", async () => {
    const { order } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 5_000,
      paymentMethod: "bank_transfer",
    })
    await handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: 5_000 })

    const before = await getMerchantPrepayAccount(db, MERCHANT)
    const r1 = await refundMerchantPrepay(db, {
      orderNo: order.orderNo,
      amount: 1_000,
      idempotencyKey: `refund-${order.id}-1`,
    })
    assert.equal(r1.replay, false)
    const r2 = await refundMerchantPrepay(db, {
      orderNo: order.orderNo,
      amount: 1_000,
      idempotencyKey: `refund-${order.id}-1`,
    })
    assert.equal(r2.replay, true, "同幂等键重复退款必须回放")

    const after = await getMerchantPrepayAccount(db, MERCHANT)
    assert.equal(after.availableTotal, before.availableTotal - 1_000, "只应退一次 1000")

    // 退款额超过剩余可退（已退 1000，实付 5000）
    await assert.rejects(
      () =>
        refundMerchantPrepay(db, {
          orderNo: order.orderNo,
          amount: 4_001,
          idempotencyKey: `refund-${order.id}-2`,
        }),
      /超过可退余额/,
    )
  })

  it("全额退款后订单置为 refunded", async () => {
    const { order } = await createMerchantPrepay(db, {
      merchantId: MERCHANT,
      amount: 4_000,
      paymentMethod: "bank_transfer",
    })
    await handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: 4_000 })
    await refundMerchantPrepay(db, {
      orderNo: order.orderNo,
      amount: 4_000,
      idempotencyKey: `refund-full-${order.id}`,
    })
    const { rows: afterRows } = await q(`select status from payment_order where id=$1`, [order.id])
    const after = afterRows[0]
    assert.equal(after.status, "refunded")
    await assert.rejects(
      () =>
        refundMerchantPrepay(db, {
          orderNo: order.orderNo,
          amount: 1,
          idempotencyKey: `refund-after-full-${order.id}`,
        }),
      /不可退款/,
    )
  })

  it("预付单列表按商户隔离且 DB 级分页", async () => {
    const page1 = await listMerchantPrepayOrders(db, { merchantId: MERCHANT, page: 1, pageSize: 2 })
    assert.equal(page1.pageSize, 2)
    assert.ok(page1.total >= 5, `预付单应 >=5，实际 ${page1.total}`)
    assert.ok(page1.items.length <= 2)
    for (const row of page1.items) {
      assert.equal(row.merchantId, MERCHANT)
      assert.equal(row.scene, "merchant_prepay")
    }
    const other = await listMerchantPrepayOrders(db, { merchantId: OTHER_MERCHANT })
    assert.equal(other.total, 0, "商户间必须完全隔离")
  })

  it("账实恒等：pool_balance.total == Σ ledger.amount", async () => {
    const mismatches = await listMerchantPoolTotalMismatch(db, { merchantId: MERCHANT })
    assert.deepEqual(mismatches, [], `实时值与流水不一致：${JSON.stringify(mismatches)}`)
  })
})
