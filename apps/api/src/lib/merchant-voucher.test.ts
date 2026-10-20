/**
 * 算力券全生命周期回归测试（需真实 DATABASE_URL）
 *
 * 放在 apps/api：与 merchant-prepay.test.ts 同一约定（billing 自身不带 pg 驱动）。
 *
 * 这组用例守的是「钱不会凭空出现或消失」：
 *   - 采购是**内部搬运**（cash → voucher），商户可用总额不变
 *   - 发放即冻结：券额度不足时**发不出券**（不会超发）
 *   - 核销按券面额扣商户 reserved，total 同步减少
 *   - 部分核销后剩余额度正确；并发核销不会把券扣成负数
 *   - 过期回收只释放**剩余**额度（已核销部分不还给商户）
 *   - 最低消费门槛（minAmount）在核销侧真的生效，且缺订单金额时拦下
 *   - 幂等：同 requestId 重复发放/采购/核销只生效一次
 *   - 账实恒等：pool_balance.total == Σ ledger.amount（每一步都断言）
 */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import {
  purchaseMerchantVoucher,
  grantMerchantCoupon,
  redeemMerchantCoupon,
  expireMerchantCoupon,
  listMerchantCoupons,
  listCouponRedemptions,
  listTenantUsableCoupons,
  CouponOverdrawError,
  CouponNotUsableError,
  CouponExpiredError,
  CouponNotFoundError,
  CouponMinAmountNotMetError,
} from "@workspace/billing"

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

const MERCHANT = "00000000-0000-4000-8000-00000000v101"
const MERCHANT_B = "00000000-0000-4000-8000-00000000v102"
const TENANT_A = "00000000-0000-4000-8000-00000000vt01"
const TENANT_B = "00000000-0000-4000-8000-00000000vt02"
const PREFIX = "p3-voucher-test-"

let client: pg.Client
let db: any
let poolDb: any

const q = (sql: string, params: any[] = []) => client.query(sql, params)

async function cleanup() {
  await q(`delete from coupon where merchant_id in ($1, $2)`, [MERCHANT, MERCHANT_B])
  await q(`delete from merchant_account_ledger where merchant_id in ($1, $2)`, [
    MERCHANT,
    MERCHANT_B,
  ])
  await q(`delete from payment_order where merchant_id in ($1, $2)`, [
    MERCHANT,
    MERCHANT_B,
  ])
  await q(`delete from merchant_account_pool_balance where merchant_id in ($1, $2)`, [
    MERCHANT,
    MERCHANT_B,
  ])
  await q(`delete from merchant_account where merchant_id in ($1, $2)`, [
    MERCHANT,
    MERCHANT_B,
  ])
  await q(`delete from tenant where id in ($1, $2)`, [TENANT_A, TENANT_B])
  await q(`delete from merchant where id in ($1, $2)`, [MERCHANT, MERCHANT_B])
}

async function seed() {
  await cleanup()
  for (const [id, name] of [
    [MERCHANT, `${PREFIX}a`],
    [MERCHANT_B, `${PREFIX}b`],
  ] as const) {
    await q(
      `insert into merchant (id, code, name, company_full_name, access_mode, type, status, created_at, updated_at)
       values ($1, $2, $2, $2, 'oem', 'oem', 'active', now(), now())
       on conflict (id) do nothing`,
      [id, name],
    )
  }
  for (const [id, name, mid] of [
    [TENANT_A, `${PREFIX}tenant-a`, MERCHANT],
    [TENANT_B, `${PREFIX}tenant-b`, MERCHANT_B],
  ] as const) {
    await q(
      `insert into tenant (id, name, merchant_id, is_default, status, balance, type, created_at, updated_at)
       values ($1, $2, $3, true, 'active', 0, 'external', now(), now())
       on conflict (id) do nothing`,
      [id, name, mid],
    )
  }
}

interface Pools {
  cash: number
  voucher: number
  credit: number
  total: number
  available: number
  reserved: number
}

