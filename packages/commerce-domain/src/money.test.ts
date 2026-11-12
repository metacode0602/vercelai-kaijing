import assert from "node:assert/strict"
import { test } from "node:test"
import { currencyModeOf, sumMoneyByCurrency } from "./money"

test("混合币种不合计", () => {
  const mixed = sumMoneyByCurrency([
    { currency: "LKR", amount: 100 },
    { currency: "USD", amount: 20 },
  ])
  assert.equal(mixed.currencyMode, "mixed")
  assert.equal(mixed.currency, null)
  assert.equal(mixed.total, null)
  assert.equal(mixed.byCurrency.length, 2)
})

test("单一币种可以合计", () => {
  const single = sumMoneyByCurrency([
    { currency: "lkr", amount: "10" },
    { currency: "LKR", amount: 5 },
  ])
  assert.equal(single.currencyMode, "single")
  assert.equal(single.currency, "LKR")
  assert.equal(single.total, 15)
})

test("空集合为 empty，不把空数据当成 0 元成功", () => {
  const empty = currencyModeOf([])
  assert.equal(empty.currencyMode, "empty")
  assert.equal(empty.currency, null)
})
