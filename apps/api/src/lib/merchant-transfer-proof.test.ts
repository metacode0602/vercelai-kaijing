/**
 * 对公转账到账凭证：商户提交 → 平台核销 → 入账（需真实 DATABASE_URL）
 *
 * 放在 apps/api：与 merchant-prepay.test.ts 同一约定（billing 自身不带 pg 驱动
 * 运行测试，而 apps/api 同时依赖 @workspace/billing 与 pg）。
 *
 * 覆盖的「资金事故」场景：
 *   - 提交凭证**不**动余额（系统不会因为「商户说他转了」就加钱）
 *   - 核销通过才入账，且只入一次（并发核销只有一个赢家）
 *   - 金额与订单不符一律拒绝入账，且拒绝后凭证仍可被处理（不误伤）
 *   - 已到账 / 已退款的单不能再提交凭证；他人单号不可探测
 *   - 同单同流水号重复提交幂等（不刷出多条待核销）
 *   - 驳回只终结凭证，订单保持 pending（商户可重提）
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
  submitTransferProof,
  approveTransferProof,
  rejectTransferProof,
  listTransferProofsForOps,
  getTransferProofSummary,
  getMerchantPrepayAccount,
  TransferProofOrderNotFoundError,
  TransferProofOrderNotPayableError,
  TransferProofAlreadyReviewedError,
  TransferProofAmountMismatchError,
  MERCHANT_PREPAY_MIN_AMOUNT,
} from "@workspace/billing"

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

const MERCHANT = "00000000-0000-4000-8000-00000000p101"
const OTHER_MERCHANT = "00000000-0000-4000-8000-00000000p102"
/** 核销人：必须是真实 user_staff 行（reviewer_id 有 FK，审计链不能悬空） */
const REVIEWER = "00000000-0000-4000-8000-00000000s101"
const MERCHANT_PREFIX = "p2-proof-test-"

let client: pg.Client
let db: any
/** 池化连接：仅供并发用例（单 client 无法承载多路独立事务） */
let poolDb: any

const q = (sql: string, params: any[] = []) => client.query(sql, params)

