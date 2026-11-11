import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapLegacyPlatformPath } from './legacy-paths'

describe('mapLegacyPlatformPath', () => {
  it('maps /crossborder list and detail paths to /console', () => {
    assert.equal(mapLegacyPlatformPath('/crossborder'), '/console')
    assert.equal(mapLegacyPlatformPath('/crossborder/tenants'), '/console/tenants')
    assert.equal(
      mapLegacyPlatformPath('/crossborder/tenants/abc'),
      '/console/tenants/abc',
    )
    assert.equal(
      mapLegacyPlatformPath('/crossborder/shop-conflicts/c1'),
      '/console/shop-conflicts/c1',
    )
  })

  it('maps coming-soon pages from old console paths to settings', () => {
    assert.equal(
      mapLegacyPlatformPath('/crossborder/platform-config'),
      '/settings/platform-config',
    )
    assert.equal(mapLegacyPlatformPath('/console/audit-logs'), '/settings/audit-logs')
    assert.equal(
      mapLegacyPlatformPath('/console/announcements'),
      '/settings/announcements',
    )
    assert.equal(mapLegacyPlatformPath('/console/roles'), '/settings/roles')
  })

  it('leaves current paths unchanged', () => {
    assert.equal(mapLegacyPlatformPath('/console'), null)
    assert.equal(mapLegacyPlatformPath('/console/tenants/abc'), null)
    assert.equal(mapLegacyPlatformPath('/settings/platform-config'), null)
  })
})
