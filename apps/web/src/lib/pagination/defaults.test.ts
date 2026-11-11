import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_PAGE_SIZE, pageValues } from './defaults'
import { generatePageNumbers } from './generate-page-numbers'

describe('pageValues', () => {
  it('defaults to page 1 and 20 items', () => {
    assert.deepEqual(pageValues(), { page: 1, pageSize: DEFAULT_PAGE_SIZE })
    assert.equal(DEFAULT_PAGE_SIZE, 20)
  })

  it('clamps invalid page and pageSize', () => {
    assert.deepEqual(pageValues(0, 0), { page: 1, pageSize: 1 })
    assert.deepEqual(pageValues(-3, 500), { page: 1, pageSize: 100 })
  })
})

describe('generatePageNumbers', () => {
  it('returns a compact page list with ellipsis', () => {
    assert.deepEqual(generatePageNumbers(1, 3), [1, 2, 3])
    assert.deepEqual(generatePageNumbers(5, 10), [1, '...', 4, 5, 6, '...', 10])
  })
})
