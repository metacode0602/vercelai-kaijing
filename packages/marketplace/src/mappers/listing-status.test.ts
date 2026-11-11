import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { toLocalListingStatus } from "./listing-status"

describe("toLocalListingStatus", () => {
  it("归一 mapLazopListingStatus 的输出", () => {
    assert.equal(toLocalListingStatus("live"), "live")
    assert.equal(toLocalListingStatus("submitted"), "pending_review")
    assert.equal(toLocalListingStatus("rejected"), "failed")
    assert.equal(toLocalListingStatus("paused"), "offline")
    assert.equal(toLocalListingStatus("archived"), "offline")
    assert.equal(toLocalListingStatus("draft"), "draft")
  })

  it("归一平台原始商品状态", () => {
    assert.equal(toLocalListingStatus("Active"), "live")
    assert.equal(toLocalListingStatus("Pending QC"), "pending_review")
    assert.equal(toLocalListingStatus("Suspended"), "offline")
    assert.equal(toLocalListingStatus("InActive"), "offline")
    assert.equal(toLocalListingStatus("Deleted"), "offline")
    assert.equal(toLocalListingStatus("Live_Reject"), "failed")
    assert.equal(toLocalListingStatus("sold_out"), "offline")
  })

  it("空值与未知值落到 draft，绝不越出本地值域", () => {
    assert.equal(toLocalListingStatus(null), "draft")
    assert.equal(toLocalListingStatus(undefined), "draft")
    assert.equal(toLocalListingStatus(""), "draft")
    assert.equal(toLocalListingStatus("something_else"), "draft")
  })
})
