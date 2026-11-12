import assert from "node:assert/strict"
import { test } from "node:test"
import { assertMcpWriteAllowed, mcpForbiddenWriteActions, type DomainActor } from "./actor"
import { denyDirectPlatformWrite } from "./pending-writes"

const mcpActor: DomainActor = { channel: "mcp", organizationId: "org_a", clientId: "client_1" }
const consoleActor: DomainActor = { channel: "console", organizationId: "org_a", userId: "user_1" }

test("MCP 不能直接发布、改在售价或入队同步，也不能确认待审", () => {
  for (const action of mcpForbiddenWriteActions) {
    assert.throws(() => assertMcpWriteAllowed(mcpActor, action), /禁止直接执行/)
    assert.throws(() => denyDirectPlatformWrite(mcpActor, action), /禁止直接执行/)
  }
})

test("控制台通道仍可走原有写回（确认后由现有 writer 执行）", () => {
  for (const action of mcpForbiddenWriteActions) {
    assert.doesNotThrow(() => assertMcpWriteAllowed(consoleActor, action))
  }
})

test("MCP 允许的写动作仅限创建或补全待审", () => {
  assert.doesNotThrow(() => assertMcpWriteAllowed(mcpActor, "pending.create_price_change"))
  assert.doesNotThrow(() => assertMcpWriteAllowed(mcpActor, "pending.create_inventory_push"))
  assert.doesNotThrow(() => assertMcpWriteAllowed(mcpActor, "pending.complete_listing_submit"))
})
