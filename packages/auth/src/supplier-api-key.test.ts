import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SupplierApiKeyError,
  hashSupplierApiKey,
  parseSupplierScopes,
  safeEqualSupplierHex,
  serializeSupplierScopes,
  supplierApiKeyStatusOf,
} from './supplier-api-key'

// ---------------------------------------------------------------------------
// 纯函数层（无需 DB）
// ---------------------------------------------------------------------------

test('hashSupplierApiKey 是确定性的 sha256 hex，且不含明文', () => {
  const key = 'srk_abcdefghijklmnop'
  const h1 = hashSupplierApiKey(key)
  const h2 = hashSupplierApiKey(key)
  assert.equal(h1, h2)
  assert.equal(h1.length, 64)
  assert.match(h1, /^[0-9a-f]{64}$/)
  assert.ok(!h1.includes(key))
})

test('safeEqualSupplierHex 正确区分相等/不等/长度不同', () => {
  const h = hashSupplierApiKey('srk_x')
  assert.equal(safeEqualSupplierHex(h, hashSupplierApiKey('srk_x')), true)
  assert.equal(safeEqualSupplierHex(h, hashSupplierApiKey('srk_y')), false)
  assert.equal(safeEqualSupplierHex('abcd', 'ab'), false)
  // 非法 hex 不得抛异常，只返回 false（否则 500 会泄露比较逻辑）
  assert.equal(safeEqualSupplierHex('zz', 'zz'), false)
  assert.equal(safeEqualSupplierHex('', ''), false)
})

test('serializeSupplierScopes 去重且保持顺序', () => {
  assert.equal(
    serializeSupplierScopes(['resource:read', 'settlement:read', 'resource:read']),
    'resource:read,settlement:read',
  )
})

test('serializeSupplierScopes 拒绝未知 scope（防止写库后永远鉴权失败）', () => {
  assert.throws(
    () => serializeSupplierScopes(['resource:read', 'nope:write' as never]),
    /未知的 API-Key scope/,
  )
})

test('parseSupplierScopes 容错空白，忽略空段', () => {
  assert.deepEqual(parseSupplierScopes(' resource:read , ,settlement:write '), {
    'resource:read': true,
    'settlement:write': true,
  })
  assert.deepEqual(parseSupplierScopes(''), {})
})

// ---------------------------------------------------------------------------
// 状态判定：revoked 优先于 expired
// ---------------------------------------------------------------------------

const NOW = new Date('2026-01-01T00:00:00Z')

test('supplierApiKeyStatusOf：无 revokedAt / 未过期 => active', () => {
  assert.equal(supplierApiKeyStatusOf({ revokedAt: null, expiresAt: null }, NOW), 'active')
  assert.equal(
    supplierApiKeyStatusOf(
      { revokedAt: null, expiresAt: new Date('2026-06-01T00:00:00Z') },
      NOW,
    ),
    'active',
  )
})

test('supplierApiKeyStatusOf：已过期 => expired', () => {
  assert.equal(
    supplierApiKeyStatusOf(
      { revokedAt: null, expiresAt: new Date('2025-12-31T23:59:59Z') },
      NOW,
    ),
    'expired',
  )
  // 边界：expiresAt 恰等于 now 即视为过期
  assert.equal(supplierApiKeyStatusOf({ revokedAt: null, expiresAt: NOW }, NOW), 'expired')
})

test('supplierApiKeyStatusOf：吊销优先于过期', () => {
  assert.equal(
    supplierApiKeyStatusOf(
      { revokedAt: new Date('2025-01-01T00:00:00Z'), expiresAt: new Date('2025-01-01T00:00:00Z') },
      NOW,
    ),
    'revoked',
  )
})

test('SupplierApiKeyError 携带可映射的 code', () => {
  const err = new SupplierApiKeyError('API_KEY_SCOPE_DENIED', 'no scope')
  assert.equal(err.code, 'API_KEY_SCOPE_DENIED')
  assert.equal(err.name, 'SupplierApiKeyError')
  assert.ok(err instanceof Error)
})
