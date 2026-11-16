# OpenShop ↔ Den 联邦 MCP 认证部署与配置

本文是 OpenShop 作为 MCP Resource Server、Den 作为联邦身份提供方的可执行部署手册。实现范围：

- OpenShop 暴露 `POST /mcp`，校验 Den 签发的 access token audience。
- OpenShop 新增 RFC 8693 token exchange grant。
- OpenShop 新增 `POST /api/v1/openmcp/provision`，由 OpenShop 组织管理员创建每组织 OAuth client 和绑定。
- Den 新增 federation provider/binding、subject/actor token、token exchange client、token cache、feature flag 和 org connection 配置。

> 当前实现尚未把 client ID 固定改写为 `openmcp-<externalOrgId>`，provisioning 返回 Better Auth 生成的 `client_id`。Den 绑定必须使用返回值，不要假设固定格式。

## 1. 域名与参数

| 参数 | 值 | 说明 |
| --- | --- | --- |
| OpenShop Web / OAuth AS | `https://shop.rungpu.cn` | 浏览器登录、provisioning、token endpoint |
| OpenShop issuer | `https://shop.rungpu.cn/api/auth` | Den provider 的 `issuer` |
| OpenShop token endpoint | `https://shop.rungpu.cn/api/auth/oauth2/token` | Den provider 的 `tokenEndpoint` |
| OpenShop JWKS | `https://shop.rungpu.cn/api/auth/jwks` | Den provider 的 `jwksUri` |
| OpenShop MCP resource | `https://api.rungpu.cn/mcp` | 必须与 `OPENSHOP_MCP_RESOURCE`、Den `resourceUrl` 完全一致 |
| OpenShop provisioning | `https://shop.rungpu.cn/api/v1/openmcp/provision` | 必须由 OpenShop 组织管理员 session 调用 |
| Den issuer | `https://api.openworklabs.com/api/auth`（示例） | OpenShop provisioning 的 `denIssuer`，以 Den JWT `iss` 为准 |
| Den JWKS | `https://api.openworklabs.com/api/auth/jwks`（示例） | OpenShop provisioning 的 `denJwksUri` |
| Den API | `https://api.openworklabs.com`（示例） | `/v1/admin/federation/...`、`/v1/mcp-connections` |
| Claim 映射 | `orgIdClaim`、`tokenUseClaim` 等 | Den provider 与 OpenShop provisioning 必须传同一组值 |

方向不要写反：

- Den 的 `federation_provider.issuer/jwksUri/tokenEndpoint` 描述 **OpenShop**。
- OpenShop provisioning 的 `denIssuer/denJwksUri` 描述 **Den**。

## 2. OpenShop 部署

### 2.1 发布代码

本次改动已提交到 OpenShop `develop`。部署两个项目：

- `apps/shop`：`shop.rungpu.cn`
- `apps/api`：`api.rungpu.cn`

部署顺序：先迁移数据库，再发布 `apps/shop`，再发布 `apps/api`。`apps/shop` 必须先具备 token exchange 和 provisioning，否则 Den 无法完成交换。

### 2.2 数据库迁移

在 OpenShop 仓库执行：

```bash
pnpm install
pnpm --filter @workspace/db db:migrate
```

本次迁移文件：

- `packages/db/drizzle/0016_federation_tables.sql`
- `packages/db/drizzle/meta/_journal.json` 已包含 idx `16`

迁移后确认表存在：

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'federation_provider',
    'federation_org_binding',
    'federation_identity',
    'federation_consent',
    'oauth_token_exchange',
    'federation_audit'
  )