/**
 * 直接读池余额表而不是 `MerchantAccountRow`：
 * 后者只有 cash/voucher/available 与 creditLimit/creditUsed，没有 total/reserved，
 * 而本组断言的核心恰恰是「total 随核销减少、reserved 随发放增加」。
 */
async function pools(merchantId = MERCHANT): Promise<Pools> {
  const { rows } = await q(
    `select pool, available, reserved, total
     from merchant_account_pool_balance where merchant_id=$1`,
    [merchantId],
  )
  const by = new Map<string, { available: number; reserved: number; total: number }>()
  for (const r of rows) {
    by.set(r.pool, {
      available: Number(r.available),
      reserved: Number(r.reserved),
      total: Number(r.total),
    })
  }
  const sum = (pick: (v: { available: number; reserved: number; total: number }) => number) =>
    [...by.values()].reduce((s, v) => s + pick(v), 0)
  const of = (pool: string) => by.get(pool) ?? { available: 0, reserved: 0, total: 0 }
  return {
    cash: of("cash").available,
    voucher: of("voucher").available,
    credit: of("credit").available,
    total: sum((v) => v.total),
    available: sum((v) => v.available),
    reserved: sum((v) => v.reserved),
  }
}

/**
 * 账实恒等（对账第 0 环）。
 *
 * 三个恒等式都从流水重算，与 `computePoolMovement`（merchant-account-math.ts）的
 * 语义逐条对齐：
 *
 *   · `availableDelta = signed` **无条件成立**（merchant-account-math.ts:191）
 *     —— 冻结（effect=reserved & debit）也会把可用额带走。所以 available 要对
 *     **全部**流水求净额，不能只算 effect='available' 的那些。
 *   · `totalDelta = effect === 'reserved' ? 0 : signed` —— total 只被真实流入流出改变。
 *   · `reservedDelta = effect === 'reserved' ? -signed : 0`
 *
 * 另注：`ledger.amount` 恒为正，正负由 `direction` 表达，故必须带符号求和。
 */
async function assertLedgerConsistent(merchantId = MERCHANT) {
  const { rows } = await q(
    `select pb.pool, pb.total, pb.available, pb.reserved,
            coalesce(agg.avail_net, 0) as avail_net,
            coalesce(agg.total_net, 0) as total_net,
            coalesce(agg.resv_net, 0)  as resv_net
     from merchant_account_pool_balance pb
     left join lateral (
       select
         sum(case when l.direction='credit' then l.amount else -l.amount end) as avail_net,
         sum(case when l.direction='credit' then l.amount else -l.amount end)
           filter (where l.effect = 'available') as total_net,
         sum(case when l.direction='debit' then l.amount else -l.amount end)
           filter (where l.effect = 'reserved') as resv_net
       from merchant_account_ledger l
       where l.merchant_id = pb.merchant_id and l.pool = pb.pool
     ) agg on true
     where pb.merchant_id = $1`,
    [merchantId],
  )
  for (const r of rows) {
    assert.ok(
      Math.abs(Number(r.available) - Number(r.avail_net)) < 0.0001,
      `池 ${r.pool}：available=${r.available} ≠ Σ全部流水净额=${r.avail_net}`,
    )
    assert.ok(
      Math.abs(Number(r.total) - Number(r.total_net)) < 0.0001,
      `池 ${r.pool}：total=${r.total} ≠ Σavailable-effect净额=${r.total_net}`,
    )
    assert.ok(
      Math.abs(Number(r.reserved) - Number(r.resv_net)) < 0.0001,
      `池 ${r.pool}：reserved=${r.reserved} ≠ Σreserved-effect净额=${r.resv_net}`,
    )
    // 结构性恒等：total = available + reserved
    assert.ok(
      Math.abs(
        Number(r.total) - (Number(r.available) + Number(r.reserved)),
      ) < 0.0001,
      `池 ${r.pool}：total ≠ available + reserved（${r.total} vs ${r.available}+${r.reserved}）`,
    )
  }
}

