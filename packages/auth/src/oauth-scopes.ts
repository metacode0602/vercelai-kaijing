/**
 * Open Shop 授权范围。签发列表不含 `openshop:write.confirm`。
 * @see docs/design/open-shop-desktop-mcp-upgrade-2026-11-12.md §6
 */
export const OPENSHOP_READ_SCOPE = "openshop:read"
export const OPENSHOP_WRITE_PENDING_SCOPE = "openshop:write.pending"

/** 仅控制台确认待审使用，不得向任何 OAuth / MCP 客户端签发。 */
export const OPENSHOP_WRITE_CONFIRM_SCOPE = "openshop:write.confirm"

/** 与 @better-auth/oauth-provider DEFAULT_OAUTH_SCOPES 对齐。 */
export const OPENSHOP_OIDC_SCOPES = ["openid", "profile", "email", "offline_access"] as const

export const OPENSHOP_ISSUABLE_SCOPES = [
  ...OPENSHOP_OIDC_SCOPES,
  OPENSHOP_READ_SCOPE,
  OPENSHOP_WRITE_PENDING_SCOPE,
] as const

export type OpenshopIssuableScope = (typeof OPENSHOP_ISSUABLE_SCOPES)[number]

export const OPENSHOP_SCOPE_LABELS_ZH: Record<
  string,
  { title: string; description: string }
> = {
  openid: { title: "登录身份", description: "确认你的账号身份。" },
  profile: { title: "基本资料", description: "读取你的显示名称等基本资料。" },
  email: { title: "邮箱", description: "读取你的邮箱地址。" },
  offline_access: {
    title: "离线访问",
    description: "在你离开后保持授权，以便工作台继续访问本组织。",
  },
  [OPENSHOP_READ_SCOPE]: {
    title: "读取经营数据",
    description: "读取本组织的商品、刊登、库存、订单与履约等信息。",
  },
  [OPENSHOP_WRITE_PENDING_SCOPE]: {
    title: "提交待审变更",
    description: "创建改价、库存等待审事项，需运营在控制台确认后才会生效。",
  },
}

export function isIssuableScope(scope: string): boolean {
  return (OPENSHOP_ISSUABLE_SCOPES as readonly string[]).includes(scope)
}

export function parseScopeList(scope?: string | readonly string[] | null): string[] {
  const raw = typeof scope === "string" ? scope.split(/[\s,]+/) : [...(scope ?? [])]
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
}

export function assertIssuableScopes(scopes: readonly string[]): void {
  const forbidden = scopes.filter((scope) => !isIssuableScope(scope))
  if (forbidden.length > 0) {
    throw new Error(`不可签发的授权范围: ${forbidden.join(", ")}`)
  }
}