order by table_name;
```

### 2.3 OpenShop 环境变量

`apps/shop`：

```dotenv
DATABASE_URL=postgres://...
BETTER_AUTH_URL=https://shop.rungpu.cn
BETTER_AUTH_SECRET=<至少 32 字符，部署期间保持稳定>
BETTER_AUTH_TRUSTED_ORIGINS=https://shop.rungpu.cn
OPENSHOP_MCP_ENABLED=true
OPENSHOP_MCP_RESOURCE=https://api.rungpu.cn/mcp
NEXT_PUBLIC_API_URL=https://api.rungpu.cn
```

`apps/api`：

```dotenv
DATABASE_URL=postgres://...
OPENSHOP_MCP_ENABLED=true
OPENSHOP_MCP_RESOURCE=https://api.rungpu.cn/mcp
OPENSHOP_OAUTH_ISSUER=https://shop.rungpu.cn/api/auth
```

注意：

- `OPENSHOP_MCP_RESOURCE` 必须精确等于 `https://api.rungpu.cn/mcp`，不要带尾部 `/`。
- `BETTER_AUTH_URL` 是站点根地址，不要写成 `https://shop.rungpu.cn/api/auth`。
- `OPENSHOP_MCP_ENABLED=false` 时 `/mcp` 返回 404，不是 401。
- `BETTER_AUTH_SECRET` 变更会使现有 session 失效。
- `NEXT_PUBLIC_API_URL` 是 Next.js 构建期变量，必须在 Vercel 构建前配置。

### 2.4 部署后验证 OpenShop

```bash
curl -fsS https://shop.rungpu.cn/.well-known/oauth-authorization-server \
  | jq '{issuer,token_endpoint,jwks_uri,grant_types_supported,scopes_supported}'
```

期望：

- `issuer` 为 `https://shop.rungpu.cn/api/auth`
- `grant_types_supported` 包含
  `urn:ietf:params:oauth:grant-type:token-exchange`
- `scopes_supported` 包含 `openshop:read`、`openshop:write.pending`
- 不包含 `openshop:write.confirm`

若仍只有 `authorization_code`、`client_credentials`、`refresh_token`，说明 `apps/shop` 还是旧部署。

再验证 provisioning 路由已存在：

```bash
curl -i -X POST https://shop.rungpu.cn/api/v1/openmcp/provision \
  -H 'content-type: application/json' \
  -d '{}'
```

期望返回 `401 unauthorized`，而不是 `404`。未登录时不应泄露 provisioning 细节。

## 3. Den 部署

### 3.1 发布代码

Den 仓库发布包含：

- `ee/packages/den-db` 的 `0196_shiny_expediter.sql`
- `ee/packages/den-db` 的 `0197_overjoyed_tinkerer.sql`
- `ee/apps/den-api` 的 federation provider/binding routes、subject token、token cache、connection 集成
- `packages/features` 的 `federatedMcpAuth` flag

### 3.2 数据库迁移

```bash
pnpm install
pnpm --filter @openwork-ee/den-db db:migrate
```

迁移后确认：

```sql
show tables like 'federation_%';
describe external_mcp_connection;
```

`external_mcp_connection` 应包含 `oauth_mode` 和 `federation_config_json`。

### 3.3 Den 环境变量

```dotenv
DATABASE_URL=mysql://...
BETTER_AUTH_URL=https://api.openworklabs.com
DEN_DB_ENCRYPTION_KEY=<至少 32 字符，必须稳定>
DEN_MCP_RESOURCE_URL=https://api.openworklabs.com/mcp
```

说明：

- `DEN_DB_ENCRYPTION_KEY` 用于加密 OpenShop client secret；变更后已存 secret 无法解密。
- 不要设置 `DEN_FEATURE_FEDERATED_MCP_AUTH=false`，否则 operator lock 会覆盖组织级开启。要按组织开启时保持未设置。
- `DEN_MCP_CLAIM_NAMESPACE` 可保留默认；本文推荐在 provider 中显式配置 claims，避免依赖 Den origin。

### 3.4 配置 federation provider

使用平台管理员 session cookie 或管理员 API key。示例使用 cookie：

```bash
export DEN_BASE='https://api.openworklabs.com'
export DEN_ADMIN_COOKIE='<浏览器请求头里的完整 Cookie 值>'

cat > /tmp/openshop-provider.json <<'JSON'
{
  "key": "openshop",
  "displayName": "Open Shop",
  "protocol": "rfc8693",
  "issuer": "https://shop.rungpu.cn/api/auth",
  "jwksUri": "https://shop.rungpu.cn/api/auth/jwks",
  "tokenEndpoint": "https://shop.rungpu.cn/api/auth/oauth2/token",
  "resourceUrl": "https://api.rungpu.cn/mcp",
  "clientMode": "per_organization",
  "clientAuthMethod": "client_secret_basic",
  "claims": {
    "orgIdClaim": "https://api.openworklabs.com/api/auth/org_id",
    "tokenUseClaim": "https://api.openworklabs.com/api/auth/token_use",
    "emailClaim": "email",
    "emailVerifiedClaim": "email_verified",
    "rolesClaim": "roles",
    "actorSubject": "service:openmcp-federation"
  },
  "scopes": [
    "openid",
    "profile",
    "email",
    "offline_access",
    "openshop:read",
    "openshop:write.pending"
  ],
  "subjectTtlSeconds": 300,
  "status": "active"
}
JSON

curl -fsS -X PUT "$DEN_BASE/v1/admin/federation/providers/openshop" \
  -H "content-type: application/json" \
  -H "cookie: $DEN_ADMIN_COOKIE" \
  --data-binary @/tmp/openshop-provider.json | jq
```