async function grantCash(merchantId: string, amount: number) {
  const { createMerchantPrepay, handleMerchantPrepayCallback } = await import(
    "@workspace/billing"
  )
  const { order } = await createMerchantPrepay(db, {
    merchantId,
    amount,
    paymentMethod: "bank_transfer",
  })
  await handleMerchantPrepayCallback(db, { orderNo: order.orderNo, paidAmount: amount })
}

describeDb("算力券 采购/发放/核销/回收", () => {
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

  it("采购是内部搬运：cash 减少、voucher 等量增加，可用总额不变", async () => {
    await grantCash(MERCHANT, 100_000)
    const before = await pools()

    const r = await purchaseMerchantVoucher(db, {
      merchantId: MERCHANT,
      amount: 40_000,
      requestId: "REQ-P1",
    })

    const after = await pools()
    assert.equal(r.amount, 40_000)
    assert.equal(after.cash, before.cash - 40_000, "cash 没扣")
    assert.equal(after.voucher, before.voucher + 40_000, "voucher 没加")
    assert.equal(
      after.total,
      before.total,
      "采购改变了商户资产总额（应是内部搬运）",
    )
    assert.equal(
      after.available,
      before.available,
      "采购改变了可用总额（应是内部搬运）",
    )
    await assertLedgerConsistent()
  })

  it("采购幂等：同 requestId 不重复搬运", async () => {
    const before = await pools()
    const again = await purchaseMerchantVoucher(db, {
      merchantId: MERCHANT,
      amount: 40_000,
      requestId: "REQ-P1",
    })
    const after = await pools()

    assert.equal(again.replay, true, "重复采购未被识别为重放")
    assert.equal(after.voucher, before.voucher, "重复采购多加了券额度")
    assert.equal(after.cash, before.cash, "重复采购多扣了现金")
    await assertLedgerConsistent()
  })

  it("券额度不足时发不出券（不超发）", async () => {
    const p = await pools()
    // 前置：充值 100000 后采购过一次 40000 → 券可用 40000
    assert.equal(p.voucher, 40_000, "前置条件不符：券额度应恰好 40000")

    await assert.rejects(
      () =>
        grantMerchantCoupon(db, {
          merchantId: MERCHANT,
          tenantId: TENANT_A,
          amount: 100_000, // 超过券额度
          name: "超额券",
          requestId: "REQ-G-OVER",
        }),
      (err: unknown) => {
        assert.equal(
          (err as { code?: string })?.code,
          "INSUFFICIENT_BALANCE",
          `券额度不足时抛了非预期错误：${(err as Error)?.name} / ${(err as Error)?.message}`,
        )
        return true
      },
    )

    const { rows } = await q(`select count(*)::int as n from coupon where name='超额券'`)
    assert.equal(rows[0].n, 0, "超发失败却留下了券行")
    await assertLedgerConsistent()
  })

  it("发放：券额度 available→reserved，券行面额=剩余=面额", async () => {
    const before = await pools()
    const r = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 30_000,
      name: "测试券 A",
      requestId: "REQ-G1",
      validityDay: 30,
    })

    const after = await pools()
    assert.equal(r.amount, 30_000)
    assert.equal(after.voucher, before.voucher - 30_000, "券池可用额没减")
    assert.equal(after.total, before.total, "发放（仅冻结）不该改变 total")

    const { rows } = await q(
      `select status, value, surplus_amount, tenant_id, merchant_id, validity_day
       from coupon where id=$1`,
      [r.couponId],
    )
    assert.equal(rows[0].status, "active")
    assert.equal(Number(rows[0].value), 30_000)
    assert.equal(Number(rows[0].surplus_amount), 30_000)
    assert.equal(rows[0].tenant_id, TENANT_A)
    assert.equal(rows[0].merchant_id, MERCHANT)
    assert.equal(rows[0].validity_day, 30)

    // 冻结额与券面额一致
    const { rows: resv } = await q(
      `select reserved from merchant_account_pool_balance
       where merchant_id=$1 and pool='voucher'`,
      [MERCHANT],
    )
    assert.equal(Number(resv[0].reserved), 30_000, "reserved 与券面额不一致")
    await assertLedgerConsistent()
  })

  it("发放幂等：同 requestId 只发一张", async () => {
    const before = await pools()
    const again = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 30_000,
      name: "测试券 A",
      requestId: "REQ-G1",
      validityDay: 30,
    })
    const after = await pools()

    const orig = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 10,
    })
    const origCoupon = orig.items.find((i: any) => i.name === "测试券 A")!
    assert.equal(again.replay, true, "重复发放未被识别为重放")
    assert.equal(
      again.couponId,
      origCoupon.id,
      "重复发放返回了另一张券（原券没被认出来）",
    )
    assert.equal(again.code, origCoupon.code, "重复发放换了券码")
    assert.equal(after.voucher, before.voucher, "重复发放多冻结了额度")
    assert.equal(after.reserved, before.reserved, "重复发放多占了 reserved")

    // 只看池余额会漏掉「券凭空多出一张」：券行必须单独断言
    const { rows } = await q(
      `select count(*)::int as n from coupon where name='测试券 A'`,
    )
    assert.equal(rows[0].n, 1, `重复发放多建了券（现有 ${rows[0].n} 张）`)
    await assertLedgerConsistent()
  })

  it("核销：商户 total 同步减少，券剩余额度递减", async () => {
    const list = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 10,
    })
    const c = list.items.find((i: any) => i.name === "测试券 A")!
    const before = await pools()

    const r = await redeemMerchantCoupon(db, {
      couponId: c.id,
      tenantId: TENANT_A,
      amount: 12_000,
      requestId: "REQ-R1",
      refId: "task-instance-001",
    })

    const after = await pools()
    assert.equal(r.amount, 12_000)
    assert.equal(r.remainingAfter, 18_000, "券剩余额度不对")
    assert.equal(r.exhausted, false)
    assert.equal(
      after.total,
      before.total - 12_000,
      "核销后商户 total 未同步减少（钱没真正花掉）",
    )
    await assertLedgerConsistent()

    const { rows } = await q(`select status, surplus_amount from coupon where id=$1`, [c.id])
    assert.equal(rows[0].status, "active", "部分核销不应把券置为 used")
    assert.equal(Number(rows[0].surplus_amount), 18_000)
  })

  it("核销幂等：同 couponId+requestId 只扣一次", async () => {
    const list = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 10,
    })
    const c = list.items.find((i: any) => i.name === "测试券 A")!
    const before = await pools()

    const again = await redeemMerchantCoupon(db, {
      couponId: c.id,
      tenantId: TENANT_A,
      amount: 12_000,
      requestId: "REQ-R1",
      refId: "task-instance-001",
    })
    const after = await pools()

    assert.equal(again.replay, true, "重复核销未被识别为重放")
    assert.equal(after.total, before.total, "重复核销多扣了商户余额")

    // 关键断言：settle 走了幂等不再动钱，但若券余额没同步判重就会照扣不误
    // ——「券少 12000、账上一分没动」，且没有任何流水能解释这笔差额。
    const { rows } = await q(`select surplus_amount from coupon where id=$1`, [c.id])
    assert.equal(
      Number(rows[0].surplus_amount),
      18_000,
      "重复核销把券余额又扣了一次（钱和券对不上）",
    )
    assert.equal(again.remainingAfter, 18_000, "重放返回的剩余额度不对")
    await assertLedgerConsistent()
  })

  it("不同 requestId 可对同一张券多次部分核销（余量正确收敛）", async () => {
    const list = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 10,
    })
    const c = list.items.find((i: any) => i.name === "测试券 A")!

    const r2 = await redeemMerchantCoupon(db, {
      couponId: c.id,
      tenantId: TENANT_A,
      amount: 10_000,
      requestId: "REQ-R2",
      refId: "task-instance-002",
    })
    assert.equal(r2.remainingAfter, 8_000)
    assert.equal(r2.exhausted, false)

    const r3 = await redeemMerchantCoupon(db, {
      couponId: c.id,
      tenantId: TENANT_A,
      amount: 8_000,
      requestId: "REQ-R3",
      refId: "task-instance-003",
    })
    assert.equal(r3.remainingAfter, 0, "用尽后余量不为 0")
    assert.equal(r3.exhausted, true)

    const { rows } = await q(`select status, surplus_amount from coupon where id=$1`, [c.id])
    assert.equal(rows[0].status, "used", "用尽后券状态应为 used")
    assert.equal(Number(rows[0].surplus_amount), 0)

    // 核销历史能从账本还原，且三笔都在
    const history = await listCouponRedemptions(db, { couponId: c.id })
    assert.equal(history.length, 3, `核销历史应为 3 笔，实际 ${history.length}`)
    assert.equal(
      history.reduce((s, h) => s + h.amount, 0),
      30_000,
      "核销历史金额合计与面额不符",
    )
    await assertLedgerConsistent()
  })

  it("超额核销被拒：券不会被扣成负数", async () => {
    // 用一张新券
    const g = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 5_000,
      name: "小额券",
      requestId: "REQ-G2",
    })
    // 基线取在发放**之后**：否则比的是发放前快照，发放本身就会被误判成"动了余额"
    const p = await pools()
    await assertLedgerConsistent()

    await assert.rejects(
      () =>
        redeemMerchantCoupon(db, {
          couponId: g.couponId,
          tenantId: TENANT_A,
          amount: 6_000, // 超过面额
          requestId: "REQ-R-OVER",
        }),
      CouponOverdrawError,
      "超额核销未被拒",
    )
    const { rows } = await q(`select surplus_amount from coupon where id=$1`, [g.couponId])
    assert.equal(Number(rows[0].surplus_amount), 5_000, "失败的核销改了券余额")
    assert.deepEqual(await pools(), p, "失败的核销动了商户余额")
    await assertLedgerConsistent()
  })

  it("并发核销同一张券：不会扣成负数，总扣减额守恒", async () => {
    await grantCash(MERCHANT, 200_000)
    await purchaseMerchantVoucher(db, {
      merchantId: MERCHANT,
      amount: 200_000,
      requestId: "REQ-P2",
    })
    const g = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 20_000,
      name: "并发券",
      requestId: "REQ-G3",
    })

    const before = await pools()
    // 8 路并发，每路核销 5000（合计 40000 > 面额 20000）
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        redeemMerchantCoupon(poolDb, {
          couponId: g.couponId,
          tenantId: TENANT_A,
          amount: 5_000,
          requestId: `REQ-RACE-${i}`,
        }),
      ),
    )
    const ok = results.filter((r) => r.status === "fulfilled")
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]

    assert.equal(ok.length, 4, `应恰好 4 路成功（20000/5000），实际 ${ok.length}`)
    for (const f of failed) {
      assert.ok(
        f.reason instanceof CouponOverdrawError,
        `并发失败原因应为超额核销，实际 ${(f.reason as Error)?.name}`,
      )
    }

    const after = await pools()
    assert.equal(
      after.total,
      before.total - 20_000,
      `并发核销总额不对：应扣 20000，实际扣 ${before.total - after.total}`,
    )
    const { rows } = await q(`select surplus_amount, status from coupon where id=$1`, [
      g.couponId,
    ])
    assert.equal(Number(rows[0].surplus_amount), 0, "券被扣成负数或未归零")
    assert.equal(rows[0].status, "used")

    // 丢失更新检查：成功路数 × 每路金额 必须正好等于券面值减少量。
    // 若 SET 写成从旧读值算出的绝对值，并发下会互相覆盖，
    // 券余额会比实际核销多，账实差异被这行断言抓住。
    assert.equal(
      before.total - after.total,
      ok.length * 5_000,
      "账上扣减额与成功核销笔数不守恒（存在丢失更新）",
    )
    await assertLedgerConsistent()
  })

  it("核销与回收并发：同一张券的钱不会被花两次", async () => {
    // 最危险的一处竞态：若回收按「读余额 → 释放 → 改状态」三步走，并发核销
    // 插在中间，同一笔 reserved 就会既被 settle 又被退回 available —— 商户白拿钱。
    // 而且每笔流水单看都合法，账面仍然自洽，只有结构恒等式
    // 「total == available + reserved」能兜住，所以这条断言不能省。
    const N = 14
    await grantCash(MERCHANT, 700_000)
    await purchaseMerchantVoucher(db, {
      merchantId: MERCHANT,
      amount: 700_000,
      requestId: "REQ-P-RACE",
    })

    const ids: string[] = []
    for (let i = 0; i < N; i++) {
      const g = await grantMerchantCoupon(db, {
        merchantId: MERCHANT,
        tenantId: TENANT_A,
        amount: 10_000,
        name: `竞态券${i}`,
        requestId: `REQ-G-RACE-${i}`,
      })
      ids.push(g.couponId)
    }

    const before = await pools()
    // 每张券同时发起「全额核销」与「回收」
    await Promise.allSettled(
      ids.flatMap((id, i) => [
        redeemMerchantCoupon(poolDb, {
          couponId: id,
          tenantId: TENANT_A,
          amount: 10_000,
          requestId: `REQ-R-RACE-${i}`,
        }),
        expireMerchantCoupon(poolDb, { couponId: id, reason: "竞态回收" }),
      ]),
    )
    const after = await pools()

    // 每张券只能有一侧生效：核销则商户 total -10000，回收则 total 不变
    const spent = before.total - after.total
    assert.ok(
      spent >= 0 && spent <= N * 10_000 && spent % 10_000 === 0,
      `并发核销+回收后商户支出 ${spent} 越界（上限 ${N * 10_000}）`,
    )
    // 结构恒等：可用+冻结的合计相对期初的变化，必须等于 total 的变化
    assert.equal(
      Number(after.available) + Number(after.reserved),
      before.available + before.reserved - spent,
      "券池结构被破坏：available + reserved 与 total 的变化对不上（存在双释放）",
    )

    const { rows } = await q(
      `select name, status, surplus_amount::float8 as surplus
       from coupon where name like '竞态券%' order by name`,
    )
    assert.equal(rows.length, N, "竞态券数量不对，竞态可能没真正发生")
    for (const r of rows) {
      assert.equal(
        Number(r.surplus),
        0,
        `${r.name} 仍有余额：核销与回收同时生效了（reserved 被花两次）`,
      )
    }
    // 逐池账实恒等 + total == available + reserved：双释放会在这里暴露
    await assertLedgerConsistent()
  })

  it("过期回收：只释放剩余额度，商户可用额回升", async () => {
    const g = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_B,
      amount: 15_000,
      name: "回收券",
      requestId: "REQ-G4",
    })
    // 先核销 5_000，剩 10_000（券属于 TENANT_B，租户必须对得上）
    await redeemMerchantCoupon(db, {
      couponId: g.couponId,
      tenantId: TENANT_B,
      amount: 5_000,
      requestId: "REQ-R-G4",
    })

    const before = await pools()
    const r = await expireMerchantCoupon(db, {
      couponId: g.couponId,
      reason: "到期",
    })
    const after = await pools()

    assert.equal(r.released, 10_000, "释放额不是剩余额度")
    assert.equal(
      after.voucher,
      before.voucher + 10_000,
      "券池可用额没回升（商户的钱被锁死了）",
    )
    assert.equal(
      after.total,
      before.total,
      "回收（仅解冻）不该改变 total：已核销 5000 必须保持已花掉",
    )
    const { rows } = await q(`select status from coupon where id=$1`, [g.couponId])
    assert.equal(rows[0].status, "expired")
    await assertLedgerConsistent()
  })

  it("回收幂等：重复回收不重复释放", async () => {
    const list = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 50,
    })
    const c = list.items.find((i: any) => i.name === "回收券")!
    const before = await pools()

    const again = await expireMerchantCoupon(db, { couponId: c.id, reason: "重复回收" })
    const after = await pools()

    assert.equal(again.released, 0, "重复回收又释放了一次")
    assert.equal(after.voucher, before.voucher, "重复回收改了余额")
    await assertLedgerConsistent()
  })

  it("已回收的券不能再核销", async () => {
    const list = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 50,
    })
    const c = list.items.find((i: any) => i.name === "回收券")!

    await assert.rejects(
      () =>
        redeemMerchantCoupon(db, {
          couponId: c.id,
          tenantId: TENANT_B,
          amount: 1_000,
          requestId: "REQ-R-DEAD",
        }),
      (err: unknown) => {
        // 回收已把剩余清零 + 置 expired，两道防线都该拦住
        assert.ok(
          err instanceof CouponNotUsableError || err instanceof CouponOverdrawError,
          `已回收的券报了意外错误：${(err as Error)?.name} / ${(err as Error)?.message}`,
        )
        return true
      },
      "已回收的券还能核销",
    )
  })

  it("跨租户核销被拒：拿别人券的 id 也花不掉", async () => {
    // 券发给 TENANT_A，攻击者以 TENANT_B 身份拿着券 id 来核销：
    // 商户的钱会照扣，但券的受益方是别人 —— 纯损失。
    const g = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 9_000,
      name: "归属校验券",
      requestId: "REQ-G-OWN",
    })
    const before = await pools()

    await assert.rejects(
      () =>
        redeemMerchantCoupon(db, {
          couponId: g.couponId,
          tenantId: TENANT_B,
          amount: 1_000,
          requestId: "REQ-R-XTENANT",
        }),
      CouponNotFoundError,
      "跨租户核销未被拒",
    )

    // 关键：商户余额与券余额都不能动
    assert.deepEqual(await pools(), before, "跨租户核销尝试动了商户余额")
    const { rows } = await q(`select surplus_amount from coupon where id=$1`, [g.couponId])
    assert.equal(Number(rows[0].surplus_amount), 9_000, "跨租户核销尝试扣了券余额")
    await assertLedgerConsistent()
  })

  it("过期的券不能核销", async () => {
    // 直接把一张券的到期时间改到过去
    const g = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 2_000,
      name: "过期券",
      requestId: "REQ-G5",
    })
    await q(`update coupon set expired_at = now() - interval '1 day' where id=$1`, [
      g.couponId,
    ])

    await assert.rejects(
      () =>
        redeemMerchantCoupon(db, {
          couponId: g.couponId,
          tenantId: TENANT_A,
          amount: 1_000,
          requestId: "REQ-R-EXP",
        }),
      CouponExpiredError,
      "过期券还能核销",
    )
  })

  it("不存在的券：明确报错", async () => {
    await assert.rejects(
      () =>
        redeemMerchantCoupon(db, {
          couponId: "00000000-0000-4000-8000-00000000v999",
          tenantId: TENANT_A,
          amount: 1_000,
          requestId: "REQ-R-NF",
        }),
      CouponNotFoundError,
    )
  })

  it("未达最低消费：核销被拒（minAmount 是对外承诺，不能只展示不执行）", async () => {
    const g = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 10_000,
      name: "满减券",
      requestId: "REQ-G-MIN",
      minAmount: 5_000,
    })
    const before = await pools()

    // 订单金额低于门槛
    await assert.rejects(
      () =>
        redeemMerchantCoupon(db, {
          couponId: g.couponId,
          tenantId: TENANT_A,
          amount: 1_000,
          orderAmount: 4_999.99,
          requestId: "REQ-R-MIN-LOW",
        }),
      CouponMinAmountNotMetError,
      "订单 ¥4999.99 低于满 ¥5000 门槛却核销成功了",
    )

    // 门槛券缺 orderAmount：无法判断是否达标时必须拦下
    await assert.rejects(
      () =>
        redeemMerchantCoupon(db, {
          couponId: g.couponId,
          tenantId: TENANT_A,
          amount: 1_000,
          requestId: "REQ-R-MIN-NONE",
        }),
      CouponMinAmountNotMetError,
      "未传订单金额就放行了门槛券，门槛形同虚设",
    )

    const after = await pools()
    assert.deepEqual(after, before, "被拒的核销不应动商户任何池子")
    await assertLedgerConsistent()

    // 达到门槛后正常核销
    const ok = await redeemMerchantCoupon(db, {
      couponId: g.couponId,
      tenantId: TENANT_A,
      amount: 1_000,
      orderAmount: 5_000,
      requestId: "REQ-R-MIN-OK",
    })
    assert.equal(ok.amount, 1_000)
    assert.equal(ok.remainingAfter, 9_000)
    await assertLedgerConsistent()
  })

  it("无门槛券不要求传订单金额", async () => {
    const g = await grantMerchantCoupon(db, {
      merchantId: MERCHANT,
      tenantId: TENANT_A,
      amount: 1_000,
      name: "无门槛券",
      requestId: "REQ-G-NOMIN",
    })
    const r = await redeemMerchantCoupon(db, {
      couponId: g.couponId,
      tenantId: TENANT_A,
      amount: 500,
      requestId: "REQ-R-NOMIN",
    })
    assert.equal(r.amount, 500, "无门槛券被无故要求订单金额")
    assert.equal(r.remainingAfter, 500)
    await assertLedgerConsistent()
  })

  it("租户可用券查询：只给 active + 未过期 + 有余额的", async () => {
    const usable = await listTenantUsableCoupons(db, { tenantId: TENANT_A })
    const names = usable.map((c: any) => c.name)

    // 并发行的券已被 4 路并发核销用尽 → 不可用
    assert.ok(!names.includes("并发券"), "已核销用尽的券出现在可用列表")
    assert.ok(!names.includes("过期券"), "过期券出现在可用列表")
    assert.ok(!names.includes("回收券"), "已回收券出现在可用列表")
    // 小额券仍有余额且未过期 → 必须可用（防止过滤条件写过头）
    assert.ok(names.includes("小额券"), "有余量的 active 券被误过滤掉了")
    for (const c of usable) {
      assert.ok(Number(c.surplusAmount) > 0, "可用列表里出现了零余额券")
    }
  })

  it("券列表分页：total 与筛选一致", async () => {
    const all = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 100,
    })
    const p1 = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 1,
    })
    assert.equal(p1.items.length, 1)
    assert.equal(p1.total, all.total, "分页 total 与全量不一致")

    const activeOnly = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      status: "active",
      page: 1,
      pageSize: 100,
    })
    assert.ok(activeOnly.total <= all.total)
    for (const c of activeOnly.items) {
      assert.equal(c.status, "active")
    }
  })

  it("商户隔离：A 商户看不到 B 商户的券", async () => {
    await grantCash(MERCHANT_B, 50_000)
    await purchaseMerchantVoucher(db, {
      merchantId: MERCHANT_B,
      amount: 50_000,
      requestId: "REQ-PB1",
    })
    await grantMerchantCoupon(db, {
      merchantId: MERCHANT_B,
      tenantId: TENANT_B,
      amount: 8_000,
      name: "B 商户券",
      requestId: "REQ-GB1",
    })

    const a = await listMerchantCoupons(db, {
      merchantId: MERCHANT,
      page: 1,
      pageSize: 100,
    })
    const b = await listMerchantCoupons(db, {
      merchantId: MERCHANT_B,
      page: 1,
      pageSize: 100,
    })

    assert.ok(!a.items.some((i: any) => i.name === "B 商户券"), "A 看到了 B 的券")
    assert.ok(b.items.some((i: any) => i.name === "B 商户券"), "B 看不到自己的券")
    await assertLedgerConsistent(MERCHANT_B)
  })

  it("全流程结束后两个商户账实恒等", async () => {
    await assertLedgerConsistent(MERCHANT)
    await assertLedgerConsistent(MERCHANT_B)
  })
})
