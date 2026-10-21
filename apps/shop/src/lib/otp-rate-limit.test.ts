import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkAndConsumeSendRateLimit,
  checkAndConsumeVerifyRateLimit,
  createMemoryOtpRateLimitStore,
  OTP_RATE_LIMIT,
} from './otp-rate-limit'

test('send rate limit: min interval 60s per identifier', async () => {
  const store = createMemoryOtpRateLimitStore()
  const first = await checkAndConsumeSendRateLimit({
    channel: 'phone',
    identifier: '13800138000',
    ip: '1.1.1.1',
    store,
  })
  assert.equal(first.ok, true)
  const second = await checkAndConsumeSendRateLimit({
    channel: 'phone',
    identifier: '13800138000',
    ip: '1.1.1.1',
    store,
  })
  assert.equal(second.ok, false)
  if (!second.ok) {
    assert.equal(second.status, 429)
    assert.match(second.message, /秒后再试/)
  }
})

test('send rate limit: max 5 per 15min identifier', async () => {
  const store = createMemoryOtpRateLimitStore()
  // Bypass min-interval by using distinct last-send keys via direct window fills
  for (let i = 0; i < OTP_RATE_LIMIT.identifierMaxSends; i++) {
    await store.setLastSendAt(`id:phone:1390000000${i}`, 0)
    const r = await checkAndConsumeSendRateLimit({
      channel: 'email',
      identifier: 'limit@example.com',
      ip: `2.2.2.${i}`,
      store,
    })
    // Force last send old enough
    await store.setLastSendAt('id:email:limit@example.com', Date.now() - 61_000)
    assert.equal(r.ok, true, `send ${i} should pass`)
  }
  await store.setLastSendAt('id:email:limit@example.com', Date.now() - 61_000)
  const blocked = await checkAndConsumeSendRateLimit({
    channel: 'email',
    identifier: 'limit@example.com',
    ip: '9.9.9.9',
    store,
  })
  assert.equal(blocked.ok, false)
})

test('verify rate limit: max attempts', async () => {
  const store = createMemoryOtpRateLimitStore()
  for (let i = 0; i < OTP_RATE_LIMIT.verifyMaxAttempts; i++) {
    const r = await checkAndConsumeVerifyRateLimit({
      channel: 'phone',
      identifier: '13800138001',
      store,
    })
    assert.equal(r.ok, true)
  }
  const blocked = await checkAndConsumeVerifyRateLimit({
    channel: 'phone',
    identifier: '13800138001',
    store,
  })
  assert.equal(blocked.ok, false)
})
