export type McpEnv = {
  OPENSHOP_MCP_ENABLED: boolean
  OPENSHOP_MCP_RESOURCE?: string
  OPENSHOP_OAUTH_ISSUER?: string
  BETTER_AUTH_URL?: string
  BETTER_AUTH_TRUSTED_ORIGINS: string[]
}

export type McpPrincipal = {
  organizationId: string
  scopes: string[]
  userId?: string
  clientId?: string
  apiKeyId?: string
  tokenId?: string
  kind: "oauth" | "api_key"
}

export class McpHttpError extends Error {
  readonly status: 401 | 403 | 404
  readonly wwwAuthenticate?: string
  constructor(status: 401 | 403 | 404, message: string, wwwAuthenticate?: string) {
    super(message)
    this.name = "McpHttpError"
    this.status = status
    this.wwwAuthenticate = wwwAuthenticate
  }
}