`claims` 中的 `https://api.openworklabs.com/api/auth` 只是示例命名空间；生产应替换为实际 Den issuer，并保持稳定。最关键的是 Den provider 的 `claims` 与 OpenShop provisioning 请求里的 `claims` 完全一致。

验证：

```bash
curl -fsS "$DEN_BASE/v1/admin/federation/providers" \
  -H "cookie: $DEN_ADMIN_COOKIE" | jq
```

### 3.5 开启组织 feature

`federatedMcpAuth` 默认关闭。只对试点组织开启：

```bash
export DEN_ORG_ID='org_...'

curl -fsS -X PUT "$DEN_BASE/v1/admin/organizations/$DEN_ORG_ID/capabilities" \
  -H "content-type: application/json" \
  -H "cookie: $DEN_ADMIN_COOKIE" \
  -d '{"capabilities":{"federatedMcpAuth":true}}' | jq
```

确认 `featureStates.federatedMcpAuth.enabled` 为 `true`。

## 4. 组织开通流程

### 4.1 OpenShop 管理员创建绑定

在浏览器打开 `https://shop.rungpu.cn`，登录并切换到目标组织。调用者必须是组织 owner 或有 `settings.configure` 权限。

在 `https://shop.rungpu.cn` 的 DevTools Console 执行：

```js
const DEN_ISSUER = 'https://api.openworklabs.com/api/auth'
const CLAIMS = {
  orgIdClaim: `${DEN_ISSUER}/org_id`,
  tokenUseClaim: `${DEN_ISSUER}/token_use`,
  emailClaim: 'email',
  emailVerifiedClaim: 'email_verified',
  rolesClaim: 'roles',
  actorSubject: 'service:openmcp-federation',
}

const response = await fetch('/api/v1/openmcp/provision', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    externalOrgId: 'org_01...',
    displayName: 'Acme Robotics',
    denIssuer: DEN_ISSUER,
    denJwksUri: `${DEN_ISSUER}/jwks`,
    requestedScopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'openshop:read',
      'openshop:write.pending',
    ],
    claims: CLAIMS,
    roleMapping: {
      owner: 'owner',
      admin: 'admin',
      member: 'member',
    },
    jitProvisioning: true,
  }),
})

const body = await response.json()
console.log(response.status, body)
```

`externalOrgId` 使用 Den organization id。`claims` 必须与 Den provider 的 `claims` 一致。`clientSecret` 只在首次创建时返回一次，立即保存到安全位置，再写入 Den binding。

`jitProvisioning=true` 只会把 Den 已认证邮箱匹配到 OpenShop 组织内**已存在**的成员，不会自动创建成员。若成员不存在，token exchange 返回 `user_link_required`。

响应示例：

```json
{
  "organizationId": "org_...",
  "externalOrgId": "org_...",
  "mcpUrl": "https://api.rungpu.cn/mcp",
  "status": "active",
  "scopes": ["openid", "profile", "email", "offline_access", "openshop:read", "openshop:write.pending"],
  "oauthClient": {
    "clientId": "<Better Auth client_id>",
    "clientSecret": "<只返回一次>",
    "tokenEndpointAuthMethod": "client_secret_basic",
    "grantTypes": ["urn:ietf:params:oauth:grant-type:token-exchange"]
  },
  "createdAt": "2026-..."
}
```

若返回 `200` 且 `clientSecret` 为 `null`，表示已有绑定被更新，secret 不会再次返回。

### 4.2 Den 管理员写入组织绑定

