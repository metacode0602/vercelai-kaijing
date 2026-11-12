import assert from "node:assert/strict"
import { test } from "node:test"
import { redactRecord } from "./redaction"

test("订单 PII 与 raw 不会进入 MCP 输出", () => {
  const redacted = redactRecord({
    id: "ord_1",
    buyerName: "Alice",
    phone: "13800000000",
    shippingAddress: "Colombo 01",
    email: "a@example.com",
    raw: { buyer: { name: "Alice", phone: "1" } },
    totalAmount: "100",
  }) as Record<string, unknown>
  assert.equal(redacted.id, "ord_1")
  assert.equal(redacted.buyerName, "仅 Web 可见")
  assert.equal(redacted.phone, "仅 Web 可见")
  assert.equal(redacted.shippingAddress, "仅 Web 可见")
  assert.equal(redacted.email, "仅 Web 可见")
  assert.equal("raw" in redacted, false)
  assert.equal(redacted.totalAmount, "100")
})
