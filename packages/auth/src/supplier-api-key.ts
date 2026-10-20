/**
 * 供应商 API-Key 凭证
 *
 * 与 merchant-api-key.ts 同构，但主体是 `organization.id`（供应商门户的
 * activeOrganizationId）而不是 merchant.id。约定完全一致：
 *   1. 只存 sha256(明文)，不存明文；明文仅在签发时返回一次
 *   2. keyPrefix 存前 8 位供列表页定位，不足以还原明文
 *   3. revokedAt / expiresAt 任一命中即失效
 *   4. 每次校验成功顺手 touch lastUsedAt
 *
 * 供应商身份必须由凭证派生，**绝不能作为入参**，否则供应商 A 可操作供应商 B 的数据。
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  SUPPLIER_API_KEY_SCOPES,
  supplierApiKey,
  type AppDbSchema,
  type SupplierApiKeyScope,
} from '@workspace/db/schema'

/** 调用方传入的 db 实例（各 app 自建连接，这里只用到 drizzle 的通用接口） */
type Db = NodePgDatabase<AppDbSchema>

/** 供应商 API-Key 明文前缀，与商户的 grk_ 区分 */
const KEY_PREFIX = 'srk'
const KEY_RANDOM_BYTES = 32

export class SupplierApiKeyError extends Error {
  readonly code:
    | 'API_KEY_MISSING'
    | 'API_KEY_INVALID'
    | 'API_KEY_REVOKED'
    | 'API_KEY_EXPIRED'
    | 'API_KEY_SCOPE_DENIED'

  constructor(code: SupplierApiKeyError['code'], message: string) {
    super(message)
    this.name = 'SupplierApiKeyError'
    this.code = code
  }
}

export interface SupplierApiKeyScopeSet {
  [scope: string]: true
}

export interface IssuedSupplierApiKey {
  /** 仅此一次可见，库中只存 hash */
  plaintext: string
  id: string
  name: string
  keyPrefix: string
  scopes: SupplierApiKeyScope[]
  createdAt: Date
}

export interface VerifiedSupplierApiKey {
  keyId: string
  organizationId: string
  name: string
  scopes: SupplierApiKeyScopeSet
}

/** sha256 十六进制 */
export function hashSupplierApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex')
}

const HEX_RE = /^[0-9a-f]+$/

/**
 * 常量时间比较两个等长 hex。
 *
 * 三个都必须先判掉，否则会静默返回 true：
 *   - 长度不等
 *   - 非法 hex（`Buffer.from('zz','hex')` 得到空 buffer，两个空 buffer 的
 *     timingSafeEqual 返回 **true**）
 *   - 空串
 */
