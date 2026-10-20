import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MerchantApiKeyError,
  extractApiKeyFromHeader,
  hashApiKey,
  parseScopes,
  safeEqualHex,
  serializeScopes,
} from './merchant-api-key'

// ---------------------------------------------------------------------------
// 纯函数层（无需 DB）：hash / scope 序列化 / 头解析
// ---------------------------------------------------------------------------

test('hashApiKey 是确定性的 sha256 hex，且不含明文', () => {
  const key = 'grk_abcdefghijklmnop'
  const h1 = hashApiKey(key)
  const h2 = hashApiKey(key)
  assert.equal(h1, h2)
  assert.equal(h1.length, 64)
  assert.match(h1, /^[0-9a-f]{64}$/)
  assert.ok(!h1.includes(key))
})

test('不同明文产生不同 hash（唯一索引不会误判碰撞）', () => {
  assert.notEqual(hashApiKey('grk_a'), hashApiKey('grk_b'))
})

test('safeEqualHex 正确区分相等/不等/长度不同', () => {
  const h = hashApiKey('grk_x')
  assert.equal(safeEqualHex(h, hashApiKey('grk_x')), true)
  assert.equal(safeEqualHex(h, hashApiKey('grk_y')), false)
  assert.equal(safeEqualHex('abcd', 'ab'), false)
  // 非法 hex 不应抛异常，只返回 false（避免 500 泄露）
  assert.equal(safeEqualHex('zz', 'zz'), false)
})

test('serializeScopes 去重且保持顺序', () => {
  assert.equal(
    serializeScopes(['consumption:write', 'balance:read', 'consumption:write']),
    'consumption:write,balance:read',
  )
})

test('serializeScopes 拒绝未知 scope（防止写库后永远鉴权失败）', () => {
  assert.throws(
    () => serializeScopes(['balance:read', 'not:a:scope' as never]),
    /未知的 API-Key scope/,
  )
})

test('parseScopes 容错空白，忽略空段', () => {
  assert.deepEqual(parseScopes(' balance:read , ,consumption:write '), {
    'balance:read': true,
    'consumption:write': true,
  })
  assert.deepEqual(parseScopes(''), {})
})

test('extractApiKeyFromHeader 支持 Bearer 与裸 token', () => {
  assert.equal(extractApiKeyFromHeader('Bearer grk_abc'), 'grk_abc')
  assert.equal(extractApiKeyFromHeader('bearer   grk_abc  '), 'grk_abc')
  assert.equal(extractApiKeyFromHeader('grk_abc'), 'grk_abc')
  assert.equal(extractApiKeyFromHeader(''), null)
  assert.equal(extractApiKeyFromHeader(null), null)
  assert.equal(extractApiKeyFromHeader('   '), null)
  // 只有 Bearer 前缀没有 token 时不能把 'Bearer' 当成 key
  assert.equal(extractApiKeyFromHeader('Bearer '), null)
})

// ---------------------------------------------------------------------------
// 错误码契约（apps/api 中间件按 code 映射 HTTP 状态码）
// ---------------------------------------------------------------------------

test('MerchantApiKeyError 携带可映射的 code', () => {
  const err = new MerchantApiKeyError('API_KEY_SCOPE_DENIED', 'no scope')
  assert.equal(err.code, 'API_KEY_SCOPE_DENIED')
  assert.equal(err.name, 'MerchantApiKeyError')
  assert.ok(err instanceof Error)
})
