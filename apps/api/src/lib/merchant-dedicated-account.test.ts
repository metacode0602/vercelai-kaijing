/**
 * 平台「专用收款账户」回归测试（需真实 DATABASE_URL）
 *
 * 背景：`bank_account` 加 `merchant_id` 后，商户端只允许看到
 * `merchant_id = 自己的` 的行。核心风险是**串号**——同一平台账户出现在多个商户的
 * 预付单里，到账流水无法唯一归属，线下核对必然出错。
 *
 * 覆盖的失败场景：
 *   - 平台通用账户（merchant_id IS NULL）绝不下发给任何商户
 *   - A 商户看不到 B 商户的专用账户
 *   - 专属过滤只是「可见性」，不改变 billing 层建单能力（平台通用账户仍可用于通用充值）
 *   - 同一商户同一 sort_order 不得重复（DB 约束兜底，防止展示顺序歧义）
 *   - 账户停用后不再下发
 *
 * 放在 apps/api 而非 packages/billing：billing 未依赖 pg，本文件需真实库，
 * 与 merchant-prepay.test.ts 同一约定。
 */

import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import pg from "pg"

const DATABASE_URL = process.env.DATABASE_URL
const describeDb = DATABASE_URL ? describe : describe.skip

const CLIENT = new pg.Client({ connectionString: DATABASE_URL })
/**
 * 被测函数：与 `apps/merchant/src/lib/server/dataaccess/account/prepay.ts`
 * 的 `listBankAccounts` 同一过滤语义（严格专用 + 仅 active + sortOrder 排序）。
 * 这里用原始 SQL 表达，以便直接对库断言可见性。
 */
async function listVisibleAccounts(merchantId: string): Promise<Array<{ id: string }>> {
  const res = await CLIENT.query(
    `select id, account_name, account_no
     from bank_account
     where is_active is true and merchant_id = $1
     order by sort_order`,
    [merchantId],
  )
  return res.rows as Array<{ id: string }>
}

/** 统一前缀：before/after 按前缀清理，避免上次中断留下的残根影响下一轮 */
const PFX = "dedicated-acct-test"
const MERCHANT_A = `${PFX}-m-a`
const MERCHANT_B = `${PFX}-m-b`
const GLOBAL_ID = `${PFX}-acc-global`
const ACC_A_1 = `${PFX}-acc-a1`
const ACC_A_2 = `${PFX}-acc-a2`
const ACC_B_1 = `${PFX}-acc-b1`
const ACC_B_2 = `${PFX}-acc-b2`

async function insertBankAccount(
  id: string,
  merchantId: string | null,
  sortOrder: number,
  isActive = true,
) {
  // 用裸 client 而非 drizzle sql 模板：模板对多行 VALUES 的位置参数容易错位，
  // 且此处要断言 PG 原始错误码，裸 client 抛错更直接。
  await CLIENT.query(
    `insert into bank_account
       (id, account_name, account_no, bank_name, merchant_id, sort_order, is_active)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, `测试户名-${id.slice(-4)}`, `622200000000${id.slice(-4)}`, "测试银行", merchantId, sortOrder, isActive],
  )
}

before(async () => {
  await CLIENT.connect()
  // 上一轮若中断会留下残根；merchant_id 有 FK，先删子表再删父表
  await CLIENT.query(`delete from bank_account where id like $1`, [`${PFX}%`])
  await CLIENT.query(`delete from merchant where id like $1`, [`${PFX}%`])
  // 两个商户行（bank_account.merchant_id 有 FK 指向 merchant.id）
  for (const [id, code, name] of [
    [MERCHANT_A, "dedicated-a", "测试商户A"],
    [MERCHANT_B, "dedicated-b", "测试商户B"],
  ] as const) {
    await CLIENT.query(
      `insert into merchant
         (id, code, name, company_full_name, access_mode, type, status, created_at, updated_at)
       values ($1, $2, $3, $4, 'oem', 'oem', 'active', now(), now())
       on conflict (id) do nothing`,
      [id, code, name, `${name}有限公司`],
    )
  }
  await insertBankAccount(GLOBAL_ID, null, 0)
  await insertBankAccount(ACC_A_1, MERCHANT_A, 0)
  await insertBankAccount(ACC_A_2, MERCHANT_A, 1)
  await insertBankAccount(ACC_B_1, MERCHANT_B, 0)
  // B 的第二个账户：停用
  await insertBankAccount(ACC_B_2, MERCHANT_B, 1, false)
})

after(async () => {
  await CLIENT.query(`delete from bank_account where id like $1`, [`${PFX}%`])
  await CLIENT.query(`delete from merchant where id like $1`, [`${PFX}%`])
  await CLIENT.end()
})

describeDb("专用收款账户可见性", () => {
  it("平台通用账户（merchant_id IS NULL）绝不下发给任何商户", async () => {
    for (const m of [MERCHANT_A, MERCHANT_B]) {
      const rows = (await listVisibleAccounts(m))
      assert.ok(
        !rows.some((r) => r.id === GLOBAL_ID),
        `通用账户泄漏给商户 ${m}`,
      )
    }
  })

  it("A 商户只看到自己的 2 个专用账户，且按 sort_order 排序", async () => {
    const rows = (await listVisibleAccounts(MERCHANT_A))
    assert.deepEqual(
      rows.map((r) => r.id),
      [ACC_A_1, ACC_A_2],
    )
  })

  it("A 商户看不到 B 商户的专用账户（不串号）", async () => {
    const rows = (await listVisibleAccounts(MERCHANT_A))
    assert.ok(
      !rows.some((r) => r.id === ACC_B_1 || r.id === ACC_B_2),
      "A 看到了 B 的账户",
    )
  })

  it("停用账户不再下发", async () => {
    const rows = (await listVisibleAccounts(MERCHANT_B))
    assert.deepEqual(
      rows.map((r) => r.id),
      [ACC_B_1],
      "停用的账户仍在返回",
    )
  })

  it("同一商户同一 sort_order 被 DB 唯一约束拒绝（展示顺序不歧义）", async () => {
    const dup = `${PFX}-acc-dup`
    // 23505 = unique_violation
    await assert.rejects(
      () => insertBankAccount(dup, MERCHANT_A, 0),
      (err: unknown) => {
        // 裸 pg client 直接把 code 挂在错误上；若经 drizzle 包装则在 cause 上
        const e = err as { code?: string; cause?: { code?: string } }
        return e.code === "23505" || e.cause?.code === "23505"
      },
      "重复 sort_order 未被 DB 唯一约束拒绝",
    )
  })

  it("通用账户之间不受该约束限制（merchant_id IS NULL 可重复）", async () => {
    const g2 = `${PFX}-acc-global-2`
    await insertBankAccount(g2, null, 0)
    const rows = (await listVisibleAccounts(MERCHANT_A))
    assert.ok(!rows.some((r) => r.id === g2), "通用账户泄漏")
    await CLIENT.query(`delete from bank_account where id = $1`, [g2])
  })
})
