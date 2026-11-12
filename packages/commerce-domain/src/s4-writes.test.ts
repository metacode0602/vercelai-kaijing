import assert from "node:assert/strict"
import { test } from "node:test"
import { assertMcpWriteAllowed, mcpForbiddenWriteActions, type DomainActor } from "./actor"
import { assertDesktopMarketplaceScope, DESKTOP_SCOPE_MESSAGE } from "./desktop-scope"
import {
  assertMcpReadSyncType,
  isForbiddenWriteSyncType,
  normalizeSyncRequestType,
  RETURNS_UNWIRED,
  SHIP_BATCH_REFUSAL,
  WRITE_SYNC_REFUSAL,
} from "./sync-request"

const mcp: DomainActor = { channel: "mcp", organizationId: "org_a", clientId: "c1" }

test("MCP 仍禁止直接发布、改在售价、入队写同步或确认待审", () => {
  for (const action of mcpForbiddenWriteActions) {
    assert.throws(() => assertMcpWriteAllowed(mcp, action), /禁止直接执行/)
  }
})

test("读同步类型映射：中英文均可，写同步被拒绝", () => {
  assert.equal(normalizeSyncRequestType("订单同步"), "orders")
  assert.equal(normalizeSyncRequestType("listings"), "listings")
  assert.equal(normalizeSyncRequestType("刊登拉取"), "listings")
  assert.equal(normalizeSyncRequestType("结算同步"), "settlements")
  assert.equal(normalizeSyncRequestType("评论抓取"), "reviews")
  assert.equal(assertMcpReadSyncType("orders"), "orders")
  assert.equal(assertMcpReadSyncType("logistics"), "logistics")
  assert.equal(isForbiddenWriteSyncType("inventory"), true)
  assert.equal(isForbiddenWriteSyncType("price"), true)
  assert.equal(isForbiddenWriteSyncType("publish"), true)
  assert.equal(isForbiddenWriteSyncType("status"), true)
  assert.throws(() => assertMcpReadSyncType(normalizeSyncRequestType("库存同步")), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, WRITE_SYNC_REFUSAL)
    return true
  })
  assert.throws(() => assertMcpReadSyncType(normalizeSyncRequestType("价格同步")), /不能通过 MCP 入队/)
  assert.throws(() => assertMcpReadSyncType(normalizeSyncRequestType("发布刊登")), /不能通过 MCP 入队/)
  assert.throws(() => assertMcpReadSyncType(normalizeSyncRequestType("状态同步")), /不能通过 MCP 入队/)
  assert.throws(() => assertMcpReadSyncType(normalizeSyncRequestType("物流交运")), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, SHIP_BATCH_REFUSAL)
    return true
  })
  assert.equal(assertMcpReadSyncType(normalizeSyncRequestType("退货同步")), "returns")
  assert.match(RETURNS_UNWIRED, /未接线/)
})

test("定价草稿只允许 Daraz LK，其他平台拒绝且不改刊登价", () => {
  assert.throws(() => assertDesktopMarketplaceScope({ platform: "tiktok", site: "LK" }), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, DESKTOP_SCOPE_MESSAGE)
    return true
  })
  assert.deepEqual(assertDesktopMarketplaceScope({ platform: "daraz", site: "lk" }), {
    platform: "daraz",
    site: "LK",
  })
})
