import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { LOCAL_PAYLOAD_KEYS, mergeListingPayload, nextLiveAt } from "./listing-merge"

describe("mergeListingPayload", () => {
  it("保留本地 note/cover/images，平台 raw 其余字段照常落库", () => {
    const merged = mergeListingPayload({
      existing: {
        note: "运营备注",
        cover: "https://local/cover.jpg",
        images: ["https://local/1.jpg"],
        sellerSku: "S-1",
        primarySku: "SKU-1",
        spuCode: "SPU-1",
      },
      platformRaw: {
        item_id: "1001",
        images: ["https://platform/1.jpg"],
        status: "Live",
        name: "平台标题",
      },
      shop: { name: "店A", platform: "daraz", site: "LK" },
    })

    assert.equal(merged.note, "运营备注")
    assert.equal(merged.cover, "https://local/cover.jpg")
    assert.deepEqual(merged.images, ["https://local/1.jpg"])
    assert.equal(merged.sellerSku, "S-1")
    assert.equal(merged.item_id, "1001")
    assert.equal(merged.name, "平台标题")
    assert.equal(merged.shopName, "店A")
    assert.equal(merged.platform, "daraz")
    assert.equal(merged.site, "LK")
  })

  it("空 existing 时平台 images 可作为初始 payload.images", () => {
    const merged = mergeListingPayload({
      platformRaw: { images: ["https://platform/1.jpg"] },
      shop: { name: "店B", platform: "lazada", site: "MY" },
    })
    assert.deepEqual(merged.images, ["https://platform/1.jpg"])
    assert.equal(merged.shopName, "店B")
  })

  it("本地显式空值不被平台 raw 覆盖", () => {
    const merged = mergeListingPayload({
      existing: { note: "", images: [] },
      platformRaw: { note: "平台侧备注", images: ["https://p/1.jpg"] },
    })
    assert.equal(merged.note, "")
    assert.deepEqual(merged.images, [])
  })

  it("非法输入不抛错", () => {
    const merged = mergeListingPayload({ existing: null, platformRaw: "oops" })
    assert.deepEqual(merged, {})
    for (const key of LOCAL_PAYLOAD_KEYS) {
      assert.equal(Object.prototype.hasOwnProperty.call(merged, key), false)
    }
  })
})

describe("nextLiveAt", () => {
  const now = new Date("2026-11-11T00:00:00Z")

  it("平台 live 时保留已有上架时间", () => {
    const existing = new Date("2026-01-01T00:00:00Z")
    assert.equal(
      nextLiveAt({ platformStatus: "Live", existingLiveAt: existing, now }),
      existing,
    )
  })

  it("平台 live 且本地无上架时间时记本次", () => {
    assert.equal(nextLiveAt({ platformStatus: "active", existingLiveAt: null, now }), now)
  })

  it("非 live 不清空已有上架时间", () => {
    const existing = new Date("2026-01-01T00:00:00Z")
    assert.equal(
      nextLiveAt({ platformStatus: "paused", existingLiveAt: existing, now }),
      existing,
    )
    assert.equal(
      nextLiveAt({ platformStatus: "rejected", existingLiveAt: existing, now }),
      existing,
    )
  })

  it("非 live 且本地无上架时间 → null", () => {
    assert.equal(nextLiveAt({ platformStatus: "draft", existingLiveAt: null, now }), null)
  })
})
