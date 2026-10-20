/**
 * 商户 API-Key 凭证 — 设计依据 merchant-module-review-and-design.md §7.1 / P0-6
 *
 * 形态 B/C（商户系统直连平台 OpenAPI）的**唯一**鉴权来源：
 * merchantId 必须由凭证派生，**绝不能作为入参**，否则商户 A 可操作商户 B 的数据。
 *
 * 安全约定：
 *   1. 只存 sha256(明文)，不存明文；明文仅在创建时返回一次
 *   2. keyPrefix 存前 8 位供列表页定位，不足以还原明文
 *   3. revokedAt / expiresAt 任一命中即失效
 *   4. 每次校验成功顺手 touch lastUsedAt（写放大可控，审计价值高）
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { and, desc, eq, gt, isNull, or, type SQL } from "drizzle-orm"
import { merchantApiKey, MERCHANT_API_KEY_SCOPES, type MerchantApiKeyScope } from "@workspace/db/schema"

type Db = any

/** API-Key 明文前缀，便于在日志/列表里一眼识别 */
const KEY_PREFIX = "grk"
/** 明文总长度：前缀 + base64url(32 随机字节) ≈ 50 字符 */
const KEY_RANDOM_BYTES = 32

export class MerchantApiKeyError extends Error {
  readonly code:
    | "API_KEY_MISSING"
    | "API_KEY_INVALID"
    | "API_KEY_REVOKED"
    | "API_KEY_EXPIRED"
    | "API_KEY_SCOPE_DENIED"

  constructor(
    code: MerchantApiKeyError["code"],
    message: string,
  ) {
    super(message)
    this.name = "MerchantApiKeyError"
    this.code = code
  }
}

export interface MerchantApiKeyScopeSet {
  [scope: string]: true
}

export interface IssuedApiKey {
  /** 仅此一次可见，库中只存 hash */
  plaintext: string
  id: string
  name: string
  keyPrefix: string
  scopes: MerchantApiKeyScope[]
  createdAt: Date
}

export interface VerifiedApiKey {
  keyId: string
  merchantId: string
  name: string
  scopes: MerchantApiKeyScopeSet
}

const newId = (): string => crypto.randomUUID()

/** sha256 十六进制 */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex")
}

const HEX_RE = /^[0-9a-f]+$/

/**
 * 常量时间比较两个等长 hex。
 *
 * 三个都必须先判掉，否则会静默返回 true：
 *   - 长度不等
 *   - 非法 hex（`Buffer.from('zz','hex')` 得到空 buffer，
 *     两个空 buffer 的 timingSafeEqual 返回 **true**）
 *   - 空串
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false
  if (a.length % 2 !== 0) return false
  if (!HEX_RE.test(a) || !HEX_RE.test(b)) return false
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
}

export function parseScopes(raw: string): MerchantApiKeyScopeSet {
  const set: MerchantApiKeyScopeSet = {}
  for (const s of raw.split(",")) {
    const trimmed = s.trim()
    if (trimmed) set[trimmed] = true
  }
  return set
}

export function serializeScopes(scopes: readonly MerchantApiKeyScope[]): string {
  const unique = [...new Set(scopes)]
  for (const s of unique) {
    if (!MERCHANT_API_KEY_SCOPES.includes(s)) {
      throw new Error(`未知的 API-Key scope: ${s}`)
    }
  }
  return unique.join(",")
}

const assertScopes = (scopes: readonly MerchantApiKeyScope[]): MerchantApiKeyScope[] => {
  if (scopes.length === 0) {
    throw new Error("至少需要一个 scope")
  }
  return serializeScopes(scopes).split(",") as MerchantApiKeyScope[]
}

/**
 * 签发一把新凭证。
 * 返回的 plaintext 请立即落日志/展示给用户，**无法再次取回**。
 */
