/**
 * 商户销售价时点解析的纯逻辑测试（P0-8）
 *
 * 这里只测**不依赖数据库**的边界判定；真实查库行为用本地 Postgres 验证。
 */

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isEffectiveAt,
  isUsablePrice,
  PRICE_SOURCE_LIST,
  PRICE_SOURCE_SALES,
} from "./merchant-price-rules.ts"

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe("时点生效判定", () => {
  const row = { effectiveFrom: day("2026-01-01"), effectiveTo: day("2026-02-01") }

  it("生效区间内（含起始日）→ 生效", () => {
    assert.equal(isEffectiveAt(row, day("2026-01-01")), true)
    assert.equal(isEffectiveAt(row, day("2026-01-15")), true)
  })

  it("结束日当天起失效（排他上界，避免同一天两条生效价）", () => {
    assert.equal(isEffectiveAt(row, day("2026-02-01")), false)
    assert.equal(isEffectiveAt(row, day("2026-02-02")), false)
  })

  it("起始日之前 → 未生效", () => {
    assert.equal(isEffectiveAt(row, day("2025-12-31")), false)
  })

  it("effectiveTo 为 null 表示长期有效", () => {
    const forever = { effectiveFrom: day("2026-01-01"), effectiveTo: null }
    assert.equal(isEffectiveAt(forever, day("2030-06-01")), true)
  })

  it("接受 'YYYY-MM-DD' 字符串（date 列的实际存储形态）", () => {
    const strRow = { effectiveFrom: "2026-01-01", effectiveTo: "2026-02-01" }
    assert.equal(isEffectiveAt(strRow, day("2026-01-10")), true)
    assert.equal(isEffectiveAt(strRow, day("2026-02-01")), false)
  })

  it("非法日期一律视为未生效，绝不误判成有效价", () => {
    const bad = { effectiveFrom: "not-a-date", effectiveTo: null }
    assert.equal(isEffectiveAt(bad, day("2026-01-10")), false)
  })
})

describe("单价可用性", () => {
  it("正数可用", () => {
    assert.equal(isUsablePrice(0.01), true)
    assert.equal(isUsablePrice(12.5), true)
  })

  it("0 / 负数 / NaN / Infinity 不可用（防止商户把价配成 0 白送）", () => {
    for (const v of [0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(isUsablePrice(v), false, `${v} 应不可用`)
    }
  })
})

describe("price_source 取值", () => {
  it("只有 sales / list 两个来源", () => {
    assert.equal(PRICE_SOURCE_SALES, "sales")
    assert.equal(PRICE_SOURCE_LIST, "list")
  })
})
