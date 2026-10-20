/**
 * 商户 API-Key 鉴权中间件 — 设计 §7.1 / P0-6
 *
 * 形态 B/C（商户系统直连平台 OpenAPI）的唯一鉴权来源。
 *
 * 关键约束：**merchantId 一律由凭证派生，绝不作为入参**。
 * 修复前 `/api/v1/tasks` 把 merchantId 放在 body/query 里，商户 A 只要改个参数
 * 就能读写商户 B 的任务（P0 资金/数据事故）。现在调用方拿不到就 401。
 */

import {
  MerchantApiKeyError,
  extractApiKeyFromHeader,
  touchMerchantApiKey,
  verifyMerchantApiKey,
  type VerifiedApiKey,
} from "@workspace/auth"
import type { MerchantApiKeyScope as Scope } from "@workspace/db/schema"
import { timingSafeEqual } from "node:crypto"
import type { Context, MiddlewareHandler } from "hono"
import { apiKeyErrorBody, STATUS_BY_CODE } from "./api-key-status"
import { db } from "./db"
import { env } from "./env"

export { apiKeyErrorBody, STATUS_BY_CODE } from "./api-key-status"

export interface MerchantAuth {
  keyId: string
  merchantId: string
  keyName: string
  scopes: Record<string, true>
}

declare module "hono" {
  interface ContextVariableMap {
    /** 由 requireMerchantApiKey() 注入；未经过鉴权的路由上为 undefined */
    merchantAuth: MerchantAuth
    /** 幂等重放标记：同一 idempotency_key 命中已存在流水时置 true */
    idempotentReplay: boolean
  }
}

/** 常量时间比较两个字符串（长度不等直接 false） */
function safeEqualText(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * 生成一个要求指定 scope 的中间件。
 *
 * 用法：
 * ```ts
 * tasks.use("/*", requireMerchantApiKey("consumption:write"))
 * ```
 */
export function requireMerchantApiKey(scope: Scope): MiddlewareHandler {
  return async (c: Context, next) => {
    // 只接受 Authorization 头；query 传 key 会进 access log / referer，不安全
    const plaintext = extractApiKeyFromHeader(c.req.header("Authorization"))

    let verified: VerifiedApiKey
    try {
      verified = await verifyMerchantApiKey(db, plaintext, { requireScope: scope })
    } catch (error) {
      if (error instanceof MerchantApiKeyError) {
        return c.json(apiKeyErrorBody(error.code, error.message, scope), STATUS_BY_CODE[error.code])
      }
      throw error
    }

    c.set("merchantAuth", {
      keyId: verified.keyId,
      merchantId: verified.merchantId,
      keyName: verified.name,
      scopes: verified.scopes,
    })
    c.set("idempotentReplay", false)

    await next()

    // 审计：记录本次调用发生在哪个时刻（不阻塞响应）
    await touchMerchantApiKey(db, verified.keyId)
  }
}

/** 从 context 取已鉴权凭证；未鉴权时抛错（防止路由漏挂中间件却继续跑） */
export function requireMerchantAuth(c: Context): MerchantAuth {
  const auth = c.get("merchantAuth")
  if (!auth) {
    throw new MerchantApiKeyError(
      "API_KEY_MISSING",
      "路由未挂 requireMerchantApiKey 中间件，缺少商户鉴权上下文",
    )
  }
  return auth
}

/** scope 断言：给不通过中间件但需要细粒度判断的场景用 */
export function assertScope(auth: MerchantAuth, scope: Scope): void {
  if (!auth.scopes[scope]) {
    throw new MerchantApiKeyError("API_KEY_SCOPE_DENIED", `API-Key 缺少 scope: ${scope}`)
  }
}

/**
 * 平台内部同步凭证校验（`/api/v1/sync/*`）。
 *
 * 与商户凭证是**两套独立**体系：内部服务用共享密钥，不占用商户的 key 配额，
 * 也不派生 merchantId（内部同步是平台级动作）。
 */
export function requireInternalSyncKey(): MiddlewareHandler {
  return async (c: Context, next) => {
    const expected = env.INTERNAL_SYNC_API_KEY
    if (!expected) {
      return c.json(
        {
          error: "unauthorized",
          code: "INTERNAL_SYNC_KEY_NOT_CONFIGURED",
          message: "INTERNAL_SYNC_API_KEY 未配置，内部同步端点已禁用",
        },
        401,
      )
    }

    const provided = extractApiKeyFromHeader(c.req.header("Authorization"))
    if (!provided) {
      return c.json({ error: "unauthorized", code: "API_KEY_MISSING" }, 401)
    }

    // 常量时间比较，避免逐字节爆破时序侧信道
    const ok = safeEqualText(provided, expected)

    if (!ok) {
      return c.json({ error: "unauthorized", code: "API_KEY_INVALID" }, 401)
    }

    await next()
  }
}
