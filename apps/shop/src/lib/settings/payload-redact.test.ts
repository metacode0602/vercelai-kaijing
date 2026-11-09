import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractSyncTaskIdFromPayload, redactPayloadSummary } from './payload-redact'

describe('payload-redact', () => {
  it('redacts token fields in JSON', () => {
    const out = redactPayloadSummary(
      JSON.stringify({ taskId: 't1', access_token: 'secret', nested: { refreshToken: 'r' } }),
    )
    const parsed = JSON.parse(out) as {
      taskId: string
      access_token: string
      nested: { refreshToken: string }
    }
    assert.equal(parsed.taskId, 't1')
    assert.equal(parsed.access_token, '[REDACTED]')
    assert.equal(parsed.nested.refreshToken, '[REDACTED]')
  })

  it('extracts sync task id', () => {
    assert.equal(extractSyncTaskIdFromPayload(JSON.stringify({ taskId: 'abc' })), 'abc')
    assert.equal(extractSyncTaskIdFromPayload('not-json'), null)
  })
})
