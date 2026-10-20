import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseWaverlessBillingMeta,
  shouldRejectWaverlessScaleUp,
  windowConsumeIdempotencyKey,
  windowIdempotencyKey,
} from "./waverless-billing-math.ts"

test("window consume idempotency key is stable per billing window", () => {
  const start = new Date("2026-10-17T01:00:00.000Z")
  const end = new Date("2026-10-17T01:05:00.000Z")
  const win = windowIdempotencyKey("ep-1", start, end)
  assert.equal(windowConsumeIdempotencyKey(win), `${win}:consume`)
  assert.equal(windowConsumeIdempotencyKey(win), windowConsumeIdempotencyKey(win))
})

test("parseWaverlessBillingMeta defaults to active", () => {
  assert.deepEqual(parseWaverlessBillingMeta({}), { status: "active" })
})

test("shouldRejectWaverlessScaleUp blocks replica increases only when suspended", () => {
  const suspended = parseWaverlessBillingMeta({
    waverlessBilling: { status: "billing_suspended", admissionBlocked: true },
  })
  assert.equal(
    shouldRejectWaverlessScaleUp(suspended, { minReplicas: 2, maxReplicas: 4 }, {
      minReplicas: 1,
      maxReplicas: 2,
    }),
    true,
  )
  assert.equal(
    shouldRejectWaverlessScaleUp(suspended, { minReplicas: 1, maxReplicas: 2 }, {
      minReplicas: 1,
      maxReplicas: 2,
    }),
    false,
  )
  const active = parseWaverlessBillingMeta({ waverlessBilling: { status: "active" } })
  assert.equal(
    shouldRejectWaverlessScaleUp(active, { minReplicas: 5, maxReplicas: 10 }, {
      minReplicas: 1,
      maxReplicas: 2,
    }),
    false,
  )
})
