import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyOAuthFailureCode,
  safeOAuthFailureDetail,
  sanitizeOAuthFailureText,
} from './oauth-failure'

describe('classifyOAuthFailureCode', () => {
  it('classifies common OAuth callback failures', () => {
    assert.equal(
      classifyOAuthFailureCode({ reason: 'shop_bound_other_org' }).code,
      'shop_bound_other_org',
    )
    assert.equal(
      classifyOAuthFailureCode({ queryError: 'access_denied' }).code,
      'authorization_rejected',
    )
    assert.equal(
      classifyOAuthFailureCode({ message: 'oauth state expired' }).code,
      'state_expired',
    )
    assert.equal(
      classifyOAuthFailureCode({ message: 'invalid_client' }).code,
      'app_credential_invalid',
    )
    assert.equal(
      classifyOAuthFailureCode({ message: 'ETIMEDOUT talking to platform' }).code,
      'network_timeout',
    )
    assert.equal(
      classifyOAuthFailureCode({ reason: 'token_exchange_failed' }).code,
      'token_exchange_failed',
    )
  })
})

describe('sanitizeOAuthFailureText', () => {
  it('does not keep access tokens in stored messages', () => {
    const text = sanitizeOAuthFailureText('boom access_token=super-secret-value')
    assert.equal(text.includes('super-secret-value'), false)
    assert.match(text, /已隐藏/)
  })
})

describe('safeOAuthFailureDetail', () => {
  it('drops secret fields from persisted payload summaries', () => {
    const detail = safeOAuthFailureDetail({
      reason: 'token_exchange_failed',
      accessToken: 'abc',
      mode: 'bind',
    })
    assert.equal(detail?.reason, 'token_exchange_failed')
    assert.equal(detail?.mode, 'bind')
    assert.equal('accessToken' in (detail ?? {}), false)
  })
})
