import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_SHOP_BINDING_TRANSFER_APPEAL_DAYS,
  computeAppealDeadline,
  decideBindingConflictTransition,
  parseTransferAppealDays,
  shopOccupiesBindingSlot,
} from '@workspace/db'

describe('shopOccupiesBindingSlot', () => {
  it('treats active and disabled shops as occupying', () => {
    assert.equal(shopOccupiesBindingSlot({ status: 'active', deletedAt: null }), true)
    assert.equal(shopOccupiesBindingSlot({ status: 'disabled', deletedAt: null }), true)
    assert.equal(shopOccupiesBindingSlot({ status: 'error', deletedAt: null }), true)
    assert.equal(shopOccupiesBindingSlot({ status: 'draft', deletedAt: null }), true)
  })

  it('does not treat unbound or soft-deleted shops as occupying', () => {
    assert.equal(shopOccupiesBindingSlot({ status: 'unbound', deletedAt: null }), false)
    assert.equal(
      shopOccupiesBindingSlot({ status: 'active', deletedAt: new Date('2026-11-11T01:00:00Z') }),
      false,
    )
  })
})

describe('parseTransferAppealDays', () => {
  it('defaults to 3 days', () => {
    assert.equal(parseTransferAppealDays(undefined), DEFAULT_SHOP_BINDING_TRANSFER_APPEAL_DAYS)
    assert.equal(parseTransferAppealDays(''), 3)
    assert.equal(parseTransferAppealDays('nope'), 3)
    assert.equal(parseTransferAppealDays('-1'), 3)
  })

  it('accepts 0 as no appeal window', () => {
    assert.equal(parseTransferAppealDays('0'), 0)
  })

  it('parses a custom window', () => {
    assert.equal(parseTransferAppealDays('7'), 7)
  })
})

describe('G8 conflict state machine', () => {
  const now = new Date('2026-11-11T01:41:00+08:00')

  it('creates an uphold path that closes the challenger draft without releasing the occupant', () => {
    const decision = decideBindingConflictTransition({
      current: 'pending',
      action: 'uphold',
      appealDays: 3,
      now,
    })
    assert.deepEqual(decision, {
      status: 'upheld',
      releaseOccupantSlot: false,
      grantChallengerReauth: false,
      closeChallengerDraft: true,
      appealDeadlineAt: null,
    })
  })

  it('enters appeal window when transfer is approved and days > 0', () => {
    const decision = decideBindingConflictTransition({
      current: 'pending',
      action: 'approve_transfer',
      appealDays: 3,
      now,
    })
    assert.equal(decision.status, 'transfer_approved_pending_appeal')
    assert.equal(decision.releaseOccupantSlot, false)
    assert.equal(decision.grantChallengerReauth, false)
    assert.equal(decision.closeChallengerDraft, false)
    assert.deepEqual(decision.appealDeadlineAt, computeAppealDeadline(now, 3))
  })

  it('releases immediately when appeal days is 0', () => {
    const decision = decideBindingConflictTransition({
      current: 'pending',
      action: 'approve_transfer',
      appealDays: 0,
      now,
    })
    assert.deepEqual(decision, {
      status: 'released_pending_reauth',
      releaseOccupantSlot: true,
      grantChallengerReauth: true,
      closeChallengerDraft: false,
      appealDeadlineAt: null,
    })
  })

  it('lets the occupant appeal during the window and pauses release', () => {
    const deadline = computeAppealDeadline(now, 3)
    const appealed = decideBindingConflictTransition({
      current: 'transfer_approved_pending_appeal',
      action: 'appeal',
      appealDays: 3,
      now,
      appealDeadlineAt: deadline,
    })
    assert.equal(appealed.status, 'appealed_pending_review')
    assert.equal(appealed.releaseOccupantSlot, false)
    assert.equal(appealed.grantChallengerReauth, false)
  })

  it('rejects an appeal after the deadline', () => {
    const deadline = new Date(now.getTime() - 1000)
    assert.throws(
      () =>
        decideBindingConflictTransition({
          current: 'transfer_approved_pending_appeal',
          action: 'appeal',
          appealDays: 3,
          now,
          appealDeadlineAt: deadline,
        }),
      /申诉期限已过/,
    )
  })

  it('expires the window without an appeal and releases the slot', () => {
    const deadline = new Date(now.getTime() - 1000)
    const decision = decideBindingConflictTransition({
      current: 'transfer_approved_pending_appeal',
      action: 'expire_appeal_window',
      appealDays: 3,
      now,
      appealDeadlineAt: deadline,
    })
    assert.equal(decision.status, 'released_pending_reauth')
    assert.equal(decision.releaseOccupantSlot, true)
    assert.equal(decision.grantChallengerReauth, true)
  })

  it('accepts an appeal and returns to upheld', () => {
    const decision = decideBindingConflictTransition({
      current: 'appealed_pending_review',
      action: 'accept_appeal',
      appealDays: 3,
      now,
    })
    assert.equal(decision.status, 'upheld')
    assert.equal(decision.closeChallengerDraft, true)
    assert.equal(decision.releaseOccupantSlot, false)
  })

  it('rejects an appeal and releases the slot for re-authorization', () => {
    const decision = decideBindingConflictTransition({
      current: 'appealed_pending_review',
      action: 'reject_appeal',
      appealDays: 3,
      now,
    })
    assert.equal(decision.status, 'released_pending_reauth')
    assert.equal(decision.releaseOccupantSlot, true)
    assert.equal(decision.grantChallengerReauth, true)
  })

  it('releases the slot when the occupant formally unbinds', () => {
    for (const current of [
      'pending',
      'transfer_approved_pending_appeal',
      'appealed_pending_review',
    ] as const) {
      const decision = decideBindingConflictTransition({
        current,
        action: 'occupant_unbind',
        appealDays: 3,
        now,
      })
      assert.equal(decision.status, 'released_pending_reauth')
      assert.equal(decision.releaseOccupantSlot, true)
      assert.equal(decision.grantChallengerReauth, true)
      assert.equal(decision.closeChallengerDraft, false)
    }
  })

  it('closes the ticket after the challenger re-authorizes', () => {
    const decision = decideBindingConflictTransition({
      current: 'released_pending_reauth',
      action: 'challenger_reauth_success',
      appealDays: 3,
      now,
    })
    assert.equal(decision.status, 'closed')
    assert.equal(decision.releaseOccupantSlot, false)
  })
})
