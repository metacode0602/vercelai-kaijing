/**
 * API-Key 鉴权的 HTTP 语义 —— 纯函数，无数据库依赖。
 *
 * 单独成文件的原因：`api-key-auth.ts` 在模块加载时就会建立数据库连接，
 * 纯逻辑若与它同文件，测试就必须连上真库才能跑。这里拆开后测试是 hermetic 的。
 */

import type { MerchantApiKeyError } from "@workspace/auth"
import type { MerchantApiKeyScope } from "@workspace/db/schema"

/**
 * 401 vs 403 的分界：凭证本身不可信（缺失/无效/吊销/过期）一律 401；
 * 凭证有效但权限不足才是 403。
 *
 * 这个边界是安全语义，客户端据此决定是「换 key」还是「申请提权」，
 * 所以单测锁定，不依赖数据库。
 */
export const STATUS_BY_CODE: Record<MerchantApiKeyError["code"], 401 | 403> = {
  API_KEY_MISSING: 401,
  API_KEY_INVALID: 401,
  API_KEY_REVOKED: 401,
  API_KEY_EXPIRED: 401,
  API_KEY_SCOPE_DENIED: 403,
}

export interface ApiKeyErrorBody {
  error: string
  code: MerchantApiKeyError["code"]
  message: string
  requiredScope?: MerchantApiKeyScope
}

/** 构造统一的鉴权失败响应体 */
export function apiKeyErrorBody(
  code: MerchantApiKeyError["code"],
  message: string,
  requiredScope?: MerchantApiKeyScope,
): ApiKeyErrorBody {
  return {
    error: "unauthorized",
    code,
    message,
    // 客户端据此知道自己缺哪个 scope，而不是让商户猜。
    // 401 场景刻意不返回：否则等于给攻击者一个权限探测面。
    requiredScope: code === "API_KEY_SCOPE_DENIED" ? requiredScope : undefined,
  }
}