```bash
cat > /tmp/openshop-binding.json <<'JSON'
{
  "externalOrgId": "org_01...",
  "clientId": "<OpenShop provisioning 返回的 clientId>",
  "clientSecret": "<OpenShop provisioning 返回的 clientSecret>",
  "status": "active"
}
JSON

curl -fsS -X PUT \
  "$DEN_BASE/v1/admin/federation/providers/openshop/bindings/$DEN_ORG_ID" \
  -H "content-type: application/json" \
  -H "cookie: $DEN_ADMIN_COOKIE" \
  --data-binary @/tmp/openshop-binding.json | jq
```

验证：

```bash
curl -fsS \
  "$DEN_BASE/v1/admin/federation/providers/openshop/bindings" \
  -H "cookie: $DEN_ADMIN_COOKIE" | jq
```

响应只返回 `hasClientSecret`，不会返回 secret。

### 4.3 创建 federated MCP 连接

连接必须是 `authType=oauth`、`credentialMode=per_member`、`oauthMode=federated`，且不能同时设置 `oauthClient` 或 `manualOAuthEndpoints`。

使用组织管理员 API key：

```bash
export DEN_ORG_API_KEY='...'

curl -fsS -X POST "$DEN_BASE/v1/mcp-connections" \
  -H "authorization: Bearer $DEN_ORG_API_KEY" \
  -H "x-openwork-org-id: $DEN_ORG_ID" \
  -H "content-type: application/json" \
  -d '{
    "kind": "external_mcp",
    "name": "Open Shop",
    "url": "https://api.rungpu.cn/mcp",
    "authType": "oauth",
    "credentialMode": "per_member",
    "oauthMode": "federated",
    "federation": {
      "providerKey": "openshop",
      "externalOrgId": "'"$DEN_ORG_ID"'",
      "scopes": ["openshop:read"]
    },
    "access": {
      "orgWide": true,
      "memberIds": [],
      "teamIds": []
    }
  }' | jq
```

只读场景使用 `openshop:read`；需要写操作时再加 `openshop:write.pending`。永远不要请求 `openshop:write.confirm`。

## 5. 端到端验证

### 5.1 无 token 访问 MCP

```bash
curl -i -X POST https://api.rungpu.cn/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

期望 `401`，且 `WWW-Authenticate` 包含：

- `resource_metadata="https://api.rungpu.cn/.well-known/oauth-protected-resource"`
- `scope="..."`

### 5.2 Den 签发 subject/actor token

`/v1/federation/subject-token` 需要真实用户 session，不接受组织 API key。可在 Den Web 的 DevTools Console 执行（URL 换成实际 Den API origin）：

```js
const result = await fetch('https://api.openworklabs.com/v1/federation/subject-token', {
  credentials: 'include',
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    providerKey: 'openshop',
    scopes: ['openshop:read'],
  }),
}).then(async (response) => ({ status: response.status, body: await response.json() }))

console.log(result)
```

期望 `200`，返回 `subjectToken`、`actorToken`、`audience=https://api.rungpu.cn/mcp`、`expiresIn<=300`。

### 5.3 手工 token exchange

```bash
export OPENSHOP_CLIENT_ID='...'
export OPENSHOP_CLIENT_SECRET='...'
export SUBJECT_TOKEN='...'
export ACTOR_TOKEN='...'

curl -fsS -u "$OPENSHOP_CLIENT_ID:$OPENSHOP_CLIENT_SECRET" \
  -X POST https://shop.rungpu.cn/api/auth/oauth2/token \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  --data-urlencode 'subject_token='"$SUBJECT_TOKEN" \
  --data-urlencode 'subject_token_type=urn:ietf:params:oauth:token-type:jwt' \
  --data-urlencode 'actor_token='"$ACTOR_TOKEN" \
  --data-urlencode 'actor_token_type=urn:ietf:params:oauth:token-type:jwt' \
  --data-urlencode 'requested_token_type=urn:ietf:params:oauth:token-type:access_token' \
  --data-urlencode 'audience=https://api.rungpu.cn/mcp' \
  --data-urlencode 'scope=openshop:read' | jq
```

期望 `200` 且包含 `access_token`。若返回 `unsupported_grant_type`，说明 OpenShop 部署尚未包含 extension grant，或 metadata 未刷新。

### 5.4 用 access token 调用 MCP