export async function createMerchantApiKey(
  db: Db,
  input: {
    merchantId: string
    name: string
    scopes: readonly MerchantApiKeyScope[]
    expiresAt?: Date | null
    createdBy?: string | null
  },
): Promise<IssuedApiKey> {
  const scopes = assertScopes(input.scopes)

  // 32 字节 CSPRNG → base64url，明文不可预测（无字典攻击面，故 sha256 足够）
  const plaintext = `${KEY_PREFIX}_${randomBytes(KEY_RANDOM_BYTES).toString("base64url")}`
  const keyHash = hashApiKey(plaintext)
  const keyPrefix = plaintext.slice(0, 8)
  const id = newId()

  await db.insert(merchantApiKey).values({
    id,
    merchantId: input.merchantId,
    name: input.name,
    keyHash,
    keyPrefix,
    scopes: serializeScopes(scopes),
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
 * 校验明文并派生商户身份。
 *
 * 这是所有 `/api/v1/*` 商户侧端点的**唯一**入口：拿到 VerifiedApiKey 才能
 * 继续后续处理，merchantId 一律取自凭证。
 */
export async function verifyMerchantApiKey(
  db: Db,
  plaintext: string | undefined | null,
  opts: { requireScope?: MerchantApiKeyScope; now?: Date } = {},
): Promise<VerifiedApiKey> {
  if (!plaintext) {
    throw new MerchantApiKeyError("API_KEY_MISSING", "缺少 API-Key")
  }

  const keyHash = hashApiKey(plaintext)
  const [row] = await db
    .select()
    .from(merchantApiKey)
    .where(eq(merchantApiKey.keyHash, keyHash))
    .limit(1)

  // 库中没命中：用一份等长假 hash 走完比较，避免「命中/未命中」耗时差异泄露凭证是否存在
  if (!row) {
    safeEqualHex(keyHash, hashApiKey(`grk_${"0".repeat(43)}`))
    throw new MerchantApiKeyError("API_KEY_INVALID", "API-Key 无效")
  }

  if (row.revokedAt) {
    throw new MerchantApiKeyError("API_KEY_REVOKED", "API-Key 已被吊销")
  }

  const now = opts.now ?? new Date()
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
    throw new MerchantApiKeyError("API_KEY_EXPIRED", "API-Key 已过期")
  }

  const scopes = parseScopes(row.scopes)
  if (opts.requireScope && !scopes[opts.requireScope]) {
    throw new MerchantApiKeyError(
      "API_KEY_SCOPE_DENIED",
      `API-Key 缺少 scope: ${opts.requireScope}`,
    )
  }

  return {
    keyId: row.id,
    merchantId: row.merchantId,
    name: row.name,
    scopes,
  }
}

/** 记录使用时间（审计用；失败不影响主流程） */
export async function touchMerchantApiKey(db: Db, keyId: string): Promise<void> {
  try {
    await db
      .update(merchantApiKey)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(merchantApiKey.id, keyId))
  } catch {
    // 审计字段写失败不应阻断业务请求
  }
}

export async function revokeMerchantApiKey(
  db: Db,
  input: { merchantId: string; keyId: string },
): Promise<boolean> {
  const rows = await db
    .update(merchantApiKey)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(merchantApiKey.id, input.keyId), eq(merchantApiKey.merchantId, input.merchantId)))
    .returning({ id: merchantApiKey.id })
  return rows.length > 0
}

export interface MerchantApiKeyListItem {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  status: "active" | "revoked" | "expired"
  expiresAt: Date | null
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

const statusOf = (
  row: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): MerchantApiKeyListItem["status"] => {
  if (row.revokedAt) return "revoked"
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "expired"
  return "active"
}

export async function listMerchantApiKeys(
  db: Db,
  input: { merchantId: string; onlyActive?: boolean; limit?: number },
): Promise<MerchantApiKeyListItem[]> {
  const now = new Date()
  const limit = Math.min(100, Math.max(1, input.limit ?? 50))

  const conditions: SQL[] = [eq(merchantApiKey.merchantId, input.merchantId)]
  if (input.onlyActive) {
    // 有效 = 未吊销 且 (无过期时间 或 过期时间在未来)
    conditions.push(isNull(merchantApiKey.revokedAt))
    conditions.push(or(isNull(merchantApiKey.expiresAt), gt(merchantApiKey.expiresAt, now))!)
  }

  const rows = await db
    .select()
    .from(merchantApiKey)
    .where(and(...conditions))
    .orderBy(desc(merchantApiKey.createdAt))
    .limit(limit)

  return rows.map((row: (typeof rows)[number]) => ({
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes.split(",").filter(Boolean),
    status: statusOf(row, now),
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  }))
}

/**
 * 从 HTTP 头或 query 中提取明文（支持 `Bearer <key>` / `Token <key>` / 裸 key）
 *
 * 注意：只有前缀没有 token 时必须返回 null —— 否则 `'Bearer '` 会被当成
 * 明文 `'Bearer'` 拿去查库，虽查不到但白白多一次查询，且语义上是错的。
 */
export function extractApiKeyFromHeader(header: string | undefined | null): string | null {
  if (!header) return null
  const raw = header.trim()
  if (!raw) return null

  const SCHEMES = new Set(['bearer', 'token', 'apikey'])

  // 形如 `Bearer <key>`：先在**未截断 token** 的原文上拆 scheme
  const prefixed = /^([A-Za-z]+)\s+(.*)$/.exec(raw)
  if (prefixed) {
    const scheme = prefixed[1]
    const token = prefixed[2]
    if (scheme === undefined || token === undefined) return null
    if (!SCHEMES.has(scheme.toLowerCase())) return null
    return token.trim() || null
  }

  // 裸 token：不得含空白
  if (/\s/.test(raw)) return null
  // 形如 `Bearer ` 的畸形头 trim 后只剩 scheme 本身，不能当成明文去查库
  if (SCHEMES.has(raw.toLowerCase())) return null

  return raw
}
