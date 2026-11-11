import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_SYSTEM_ROLE_PERMISSIONS,
  IMPERSONATE_PERMISSION,
  collectScopeIds,
  forbiddenPermissionMessage,
  hasPermission,
  isOwnerIdentity,
  isValidPermission,
  mapLegacyMemberRoleToBusinessCodes,
  parseInvitationRoles,
  permissionsSubset,
  scopeAllows,
  serializeInvitationRoles,
  unionPermissions,
} from './rbac'

test('owner identity includes owner and tenant_owner', () => {
  assert.equal(isOwnerIdentity('owner'), true)
  assert.equal(isOwnerIdentity('tenant_owner'), true)
  assert.equal(isOwnerIdentity('member'), false)
})

test('owner has every permission without explicit grants', () => {
  assert.equal(
    hasPermission({ organizationRole: 'owner', permissions: [], required: 'settings.configure' }),
    true,
  )
  assert.equal(
    hasPermission({
      organizationRole: 'member',
      permissions: ['product.read'],
      required: 'settings.configure',
    }),
    false,
  )
})

test('permissions are a union across roles', () => {
  assert.deepEqual(
    unionPermissions([
      ['product.read', 'order.read'],
      ['product.update', 'product.read'],
    ]).sort(),
    ['order.read', 'product.read', 'product.update'],
  )
})

test('it.impersonate stays reserved and off in default matrices', () => {
  assert.equal(isValidPermission(IMPERSONATE_PERMISSION), true)
  for (const [code, permissions] of Object.entries(DEFAULT_SYSTEM_ROLE_PERMISSIONS)) {
    assert.equal(
      permissions.includes(IMPERSONATE_PERMISSION),
      false,
      `${code} should not grant impersonate`,
    )
  }
})

test('scope all covers shop and warehouse; otherwise union of ids', () => {
  assert.equal(
    scopeAllows({
      scopes: [{ scopeType: 'all', actions: ['read'] }],
      resource: { shopId: 's1' },
      action: 'read',
    }),
    true,
  )
  assert.equal(
    scopeAllows({
      scopes: [
        { scopeType: 'shop', scopeRefId: 's1', actions: ['read'] },
        { scopeType: 'warehouse', scopeRefId: 'w1', actions: ['read'] },
      ],
      resource: { shopId: 's1' },
      action: 'read',
    }),
    true,
  )
  assert.equal(
    scopeAllows({
      scopes: [{ scopeType: 'shop', scopeRefId: 's1', actions: ['read'] }],
      resource: { shopId: 's2' },
      action: 'read',
    }),
    false,
  )
  assert.deepEqual(collectScopeIds([{ scopeType: 'all' }], 'shop'), { type: 'all' })
  assert.deepEqual(
    collectScopeIds(
      [
        { scopeType: 'shop', scopeRefId: 'a' },
        { scopeType: 'shop', scopeRefId: 'b' },
      ],
      'shop',
    ),
    { type: 'ids', ids: ['a', 'b'] },
  )
})

test('invitation roles serialize as JSON when multiple', () => {
  assert.equal(serializeInvitationRoles(['operator']), 'operator')
  assert.equal(serializeInvitationRoles(['operator', 'finance']), JSON.stringify(['operator', 'finance']))
  assert.deepEqual(parseInvitationRoles('operator'), ['operator'])
  assert.deepEqual(parseInvitationRoles('["finance","buyer"]'), ['finance', 'buyer'])
  assert.deepEqual(parseInvitationRoles('admin'), ['biz_admin'])
  assert.deepEqual(parseInvitationRoles('member'), ['operator'])
  assert.throws(() => serializeInvitationRoles(['owner']), /组织所有者/)
})

test('legacy member roles map to business codes', () => {
  assert.deepEqual(mapLegacyMemberRoleToBusinessCodes('owner'), [])
  assert.deepEqual(mapLegacyMemberRoleToBusinessCodes('admin'), ['biz_admin'])
  assert.deepEqual(mapLegacyMemberRoleToBusinessCodes('viewer'), ['viewer'])
  assert.deepEqual(mapLegacyMemberRoleToBusinessCodes('member'), ['operator'])
  assert.deepEqual(mapLegacyMemberRoleToBusinessCodes('tenant_engineer'), ['operator'])
})

test('cannot grant permissions the actor lacks', () => {
  assert.deepEqual(permissionsSubset(['product.read'], ['product.read', 'settings.configure']), [
    'settings.configure',
  ])
  assert.match(forbiddenPermissionMessage('finance.approve'), /finance\.approve/)
})
