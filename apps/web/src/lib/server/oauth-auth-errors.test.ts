import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyOAuthFailure,
  redactOAuthPayload,
  sanitizeOAuthText,
} from './oauth-auth-errors'

describe('classifyOAuthFailure', () => {
  it('maps cross-tenant conflict to the conflict queue advice', () => {
    const result = classifyOAuthFailure({
      reason: 'shop_already_bound_other_org',
      message: 'cross-tenant shop binding conflict',
    })
    assert.equal(result.code, 'shop_bound_other_org')
    assert.match(result.advice, /店铺冲突/)
  })

  it('maps user cancellation from query error', () => {
    const result = classifyOAuthFailure({ queryError: 'access_denied' })
    assert.equal(result.code, 'authorization_rejected')
    assert.match(result.advice, /重新发起授权/)
  })

  it('maps expired state and invalid callback separately', () => {
    assert.equal(
      classifyOAuthFailure({ message: 'oauth state expired' }).code,
      'state_expired',
    )
    assert.equal(
      classifyOAuthFailure({ message: 'invalid oauth callback' }).code,
      'invalid_callback',
    )
  })

  it('maps invalid app credentials and token exchange failures', () => {
    assert.equal(
      classifyOAuthFailure({ message: 'invalid_client: app key rejected' }).code,
      'app_credential_invalid',
    )
    assert.equal(
      classifyOAuthFailure({ reason: 'token_exchange_failed' }).code,
      'token_exchange_failed',
    )
  })

  it('maps getShop / identity failures and network timeouts', () => {
    assert.equal(
      classifyOAuthFailure({ message: '无法识别平台店铺身份，已拒绝保存授权' }).code,
      'shop_identity_unavailable',
    )
    assert.equal(
      classifyOAuthFailure({ message: 'connect ETIMEDOUT marketplace.example' }).code,
      'network_timeout',
    )
  })

  it('uses an explicit stored code when present', () => {
    const result = classifyOAuthFailure({ lastError: 'onboarding_not_approved' })
    assert.equal(result.code, 'onboarding_not_approved')
    assert.match(result.advice, /入驻审核/)
  })
})

describe('sanitizeOAuthText', () => {
  it('redacts tokens and secrets', () => {
    const text = sanitizeOAuthText('failed access_token=abc123 refresh_token=xyz')
    assert.equal(text.includes('abc123'), false)
    assert.match(text, /已隐藏/)
  })
})

describe('redactOAuthPayload', () => {
  it('redacts sensitive keys from JSON payloads', () => {
    const redacted = redactOAuthPayload(
      JSON.stringify({
        reason: 'token_exchange_failed',
        accessToken: 'secret-token',
        detail: 'ok',
      }),
    )
    assert.equal(redacted.reason, 'token_exchange_failed')
    assert.equal(redacted.accessToken, '[已隐藏]')
    assert.equal(redacted.detail, 'ok')
  })
})