```bash
export ACCESS_TOKEN='...'

curl -i -X POST https://api.rungpu.cn/mcp \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

期望 `200`。随后用响应中的 `mcp-session-id` 调用 `tools/list`：

```bash
curl -sS -X POST https://api.rungpu.cn/mcp \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "mcp-session-id: $MCP_SESSION_ID" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## 6. 关闭与回滚

按影响范围从大到小：

1. 关闭 OpenShop MCP：`OPENSHOP_MCP_ENABLED=false`，`/mcp` 返回 404。
2. 关闭某组织：`PUT /v1/admin/organizations/:id/capabilities`，`federatedMcpAuth=false`。
3. 禁用组织绑定：`PUT /v1/admin/federation/providers/openshop/bindings/:organizationId`，`status=disabled`。
4. 禁用 provider：`PUT /v1/admin/federation/providers/openshop`，`status=disabled`。
5. OpenShop 侧禁用 client：将 `oauth_client.disabled` 设为 `true`，或撤销 `federation_consent`。

feature 关闭后不再签发新 subject token，也不再从缓存提供 federated token；已有浏览器 OAuth 连接不受影响。

## 7. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `unsupported_grant_type` | OpenShop 部署旧，metadata 无 token-exchange | 发布本次 OpenShop 改动，检查 metadata |
| `404` on `/api/v1/openmcp/provision` | OpenShop 部署旧 | 发布 `apps/shop` |
| `401` on `/mcp` 且无 `scope` | OpenShop 部署早于 `020d7261` | 发布包含 MCP auth 改动的版本 |
| `feature_disabled` | 组织未开 `federatedMcpAuth` | 设置 org capability override |
| `tenant_not_provisioned` | Den provider/binding 缺失或 disabled | 检查 provider 和 binding 状态 |
| `tenant_mismatch` | clientId、externalOrgId、issuer 不一致 | 核对 OpenShop binding 与 Den binding |
| `consent_required` | OpenShop 没有有效 `federation_consent` | 重新执行 provisioning |
| `user_link_required` | JIT 关闭且没有 identity link | 开启 `jitProvisioning` 或先建立用户映射 |
| `invalid_scope` | 请求 scope 不在 provider/consent 中 | 只请求已配置 scope |
| `invalid_token` at MCP | audience/issuer/JWKS 不匹配 | 核对 `OPENSHOP_MCP_RESOURCE`、`OPENSHOP_OAUTH_ISSUER`、Den issuer |
| `client_secret` 丢失 | secret 只返回一次 | 当前无轮换 API，需人工重建绑定或后续补轮换流程 |

## 8. 安全要求

- 生产环境 provisioning 和 token endpoint 必须 HTTPS；代码已拒绝生产 HTTP federation URL。
- provisioning 只接受同源请求，并要求 OpenShop session、active org、`owner` 或 `settings.configure`。
- OpenShop client secret 只在首次 provisioning 返回；Den 使用 `DEN_DB_ENCRYPTION_KEY` 加密存储，API 永不返回。
- 不记录 subject token、actor token、access token、client secret。
- 永不签发 `openshop:write.confirm`。
- subject/actor token TTL 默认 300 秒，最大 600 秒；access token 默认 900 秒。
- `federatedMcpAuth` 默认关闭，先按组织灰度。

## 9. 相关代码

OpenShop：

- `apps/shop/src/lib/auth/federation-token-exchange.ts`
- `apps/shop/src/lib/auth/federation-constants.ts`
- `apps/shop/src/lib/server/dataaccess/federation-provisioning.ts`
- `apps/shop/src/app/api/v1/openmcp/provision/route.ts`
- `apps/api/src/mcp/auth.ts`
- `packages/auth/src/oauth-provider.ts`
- `packages/db/src/federation-schema.ts`

Den：

- `ee/apps/den-api/src/federation/provider-registry.ts`
- `ee/apps/den-api/src/federation/subject-token.ts`
- `ee/apps/den-api/src/federation/token-exchange-client.ts`
- `ee/apps/den-api/src/federation/token-cache.ts`
- `ee/apps/den-api/src/routes/admin/federation.ts`
- `ee/apps/den-api/src/routes/federation/subject-tokens.ts`
- `ee/apps/den-api/src/routes/org/mcp-connections.ts`
- `packages/features/src/registry.ts`
- `docs/features/federated-mcp-auth/README.md`
