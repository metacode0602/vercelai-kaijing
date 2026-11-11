import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getSiteBreadcrumbTrail } from './breadcrumbs'

describe('getSiteBreadcrumbTrail', () => {
  it('marks console detail routes under their list page', () => {
    const trail = getSiteBreadcrumbTrail('/console/tenants/t1')
    assert.deepEqual(
      trail.map((item) => item.label),
      ['跨境运营中枢', '租户', '详情'],
    )
    assert.equal(trail[0]?.href, '/console')
  })

  it('highlights settings coming-soon pages separately from account settings', () => {
    assert.deepEqual(
      getSiteBreadcrumbTrail('/settings').map((item) => item.label),
      ['设置', '账号设置'],
    )
    assert.deepEqual(
      getSiteBreadcrumbTrail('/settings/platform-config').map((item) => item.label),
      ['设置', '平台配置'],
    )
  })
})
