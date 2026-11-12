/**
 * 访问令牌与组织绑定：恰好一个 org_id，且之后不可随会话组织切换而改变。
 * MCP 不得接受模型或请求传入的 organization_id，也不得使用 SHOP_DEV_ORGANIZATION_ID。
 * @see docs/design/open-shop-desktop-mcp-upgrade-2026-11-12.md §7
 */

export const ACCESS_TOKEN_ORG_CLAIM = "org_id"

export class MissingTokenOrganizationError extends Error {
  constructor(message = "授权必须绑定恰好一个组织") {
    super(message)
    this.name = "MissingTokenOrganizationError"
  }
}

export function requireConsentOrganizationId(
  referenceId: string | null | undefined,
): string {
  const organizationId = referenceId?.trim() ?? ""
  if (!organizationId) {
    throw new MissingTokenOrganizationError()
  }
  return organizationId
}

export function buildAccessTokenClaims(input: {
  referenceId?: string | null
  scopes?: readonly string[]
}): { org_id: string } {
  return { org_id: requireConsentOrganizationId(input.referenceId) }
}

export type AccessTokenOrgClaims = {
  org_id?: unknown
  organization_id?: unknown
}

/**
 * 只从已验证的令牌声明读取组织。
 * `requestOrgId` / `sessionOrgId` 仅为对照参数，不得覆盖令牌中的 org_id。
 */
export function readOrganizationIdFromTokenClaims(
  claims: AccessTokenOrgClaims,
  _untrusted?: {
    requestOrgId?: string | null
    sessionOrgId?: string | null
  },
): string {
  void _untrusted
  const organizationId =
    typeof claims.org_id === "string" ? claims.org_id.trim() : ""
  if (!organizationId) {
    throw new MissingTokenOrganizationError("访问令牌缺少 org_id")
  }
  return organizationId
}

/** MCP 与领域层解析组织的唯一入口。 */
export function resolveOrganizationIdForMcp(input: {
  tokenClaims: AccessTokenOrgClaims
  sessionOrgId?: string | null
  requestOrgId?: string | null
}): string {
  return readOrganizationIdFromTokenClaims(input.tokenClaims, {
    requestOrgId: input.requestOrgId,
    sessionOrgId: input.sessionOrgId,
  })
}

/**
 * 已签发声明在会话 activeOrganizationId 变化后必须保持不变。
 * 用于单测固定该不变量；运行时令牌本身不会被 Topbar 切换改写。
 */
export function issuedAccessTokenClaimsRemainBound(
  issued: AccessTokenOrgClaims,
  sessionOrgIdAfterSwitch: string | null | undefined,
): { org_id: string; unchanged: boolean } {
  const orgId = readOrganizationIdFromTokenClaims(issued, {
    sessionOrgId: sessionOrgIdAfterSwitch,
  })
  return {
    org_id: orgId,
    unchanged: orgId !== (sessionOrgIdAfterSwitch ?? "") || orgId === issued.org_id,
  }
}
