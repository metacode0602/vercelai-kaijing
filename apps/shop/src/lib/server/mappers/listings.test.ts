import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  publishStateForListingStatus,
  toDbListingStatus,
  toDbPublishState,
  toUiListingStatus,
  toUiPublishState,
} from './listings'

describe('toUiListingStatus 平台回执值域兼容', () => {
  it('核心五态', () => {
    assert.equal(toUiListingStatus('draft'), '草稿')
    assert.equal(toUiListingStatus('pending_review'), '待审')
    assert.equal(toUiListingStatus('live'), '在售')
    assert.equal(toUiListingStatus('failed'), '失败')
    assert.equal(toUiListingStatus('offline'), '下架')
  })

  it('平台回执兼容：submitted/rejected/paused/archived', () => {
    assert.equal(toUiListingStatus('submitted'), '待审')
    assert.equal(toUiListingStatus('rejected'), '失败')
    assert.equal(toUiListingStatus('paused'), '下架')
    assert.equal(toUiListingStatus('archived'), '下架')
    assert.equal(toUiListingStatus('sold_out'), '下架')
    assert.equal(toUiListingStatus('suspended'), '下架')
  })

  it('未知/空值回退草稿', () => {
    assert.equal(toUiListingStatus('bogus'), '草稿')
    assert.equal(toUiListingStatus(null), '草稿')
    assert.equal(toUiListingStatus(undefined), '草稿')
  })
})

describe('toDbListingStatus 透传与归一', () => {
  it('UI 标签映射到 DB 值', () => {
    assert.equal(toDbListingStatus('待审'), 'pending_review')
    assert.equal(toDbListingStatus('在售'), 'live')
    assert.equal(toDbListingStatus('下架'), 'offline')
  })

  it('已知 DB 值（含平台回执）透传，不被误归 draft', () => {
    assert.equal(toDbListingStatus('submitted'), 'submitted')
    assert.equal(toDbListingStatus('rejected'), 'rejected')
    assert.equal(toDbListingStatus('paused'), 'paused')
    assert.equal(toDbListingStatus('live'), 'live')
  })

  it('未知值回退 draft', () => {
    assert.equal(toDbListingStatus('whatever'), 'draft')
  })
})

describe('publishState 值域兼容', () => {
  it('DB → UI：synced 归一为已发布', () => {
    assert.equal(toUiPublishState('synced'), '已发布')
    assert.equal(toUiPublishState('published'), '已发布')
    assert.equal(toUiPublishState('sync_failed'), '同步失败')
    assert.equal(toUiPublishState(null), '未发布')
  })

  it('UI → DB 与透传', () => {
    assert.equal(toDbPublishState('已发布'), 'published')
    assert.equal(toDbPublishState('synced'), 'synced')
    assert.equal(toDbPublishState('bogus'), 'unpublished')
  })

  it('publishStateForListingStatus 推导', () => {
    assert.equal(publishStateForListingStatus('在售'), '已发布')
    assert.equal(publishStateForListingStatus('失败'), '同步失败')
    assert.equal(publishStateForListingStatus('待审'), '待同步')
    assert.equal(publishStateForListingStatus('草稿'), '未发布')
  })
})
