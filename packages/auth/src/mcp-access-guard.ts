/**
 * MCP 请求鉴权决策：环境开关 + 组织开关 + 吊销/停用检查。
 * 组织只能来自令牌声明或 API 密钥行，不得使用请求体或 SHOP_DEV_ORGANIZATION_ID。
 */
import {
  readOrganizationIdFromTokenClaims,
  type AccessTokenOrgClaims,
} from "./access-token"

export const MCP_UNAUTHORIZED = "mcp_unauthorized"
export const MCP_FORBIDDEN = "mcp_forbidden"

export type McpAccessDenial = {
  ok: false
  status: 401 | 403
  code: typeof MCP_UNAUTHORIZED | typeof MCP_FORBIDDEN
  message: string
}

export type McpAccessGrant = {
  ok: true
  organizationId: string
}

export type McpAccessDecision = McpAccessGrant | McpAccessDenial

export function evaluateMcpAccess(input: {
  envEnabled: boolean
  organizationEnabled: boolean
  clientDisabled?: boolean
  keyDisabled?: boolean
  tokenRevoked?: boolean
  tokenExpired?: boolean
  claims?: AccessTokenOrgClaims | null
  requestOrgId?: string | null
  sessionOrgId?: string | null
  devOrganizationId?: string | null
}): McpAccessDecision {
  if (!input.envEnabled) {
    return { ok: false, status: 401, code: MCP_UNAUTHORIZED, message: "工作台 MCP 未启用" }
  }
  if (input.clientDisabled || input.keyDisabled) {
    return {
      ok: false,
      status: 401,
      code: MCP_UNAUTHORIZED,
      message: "客户端或密钥已停用",
    }
  }
  if (input.tokenRevoked) {
    return { ok: false, status: 401, code: MCP_UNAUTHORIZED, message: "访问令牌已吊销" }
  }
  if (input.tokenExpired) {
    return { ok: false, status: 401, code: MCP_UNAUTHORIZED, message: "访问令牌已过期" }
  }

  let organizationId: string
  try {
    organizationId = readOrganizationIdFromTokenClaims(input.claims ?? {}, {
      requestOrgId: input.requestOrgId,
      sessionOrgId: input.sessionOrgId ?? input.devOrganizationId,
    })
  } catch {
    return {
      ok: false,
      status: 401,
      code: MCP_UNAUTHORIZED,
      message: "访问令牌缺少有效的组织绑定",
    }
  }

  // 明确忽略开发期组织绕过与请求/会话中的组织。
  void input.devOrganizationId
  void input.requestOrgId
  void input.sessionOrgId

  if (!input.organizationEnabled) {
    return {
      ok: false,
      status: 403,
      code: MCP_FORBIDDEN,
      message: "该组织尚未开通工作台接入",
    }
  }

  return { ok: true, organizationId }
}

export function hasRequiredScope(scopes: readonly string[], required: string): boolean {
  return scopes.includes(required)
}