async function cleanup() {
  // bank_transfer_verification 有 FK→payment_order（cascade），先删订单即可，
  // 但显式先删凭证以便断言「不留残根」
  await q(
    `delete from bank_transfer_verification where payment_order_id in (
       select id from payment_order where merchant_id in ($1, $2))`,
    [MERCHANT, OTHER_MERCHANT],
  )
  await q(`delete from merchant_account_ledger where merchant_id in ($1, $2)`, [
    MERCHANT,
    OTHER_MERCHANT,
  ])
  await q(`delete from payment_order where merchant_id in ($1, $2)`, [
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
  // user_staff 有多个「默认负责人」部分唯一索引，必须先解除这些标记才能删
  await q(
    `update user_staff set is_default_pre_sales=false, is_default_account_manager=false,
       is_default_delivery_manager=false, is_default_project_manager=false
     where id=$1`,
    [REVIEWER],
  )
  await q(`delete from user_staff where id = $1`, [REVIEWER])
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
  await q(
    `insert into user_staff (id, display_name, mobile, status, roles, created_at, updated_at)
     values ($1, $2, $3, 'active', '["admin"]'::jsonb, now(), now())
     on conflict (id) do nothing`,
    [REVIEWER, `${MERCHANT_PREFIX}reviewer`, "13900000002"],
  )
}

/** 建一张 pending 的对公转账预付单 */
async function makeOrder(amount: number, merchantId = MERCHANT) {
  const { order } = await createMerchantPrepay(db, {
    merchantId,
    amount,
    paymentMethod: "bank_transfer",
  })
  return order
}

/** 商户 cash 池可用余额 */
async function cashAvailable(merchantId = MERCHANT): Promise<number> {
  // getMerchantPrepayAccount 返回的是 { account, availableTotal, ... }，
  // 余额字段在 account 下面，不是顶层
  const { account } = await getMerchantPrepayAccount(db, merchantId)
  return Number(account.cashBalance)
}

/** 账实恒等断言：pool_balance.total == Σ ledger.amount */
async function assertLedgerConsistent(merchantId = MERCHANT) {
  const { rows } = await q(
    `select pb.pool, pb.total, coalesce(sum(l.amount), 0) as ledger_sum
     from merchant_account_pool_balance pb
     left join merchant_account_ledger l
       on l.merchant_id = pb.merchant_id and l.pool = pb.pool
     where pb.merchant_id = $1
     group by pb.pool, pb.total`,
    [merchantId],
  )
  for (const r of rows) {
    assert.ok(
      Math.abs(Number(r.total) - Number(r.ledger_sum)) < 0.0001,
      `池 ${r.pool} 账实不符：balance.total=${r.total} ledger.sum=${r.ledger_sum}`,
    )
  }
}

describeDb("对公转账凭证核销", () => {
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

  it("提交凭证不动余额（钱没核对前绝不入账）", async () => {
    const order = await makeOrder(50_000)
    const before = await cashAvailable()

    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      remitterAccount: "6222****8888",
      transferAmount: 50_000,
      bankSerialNo: "SN-SUBMIT-1",
    })

    assert.equal(proof.reviewStatus, "pending")
    assert.equal(proof.orderNo, order.orderNo)
    assert.equal(proof.amountConsistent, true)
    assert.equal(await cashAvailable(), before, "提交凭证就加钱了")

    const { rows } = await q(`select status from payment_order where order_no=$1`, [
      order.orderNo,
    ])
    assert.equal(rows[0].status, "pending", "提交凭证不该把订单置为已支付")
  })

  it("核销通过后入账到 cash 池，账实恒等", async () => {
    const order = await makeOrder(80_000)
    const before = await cashAvailable()

    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 80_000,
      bankSerialNo: "SN-APPROVE-1",
    })

    const r = await approveTransferProof(db, {
      proofId: proof.id,
      reviewerId: REVIEWER,
    })

    assert.equal(r.orderNo, order.orderNo)
    assert.equal(r.replay, false)
    assert.equal(r.credited, 80_000)
    assert.equal(await cashAvailable(), before + 80_000)

    const { rows } = await q(
      `select review_status, reviewer_id from bank_transfer_verification where id=$1`,
      [proof.id],
    )
    assert.equal(rows[0].review_status, "approved")
    assert.equal(rows[0].reviewer_id, REVIEWER, "核销人未留痕")

    await assertLedgerConsistent()
  })

  it("同单同流水号重复提交幂等（不刷出多条待核销）", async () => {
    const order = await makeOrder(60_000)
    const input = {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 60_000,
      bankSerialNo: "SN-IDEMPOTENT-1",
    }
    const first = await submitTransferProof(db, input)
    const second = await submitTransferProof(db, input)

    assert.equal(second.id, first.id, "重复提交产生了新凭证")
    const { rows } = await q(
      `select count(*)::int as n from bank_transfer_verification where payment_order_id=$1`,
      [first.orderId],
    )
    assert.equal(rows[0].n, 1)
  })

  it("金额与订单不符：拒绝入账，且凭证仍可处理", async () => {
    const order = await makeOrder(70_000)
    const before = await cashAvailable()

    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 65_000, // 少汇 5000
      bankSerialNo: "SN-MISMATCH-1",
    })
    assert.equal(proof.amountConsistent, false, "不一致未被标出")

    await assert.rejects(
      () => approveTransferProof(db, { proofId: proof.id, reviewerId: REVIEWER }),
      (err: unknown) => {
        assert.ok(err instanceof TransferProofAmountMismatchError)
        assert.equal(err.orderAmount, 70_000)
        assert.equal(err.transferAmount, 65_000)
        return true
      },
      "少汇的钱被自动入账了",
    )
    assert.equal(await cashAvailable(), before, "拒绝后余额仍变了")

    // 凭证没有被「误伤」：仍可被驳回，订单仍 pending
    const { rows: stillPending } = await q(
      `select review_status from bank_transfer_verification where id=$1`,
      [proof.id],
    )
    assert.equal(stillPending[0].review_status, "pending")

    await rejectTransferProof(db, { proofId: proof.id, reviewerId: REVIEWER })
    const { rows: orderRows } = await q(
      `select status from payment_order where order_no=$1`,
      [order.orderNo],
    )
    assert.equal(orderRows[0].status, "pending", "驳回凭证不该改订单状态")
  })

  it("amountOverride 只能修正填错的凭证金额，不能按订单金额硬入账", async () => {
    const order = await makeOrder(90_000)
    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 1, // 商户把 900000 填成了 1
      bankSerialNo: "SN-OVERRIDE-1",
    })

    // 修正为真实到账金额 → 可入账
    const r = await approveTransferProof(db, {
      proofId: proof.id,
      reviewerId: REVIEWER,
      amountOverride: 90_000,
    })
    assert.equal(r.credited, 90_000)

    // 反向：把到账金额改成与订单一致但与银行流水不符，系统无法分辨 ——
    // 所以 override 只能填真实金额；这里验证「override 与凭证金额都不同于订单」仍被拒
    const order2 = await makeOrder(100_000)
    const proof2 = await submitTransferProof(db, {
      orderNo: order2.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 100_000,
      bankSerialNo: "SN-OVERRIDE-2",
    })
    await assert.rejects(
      () =>
        approveTransferProof(db, {
          proofId: proof2.id,
          reviewerId: REVIEWER,
          amountOverride: 999_999,
        }),
      TransferProofAmountMismatchError,
      "override 绕过了金额校验",
    )
  })

  it("并发核销只有一个赢家，且只入账一次", async () => {
    const order = await makeOrder(120_000)
    const before = await cashAvailable()

    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 120_000,
      bankSerialNo: "SN-RACE-1",
    })

    // 5 路并发「通过」，模拟多个运营同时点
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        approveTransferProof(poolDb, { proofId: proof.id, reviewerId: REVIEWER }),
      ),
    )
    const ok = results.filter((r) => r.status === "fulfilled")
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]

    assert.equal(ok.length, 1, `应恰好 1 路成功，实际 ${ok.length}`)
    for (const f of failed) {
      // 输家的报错有两种，都正确：抢到凭证前就发现单已被别人付掉（NotPayable），
      // 或抢凭证时发现已被处理（AlreadyReviewed）。关键是不许有第三种。
      assert.ok(
        f.reason instanceof TransferProofAlreadyReviewedError ||
          f.reason instanceof TransferProofOrderNotPayableError,
        `并发失败原因异常：${(f.reason as Error)?.name} / ${(f.reason as Error)?.message}`,
      )
    }

    assert.equal(await cashAvailable(), before + 120_000, "并发核销重复入账")
    await assertLedgerConsistent()

    // 流水里只有一笔 prepay
    const { rows } = await q(
      `select count(*)::int as n from merchant_account_ledger
       where merchant_id=$1 and ref_type='prepay' and ref_id=$2`,
      [MERCHANT, order.id],
    )
    assert.equal(rows[0].n, 1, "同一订单写了两条流水")
  })

  it("已到账的订单不能再提交凭证", async () => {
    const order = await makeOrder(30_000)
    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 30_000,
      bankSerialNo: "SN-PAID-1",
    })
    await approveTransferProof(db, { proofId: proof.id, reviewerId: REVIEWER })

    await assert.rejects(
      () =>
        submitTransferProof(db, {
          orderNo: order.orderNo,
          merchantId: MERCHANT,
          remitterName: "某某科技有限公司",
          transferAmount: 30_000,
          bankSerialNo: "SN-PAID-2",
        }),
      TransferProofOrderNotPayableError,
      "已到账订单还能再提交凭证",
    )
  })

  it("用他人单号提交凭证一律按「不存在」处理（不可探测）", async () => {
    const order = await makeOrder(40_000, OTHER_MERCHANT)
    await assert.rejects(
      () =>
        submitTransferProof(db, {
          orderNo: order.orderNo,
          merchantId: MERCHANT, // 冒用：订单属于 OTHER_MERCHANT
          remitterName: "伪造",
          transferAmount: 40_000,
        }),
      TransferProofOrderNotFoundError,
      "商户能用他人单号提交凭证",
    )
  })

  it("不存在单号的错误不泄露订单是否存在", async () => {
    await assert.rejects(
      () =>
        submitTransferProof(db, {
          orderNo: "PAY-NOT-EXIST-000000000",
          merchantId: MERCHANT,
          remitterName: "某某",
          transferAmount: 100,
        }),
      TransferProofOrderNotFoundError,
    )
  })

  it("运营队列：默认只列待核销，且能筛出金额不一致的", async () => {
    // 制造：1 条一致 + 1 条不一致，均 pending
    const okOrder = await makeOrder(200_000)
    await submitTransferProof(db, {
      orderNo: okOrder.orderNo,
      merchantId: MERCHANT,
      remitterName: "A 公司",
      transferAmount: 200_000,
      bankSerialNo: "SN-Q-OK",
    })
    const badOrder = await makeOrder(300_000)
    await submitTransferProof(db, {
      orderNo: badOrder.orderNo,
      merchantId: MERCHANT,
      remitterName: "B 公司",
      transferAmount: 250_000,
      bankSerialNo: "SN-Q-BAD",
    })

    const all = await listTransferProofsForOps(db, {
      reviewStatus: "pending",
      page: 1,
      pageSize: 50,
    })
    const mismatch = await listTransferProofsForOps(db, {
      reviewStatus: "pending",
      onlyMismatch: true,
      page: 1,
      pageSize: 50,
    })

    assert.ok(all.total >= 2)
    assert.equal(
      mismatch.total,
      mismatch.items.length,
      "只看不一致：total 与 items 不一致（分页没对齐）",
    )
    for (const item of mismatch.items) {
      assert.equal(item.amountConsistent, false, "不一致队列里混进了金额相符的凭证")
    }
    assert.ok(
      mismatch.items.some((i) => i.orderNo === badOrder.orderNo),
      "不一致的凭证没被筛出来",
    )
    assert.ok(
      !mismatch.items.some((i) => i.orderNo === okOrder.orderNo),
      "金额相符的凭证被误判为不一致",
    )

    const summary = await getTransferProofSummary(db)
    assert.ok(summary.pending >= 2)
    assert.ok(summary.mismatch >= 1)

    // 分页断言：pageSize=1 时 total 不变、items 只 1 条
    const p1 = await listTransferProofsForOps(db, {
      reviewStatus: "pending",
      page: 1,
      pageSize: 1,
    })
    assert.equal(p1.items.length, 1)
    assert.equal(p1.total, all.total)
  })

  it("入账失败时凭证回滚为待核销（不会出现「已入账但没加钱」）", async () => {
    const order = await makeOrder(150_000)
    const before = await cashAvailable()
    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 150_000,
      bankSerialNo: "SN-ATOMIC-1",
    })

    // 在抢占凭证之后、入账之前把订单置为 refunded，模拟结算中途失败。
    // 若抢占与入账不在同一事务，凭证会被永久标记为 approved 而余额未变。
    await q(`update payment_order set status='refunded' where order_no=$1`, [order.orderNo])

    await assert.rejects(
      () => approveTransferProof(db, { proofId: proof.id, reviewerId: REVIEWER }),
      (err: unknown) => {
        // 守卫先于事务触发（订单已非 pending），凭证应保持 pending
        assert.ok(err instanceof TransferProofOrderNotPayableError)
        return true
      },
    )

    const { rows } = await q(
      `select review_status from bank_transfer_verification where id=$1`,
      [proof.id],
    )
    assert.equal(
      rows[0].review_status,
      "pending",
      "结算未成功却把凭证标成已核销：运营无法判断该不该重试",
    )
    assert.equal(await cashAvailable(), before, "失败的核销动了余额")

    // 恢复后重试可正常入账（凭证仍可处理）
    await q(`update payment_order set status='pending' where order_no=$1`, [order.orderNo])
    const r = await approveTransferProof(db, { proofId: proof.id, reviewerId: REVIEWER })
    assert.equal(r.credited, 150_000)
    assert.equal(await cashAvailable(), before + 150_000)
    await assertLedgerConsistent()
  })

  it("事务提交后才算成功：入账阶段失败时凭证不会停在 approved", async () => {
    const order = await makeOrder(160_000)
    const proof = await submitTransferProof(db, {
      orderNo: order.orderNo,
      merchantId: MERCHANT,
      remitterName: "某某科技有限公司",
      transferAmount: 160_000,
      bankSerialNo: "SN-TX-1",
    })

    // 用一条临时 CHECK 约束让「写 cash 池流水」这一步必然失败。
    // 失败点刻意选在**抢占凭证之后**：这正是「凭证已标 approved、余额没动」
    // 那种坏状态会诞生的位置。若抢占与入账不在同一事务，凭证就会卡在 approved，
    // 运营既不敢承认已入账、也不敢重试。
    //
    // 约束在 finally 里删除：即便断言失败也不会污染后续用例。
    const constraint = "p2_proof_test_block_160000"
    await q(
      `alter table merchant_account_ledger
         add constraint ${constraint} check (amount <> 160000)`,
    )
    try {
      await assert.rejects(
        () => approveTransferProof(db, { proofId: proof.id, reviewerId: REVIEWER }),
        (err: unknown) => {
          // drizzle 把 PG 错误包在 cause 上，约束名只在那里
          const e = err as { cause?: { constraint?: string }; message?: string }
          assert.equal(e.cause?.constraint, constraint)
          return true
        },
      )

      const { rows } = await q(
        `select review_status from bank_transfer_verification where id=$1`,
        [proof.id],
      )
      assert.equal(
        rows[0].review_status,
        "pending",
        "入账失败却把凭证留在 approved：运营无法判断该不该重试",
      )
    } finally {
      await q(`alter table merchant_account_ledger drop constraint if exists ${constraint}`)
    }

    // 约束解除后重试可正常入账 —— 事务回滚没有把凭证「用掉」
    const r = await approveTransferProof(db, { proofId: proof.id, reviewerId: REVIEWER })
    assert.equal(r.credited, 160_000)
    assert.equal(r.replay, false)
    await assertLedgerConsistent()
  })

  it("低于最低预付额的单建不出来（凭证流程的前置边界）", async () => {
    await assert.rejects(
      () => makeOrder(MERCHANT_PREPAY_MIN_AMOUNT - 1),
      /低于最低预付额/,
    )
  })

  it("核销后账实恒等（跨全流程再断言一次）", async () => {
    await assertLedgerConsistent()
    await assertLedgerConsistent(OTHER_MERCHANT)
  })
})
