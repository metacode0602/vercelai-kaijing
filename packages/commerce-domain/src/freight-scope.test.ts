import assert from "node:assert/strict"
import { test } from "node:test"
import {
  assembleFreightUnion,
  isSriLankaDestPort,
  oceanLotToFreightItem,
  rateCardToFreightItem,
  readOceanFreightAmount,
} from "./freight-scope"

test("斯里兰卡目的港可识别 CMB / Colombo / LK / LKCMB，空值与其他港排除", () => {
  assert.equal(isSriLankaDestPort("CMB"), true)
  assert.equal(isSriLankaDestPort("lkcmb"), true)
  assert.equal(isSriLankaDestPort("LK-CMB"), true)
  assert.equal(isSriLankaDestPort("Colombo"), true)
  assert.equal(isSriLankaDestPort("LK"), true)
  assert.equal(isSriLankaDestPort(""), false)
  assert.equal(isSriLankaDestPort(null), false)
  assert.equal(isSriLankaDestPort("PKKHI"), false)
  assert.equal(isSriLankaDestPort("SGSIN"), false)
  assert.equal(isSriLankaDestPort("UNKNOWN"), false)
})

test("海运柜次金额只取 packingDetails 已有字段，缺额为 null，不虚构", () => {
  assert.deepEqual(readOceanFreightAmount({ freightAmount: "120.5", currency: "usd" }), {
    amount: 120.5,
    currency: "USD",
  })
  assert.deepEqual(readOceanFreightAmount({ totalFreight: 80 }), { amount: 80, currency: "USD" })
  assert.deepEqual(readOceanFreightAmount({ amount: "15" }), { amount: 15, currency: "USD" })
  assert.equal(readOceanFreightAmount({}).amount, null)
  assert.equal(readOceanFreightAmount({ currency: "LKR" }).amount, null)
  assert.equal(readOceanFreightAmount({ freightUsd: 99 }).amount, null)
})

test("非 Daraz 或非 LK 目的港的柜次不得进入结果", () => {
  assert.equal(
    oceanLotToFreightItem({ id: "o1", lotCode: "LOT-PK", platform: "daraz", destPort: "PKKHI" }),
    null,
  )
  assert.equal(
    oceanLotToFreightItem({ id: "o2", lotCode: "LOT-CMB", platform: "lazada", destPort: "CMB" }),
    null,
  )
  assert.equal(
    oceanLotToFreightItem({ id: "o3", lotCode: "LOT-EMPTY", platform: "daraz", destPort: "" }),
    null,
  )
  const included = oceanLotToFreightItem({
    id: "o4",
    lotCode: "LOT-CMB-1",
    platform: "daraz",
    destPort: "LKCMB",
    packingDetails: { freightAmount: 200, currency: "USD" },
  })
  assert.ok(included)
  assert.equal(included.source, "ocean")
  assert.equal(included.amount, 200)
})

test("三源合并：海运柜次出现在结果中；缺额保持为空；非 LK 排除；混合币种不合计；不假装有 freight_estimates 表", () => {
  const result = assembleFreightUnion({
    templates: [
      { id: "ft1", code: "FT-LK", name: "Daraz LK 海运费模板", platform: "daraz", country: "LK", type: "ocean_freight" },
    ],
    oceanLots: [
      {
        id: "oc-lk",
        lotCode: "LOT-CMB-A",
        platform: "daraz",
        destPort: "CMB",
        packingDetails: { freightAmount: 100, currency: "USD" },
      },
      {
        id: "oc-missing",
        lotCode: "LOT-CMB-B",
        platform: "daraz",
        destPort: "Colombo",
        packingDetails: {},
      },
      {
        id: "oc-pk",
        lotCode: "LOT-PK-1",
        platform: "daraz",
        destPort: "PKKHI",
        packingDetails: { freightAmount: 999, currency: "USD" },
      },
      {
        id: "oc-lazada",
        lotCode: "LOT-LZ",
        platform: "lazada",
        destPort: "CMB",
        packingDetails: { freightAmount: 50, currency: "USD" },
      },
    ],
    rateCards: [
      { id: "rc-lk", code: "RC-CMB", name: "Colombo 卡", destPort: "LKCMB", unitRate: "30", currency: "LKR" },
      { id: "rc-sg", code: "RC-SIN", name: "Singapore 卡", destPort: "SGSIN", unitRate: "40", currency: "USD" },
      { id: "rc-empty", code: "RC-NA", name: "无目的港", destPort: "", unitRate: "10", currency: "USD" },
    ],
  })

  assert.equal(result.oceanShipments.length, 2)
  assert.ok(result.items.some((row) => row.code === "LOT-CMB-A" && row.source === "ocean"))
  assert.ok(result.items.some((row) => row.code === "LOT-CMB-B" && row.source === "ocean" && row.amount === null))
  assert.equal(result.items.some((row) => row.code === "LOT-PK-1"), false)
  assert.equal(result.items.some((row) => row.code === "LOT-LZ"), false)
  assert.equal(result.items.some((row) => row.code === "RC-SIN"), false)
  assert.equal(result.items.some((row) => row.code === "RC-NA"), false)
  assert.equal(result.excludedOceanCount, 2)
  assert.equal(result.excludedRateCardCount, 2)
  assert.equal(result.currencyMode, "mixed")
  assert.equal(result.total, null)
  assert.equal(result.currency, null)
  assert.ok(result.byCurrency.length >= 2)
  assert.match(result.message, /费用模板、海运柜次与运价卡/)
  assert.match(result.message, /不存在 freight_estimates 表/)
  assert.equal("freight_estimates" in result, false)
  const missing = result.oceanShipments.find((row) => row.code === "LOT-CMB-B")
  assert.equal(missing?.amount, null)
})

test("单一币种且金额齐全时可以合计，仍然不是估算表", () => {
  const result = assembleFreightUnion({
    templates: [],
    oceanLots: [
      {
        id: "a",
        lotCode: "LOT-1",
        platform: "daraz",
        destPort: "LKCMB",
        packingDetails: { totalFreight: 10, currency: "USD" },
      },
      {
        id: "b",
        lotCode: "LOT-2",
        platform: "daraz",
        destPort: "CMB",
        packingDetails: { amount: 5, currency: "usd" },
      },
    ],
    rateCards: [],
  })
  assert.equal(result.currencyMode, "single")
  assert.equal(result.currency, "USD")
  assert.equal(result.total, 15)
  assert.match(result.message, /不存在 freight_estimates 表/)
})

test("运价卡无目的港不得当作 LK", () => {
  assert.equal(rateCardToFreightItem({ id: "x", code: "X", name: "X", destPort: null, unitRate: 1 }), null)
})