export function safeEqualSupplierHex(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false
  if (a.length % 2 !== 0) return false
  if (!HEX_RE.test(a) || !HEX_RE.test(b)) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export function parseSupplierScopes(raw: string): SupplierApiKeyScopeSet {
  const set: SupplierApiKeyScopeSet = {}
  for (const s of raw.split(',')) {
    const trimmed = s.trim()
    if (trimmed) set[trimmed] = true
  }
  return set
}

export function serializeSupplierScopes(
  scopes: readonly SupplierApiKeyScope[],
): string {
  const unique = [...new Set(scopes)]
  for (const s of unique) {
    if (!SUPPLIER_API_KEY_SCOPES.includes(s)) {
      throw new Error(`未知的 API-Key scope: ${s}`)
    }
  }
  return unique.join(',')
}

const assertSupplierScopes = (
  scopes: readonly SupplierApiKeyScope[],
): SupplierApiKeyScope[] => {
  if (scopes.length === 0) {
    throw new Error('至少需要一个 scope')
  }
  return serializeSupplierScopes(scopes).split(',') as SupplierApiKeyScope[]
}

/**
 * 签发一把新凭证。
 * 返回的 plaintext 请立即落日志/展示给用户，**无法再次取回**。
 */
export async function createSupplierApiKey(
  db: Db,
  input: {
    organizationId: string
    name: string
    scopes: readonly SupplierApiKeyScope[]
    expiresAt?: Date | null
    createdBy?: string | null
  },
): Promise<IssuedSupplierApiKey> {
  const scopes = assertSupplierScopes(input.scopes)

  // 32 字节 CSPRNG → base64url，明文不可预测
  const plaintext = `${KEY_PREFIX}_${randomBytes(KEY_RANDOM_BYTES).toString('base64url')}`
  const keyHash = hashSupplierApiKey(plaintext)
  const keyPrefix = plaintext.slice(0, 8)
  const id = crypto.randomUUID()

  await db.insert(supplierApiKey).values({
    id,
    organizationId: input.organizationId,
    name: input.name,
    keyHash,
    keyPrefix,
    scopes: serializeSupplierScopes(scopes),
    expiresAt: input.expiresAt ?? null,
    createdBy: input.createdBy ?? null,
  })

  return {
    plaintext,
    id,
    name: input.name,
    keyPrefix,
    scopes,
    createdAt: new Date(),
  }
}

/**
 * 校验明文并派生供应商组织身份。
 *
 * 拿到 VerifiedSupplierApiKey 才能继续后续处理，organizationId 一律取自凭证。
 */
export async function verifySupplierApiKey(
  db: Db,
  plaintext: string | undefined | null,
  opts: { requireScope?: SupplierApiKeyScope; now?: Date } = {},
): Promise<VerifiedSupplierApiKey> {
  if (!plaintext) {
    throw new SupplierApiKeyError('API_KEY_MISSING', '缺少 API-Key')
  }

  const keyHash = hashSupplierApiKey(plaintext)
  const [row] = await db
    .select()
    .from(supplierApiKey)
    .where(eq(supplierApiKey.keyHash, keyHash))
    .limit(1)

  // 库中没命中：用一份等长假 hash 走完比较，避免「命中/未命中」耗时差异泄露凭证是否存在
  if (!row) {
    safeEqualSupplierHex(keyHash, hashSupplierApiKey(`${KEY_PREFIX}_${'0'.repeat(43)}`))
    throw new SupplierApiKeyError('API_KEY_INVALID', 'API-Key 无效')
  }

  if (row.revokedAt) {
    throw new SupplierApiKeyError('API_KEY_REVOKED', 'API-Key 已被吊销')
  }

  const now = opts.now ?? new Date()
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    throw new SupplierApiKeyError('API_KEY_EXPIRED', 'API-Key 已过期')
  }

  const scopes = parseSupplierScopes(row.scopes)
  if (opts.requireScope && !scopes[opts.requireScope]) {
    throw new SupplierApiKeyError(
      'API_KEY_SCOPE_DENIED',
      `API-Key 缺少 scope: ${opts.requireScope}`,
    )
  }

  return {
    keyId: row.id,
    organizationId: row.organizationId,
    name: row.name,
    scopes,
  }
}

/** 记录使用时间（审计用；失败不影响主流程） */
export async function touchSupplierApiKey(db: Db, keyId: string): Promise<void> {
  try {
    await db
      .update(supplierApiKey)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(supplierApiKey.id, keyId))
  } catch {
    // 审计字段写失败不应阻断业务请求
  }
}

/** 吊销 key（按供应商组织维度，确保无法吊销他人 key） */
export async function revokeSupplierApiKey(
  db: Db,
  input: { organizationId: string; keyId: string },
): Promise<boolean> {
  const rows = await db
    .update(supplierApiKey)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(supplierApiKey.id, input.keyId),
        eq(supplierApiKey.organizationId, input.organizationId),
      ),
    )
    .returning({ id: supplierApiKey.id })
  return rows.length > 0
}

export type SupplierApiKeyStatus = 'active' | 'revoked' | 'expired'

/**
 * API-Key 的三态判定。
 *
 * 分页查询在 dataaccess 层做（那里有 status 的 SQL 条件），这里只给
 * 「已取出的行」判定展示状态，保证两处口径一致。
 */
export function supplierApiKeyStatusOf(
  row: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): SupplierApiKeyStatus {
  if (row.revokedAt) return 'revoked'
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'active'
}
