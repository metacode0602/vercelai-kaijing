import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SETTINGS_NAV_GROUPS,
  SITE_NAV_GROUPS,
  findBestMatchingNavItem,
  isNavItemActive,
} from './site-nav'

describe('console and settings navigation', () => {
  it('keeps coming-soon menus in settings, not console', () => {
    const consoleUrls = SITE_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.url))
    const settingsUrls = SETTINGS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.url))
    assert.ok(!consoleUrls.includes('/settings/platform-config'))
    assert.ok(!consoleUrls.includes('/console/platform-config'))
    assert.ok(settingsUrls.includes('/settings/platform-config'))
    assert.ok(settingsUrls.includes('/settings/audit-logs'))
    assert.ok(settingsUrls.includes('/settings/announcements'))
    assert.ok(settingsUrls.includes('/settings/roles'))
    assert.ok(consoleUrls.includes('/console/invitations'))
    assert.ok(!settingsUrls.includes('/console/invitations'))
    for (const url of [
      '/console/platform-basics',
      '/console/dictionaries',
      '/console/categories',
      '/console/carriers',
      '/console/import-templates',
    ]) {
      assert.ok(consoleUrls.includes(url), url)
      assert.ok(!settingsUrls.includes(url), url)
    }
  })

  it('activates list nav items for detail routes', () => {
    const tenants = findBestMatchingNavItem('/console/tenants/t1')
    assert.equal(tenants?.url, '/console/tenants')
    assert.equal(isNavItemActive('/console/tenants/t1', tenants!), true)

    const conflicts = findBestMatchingNavItem('/console/shop-conflicts/c1')
    assert.equal(conflicts?.url, '/console/shop-conflicts')
    assert.equal(isNavItemActive('/console/shop-conflicts/c1', conflicts!), true)
  })

  it('does not treat account settings as active on coming-soon pages', () => {
    const account = SETTINGS_NAV_GROUPS[0]?.items[0]
    assert.ok(account)
    assert.equal(isNavItemActive('/settings', account), true)
    assert.equal(isNavItemActive('/settings/roles', account), false)
  })
})
