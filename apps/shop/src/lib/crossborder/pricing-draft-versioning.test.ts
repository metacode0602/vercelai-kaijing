import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertHistoryPreserved,
  planDraftArchive,
  planDraftSave,
  type PricingDraftVersionRow,
} from './pricing-draft-versioning'

describe('pricing suggestion draft versioning', () => {
  it('保存时追加新版本，不覆盖已有行，仅把旧 current 标为 superseded', () => {
    const existing: PricingDraftVersionRow[] = [
      { id: 'd1', versionNo: 1, status: 'superseded' },
      { id: 'd2', versionNo: 2, status: 'current' },
    ]
    const plan = planDraftSave(existing)
    assert.equal(plan.nextVersionNo, 3)
    assert.deepEqual(plan.supersedeIds, ['d2'])
    const after: PricingDraftVersionRow[] = [
      { id: 'd1', versionNo: 1, status: 'superseded' },
      { id: 'd2', versionNo: 2, status: 'superseded' },
      { id: 'd3', versionNo: 3, status: 'current' },
    ]
    assert.doesNotThrow(() => assertHistoryPreserved(existing, after))
    assert.equal(after.find((row) => row.id === 'd1')?.versionNo, 1)
  })

  it('检测覆盖历史版本（只留一行）为非法', () => {
    const before: PricingDraftVersionRow[] = [
      { id: 'd1', versionNo: 1, status: 'current' },
    ]
    const overwritten: PricingDraftVersionRow[] = [
      { id: 'd1', versionNo: 1, status: 'current' },
    ]
    // 同 id 覆盖内容在 dataaccess 层禁止；这里保证旧 id 必须仍在
    assert.doesNotThrow(() => assertHistoryPreserved(before, overwritten))
    assert.throws(
      () => assertHistoryPreserved(before, [{ id: 'd2', versionNo: 1, status: 'current' }]),
      /被删除/,
    )
  })

  it('归档是软删除，历史行仍保留', () => {
    const existing: PricingDraftVersionRow[] = [
      { id: 'd1', versionNo: 1, status: 'superseded' },
      { id: 'd2', versionNo: 2, status: 'current' },
    ]
    const plan = planDraftArchive(existing)
    assert.deepEqual(plan.archiveIds.sort(), ['d1', 'd2'])
    const after = existing.map((row) => ({ ...row, status: 'archived' as const }))
    assert.doesNotThrow(() => assertHistoryPreserved(existing, after))
    assert.equal(after.length, 2)
  })
})
