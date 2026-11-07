# Marketplace 多租户应用凭据设计

**状态：** 已确认，待实现  
**范围：** `apps/shop`、`apps/api`、`packages/marketplace`、`packages/db`  
**关联文档：** [marketplace-connectors.md](marketplace-connectors.md)、[tenant-onboarding-and-store-binding.md](../../apps/shop/content/design/tenant-onboarding-and-store-binding.md)

## 1. 背景与目标

当前 Marketplace OAuth 与同步使用全局环境变量（`DARAZ_APP_KEY`、`LAZADA_APP_KEY`、`TIKTOK_APP_KEY` 等）。这带来三个问题：

1. 每个部署只能使用一套平台应用，无法让不同租户使用自己的开放平台应用。
2. 部分平台要求回调域名与租户应用绑定，共享全局应用难以满足。
3. 缺少凭据配置时，`shops.beginAuthorization` 直接报 `Missing app credentials for platform daraz`，租户无法自助恢复。

目标：

- 每个组织（租户）在控制台自行配置平台应用 `App Key` / `App Secret`。
- 凭据按 `organization + platform + region` 管理，`region=''` 表示该平台通用配置。
- 统一回调地址为 `/api/marketplace/{platform}/oauth/callback`，可选 `/api/marketplace/{platform}/oauth/callback/{callbackKey}`。
- App Secret 加密存储，接口永不返回明文。
- 仅 `tenant_owner` 可写，`tenant_engineer` 只读。
- `apps/shop` OAuth、`apps/api` 同步/token 刷新/webhook 全部按租户凭据工作。
- 删除旧的全局应用凭据环境变量，不保留兼容回退。

非目标：

- 不实现平台运营后台代租户录入凭据。
- 不实现 App Key 自动向平台校验（平台没有通用校验接口，首次真实 OAuth 即验证）。
- 不实现凭据版本历史；更新即覆盖，审计记录保留变更前后摘要。

## 2. 总体架构

```mermaid
flowchart LR
  Owner[tenant_owner] -->|配置 App Key/Secret| ShopUI[控制台 /console/settings/marketplace-apps]
  ShopUI -->|tRPC| ShopRouter[marketplaceApps router]
  ShopRouter --> DA[dataaccess + audit]
  DA --> DB[(marketplace_app_credentials)]

  User[租户用户] -->|新增/重连店铺| Authorize[/api/marketplace/:platform/oauth/authorize]
  Authorize --> Resolver[resolveMarketplaceAppCredential]
  Resolver --> DB
  Authorize -->|state 含 appCredentialId| Platform[平台授权页]
  Platform --> Callback[/api/marketplace/:platform/oauth/callback]
  Callback -->|验签 state + 加载凭据| DB
  Callback --> Token[exchange code + 加密 token]
  Token --> DB

  API[apps/api 同步/刷新/webhook] --> Resolver
  Resolver --> DB
```

凭据解析顺序（同一组织、同一平台）：

1. 精确匹配 `region = 归一化后的站点`。
2. 回退匹配 `region = ''` 的通用配置。
3. 都没有则返回未配置错误，不读取任何环境变量兜底。

## 3. 数据模型

新增表 `marketplace_app_credentials`（`packages/db/src/commerce-schema.ts`）：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `text` PK | `createId()` |
| `organization_id` | `text` NOT NULL | 关联 `organization.id` |
| `platform` | `varchar(32)` NOT NULL | `daraz` / `lazada` / `tiktok_shop` |
| `region` | `varchar(16)` NOT NULL DEFAULT `''` | 大写站点码；空串表示通用 |
| `app_key` | `varchar(128)` NOT NULL | 平台应用 App Key |
| `app_secret_encrypted` | `text` NOT NULL | AES-256-GCM 密文 |
| `callback_key` | `varchar(64)` NULL | 可选独立回调路径标识 |
| `status` | `varchar(16)` NOT NULL DEFAULT `active` | `active` / `disabled` |
| `last_verified_at` | `timestamptz` NULL | 首次/最近一次 OAuth 成功时间 |
| `last_error` | `text` NULL | 最近一次 OAuth/token 失败摘要 |
| `created_by` | `text` NULL | 操作人 user id |
| `updated_by` | `text` NULL | 最后操作人 user id |
| `created_at` / `updated_at` | `timestamptz` | 标准时间戳 |

索引与约束：

- 唯一索引 `(organization_id, platform, region)`：一个组织同一平台同一站点只有一份配置。
- `callback_key` 非空时唯一，用于独立回调路径反查。
- 普通索引 `(organization_id, platform)`、`(platform, app_key)`。
- `region` 写入前 `trim().toUpperCase()`，空串保留。
- `app_key` 不做全局唯一（同组织不同站点可复用同一应用）；保存时校验“同平台 + 同 App Key”不得出现在其他组织，避免 webhook 无法区分租户。

加密：

- 复用 `packages/marketplace/src/crypto/credentials.ts` 的 AES-256-GCM 格式。
- 新增 `encryptSecret(value)` / `decryptSecret(blob)`，与 token payload 使用同一密钥来源：`MARKETPLACE_CREDENTIALS_KEY`，未配置时回退 `BETTER_AUTH_SECRET`。
- `apps/shop` 与 `apps/api` 必须使用同一密钥值。

## 4. 回调地址

基础地址：

```text
{BETTER_AUTH_URL | NEXT_PUBLIC_URL}
```

默认回调：

```text
https://<对外域名>/api/marketplace/{platform}/oauth/callback
```

独立回调（平台强制每个应用不同路径时）：

```text
https://<对外域名>/api/marketplace/{platform}/oauth/callback/{callbackKey}
```

规则：

- `platform` 使用 `daraz` / `lazada` / `tiktok_shop`，回调入口校验非法平台。
- 默认回调可以被所有租户共用，因为 `state` 已签名并包含 `organizationId`、`shopId`、`appCredentialId`。
- `callbackKey` 只用于平台要求的路径隔离；如果配置了 `callbackKey`，回调路径必须匹配，否则拒绝。
- 平台开放后台登记的 Redirect URL 必须与控制台展示值完全一致（协议、域名、端口、路径、末尾斜杠）。

## 5. OAuth 流程

### 5.1 发起授权

`shops.beginAuthorization`：

1. 校验登录、组织、入驻状态、店铺归属（保持现有逻辑）。
2. 计算 `region = 请求指定 || shop.region || ''`。
3. 调用 `resolveMarketplaceAppCredential(db, { organizationId, platform, region })`。
4. 未配置时抛 `PRECONDITION_FAILED`，消息指向 `/console/settings/marketplace-apps`。
5. 生成 `state`，新增字段 `appCredentialId`。
6. 用凭据的 `appKey` / `appSecret` 构建授权 URL。
7. 记录 `integration_logs`，跳转平台。

`state` 结构：

```ts
interface OAuthStatePayload {
  nonce: string
  mode: 'bind' | 'reauth'
  platform: string
  shopId: string
  organizationId: string
  appCredentialId: string
  locale: string
  region?: string
  exp: number
}
```

`state` 仍使用全局 HMAC 签名（`MARKETPLACE_CREDENTIALS_KEY` / `BETTER_AUTH_SECRET`），不依赖具体租户密钥。

### 5.2 平台回调

入口：

- `apps/shop/src/app/api/marketplace/[platform]/oauth/callback/route.ts`
- `apps/shop/src/app/api/marketplace/[platform]/oauth/callback/[callbackKey]/route.ts`

处理顺序：

1. 校验路径 `platform` 合法。
2. `decodeOAuthState(state)` 验签、检查过期。
3. `consumeOAuthNonce(nonce)` 防重放。
4. 校验 `state.platform === path platform`。
5. 按 `appCredentialId + organizationId + platform` 加载且必须 `status='active'`。
6. 若路径带 `callbackKey`，必须等于配置的 `callback_key`。
7. 用配置的 `appKey` / `appSecret` 换 token。
8. 落库 token、更新店铺状态、记录审计与日志。
9. 成功后更新配置 `last_verified_at`、清空 `last_error`；失败写 `last_error`（脱敏）。
10. 302 回店铺详情，保留现有 `oauth=success|error&reason=…` 约定。

失败不自动重试；用户需在配置页修正后重新发起授权。

## 6. 应用内使用

### 6.1 `apps/shop`

- `apps/shop/src/lib/marketplace/env.ts`：
  - 删除全局平台变量读取。
  - 保留回调基础地址与默认回调构造工具。
  - 新增 `resolveMarketplaceCallbackUrl(platform, callbackKey?)`。
- 新增 `apps/shop/src/lib/server/dataaccess/marketplace-app-credentials.ts`：
  - `listMarketplaceAppCredentials`
  - `createMarketplaceAppCredential`
  - `updateMarketplaceAppCredential`
  - `removeMarketplaceAppCredential`
  - `touchMarketplaceAppCredentialVerification`
  - `recordMarketplaceAppCredentialError`
- 新增 router `apps/shop/src/lib/server/routers/marketplace-apps.ts`：
  - `list`：`tenantProcedure`，返回脱敏 DTO + 回调地址。
  - `create` / `update` / `remove`：`tenantOwnerProcedure`。
  - 写操作调用 `appendAuditEvent`，`entityType='marketplace_app_credential'`，不记录 Secret。
- 授权路由与 `shops.beginAuthorization` 改用数据库解析器。

### 6.2 `apps/api`

- 新增 `packages/marketplace/src/db/app-credential-store.ts`：
  - `resolveMarketplaceAppCredential`：按 ID 或按 `organization + platform + region` 解析并解密。
  - `findMarketplaceAppCredentialByAppKey`：webhook 用，返回平台、组织、密钥与配置 ID。
- `apps/api/src/lib/marketplace/app-env.ts`：
  - 删除 `getMarketplaceAppCredentials` 与 `resolveLazopPlatformFromAppKey` 的 env 比较。
  - 保留平台判断与 site → platform 的纯函数。
- `apps/api/src/lib/marketplace/connector.ts`：
  - `MarketplaceShopConnection` 增加 `organizationId`。
  - `createShopConnector` 改为异步，内部解析租户凭据。
  - 未配置时抛明确错误，同步任务记录失败但不阻塞其他店铺。
- `apps/api/src/lib/marketplace/sync.ts`、`sync-listings.ts`、`sync-settlements.ts`：所有 `createShopConnector` 调用改为 `await`。
- `apps/api/src/routes/webhooks.ts`：
  - 先按 `app_key` 查租户配置，验签使用该配置的 `appSecret`。
  - `findShop` 增加 `organizationId` 过滤，避免跨租户 seller id 冲突。
  - 配置找不到时返回 `unknown_app`，不再读环境变量。

## 7. 控制台 UI

### 7.1 路由与导航

- 新页面：`apps/shop/src/app/[locale]/console/settings/marketplace-apps/page.tsx`
- `SETTINGS_NAV` 在“店铺连接”之后增加“平台应用配置”（`settings.marketplaceApps`）。
- 中英文 message 同步增加 key。

### 7.2 页面结构

1. 页头：标题、说明、权限提示（只读角色隐藏写操作）。
2. 引导组件 `MarketplaceAppSetupGuide`：
   - 平台选择（Daraz / Lazada / TikTok Shop）。
   - 开放平台入口与创建应用步骤。
   - 当前平台默认回调地址 + `callbackKey` 示例，一键复制。
   - 提醒：App Secret 只保存在服务端；保存后不可再次查看。
3. 配置列表：
   - 列：平台、站点、App Key、回调地址、状态、最近验证、最近错误、操作。
   - App Secret 只显示“已配置”，不显示任何明文/尾号。
4. 新增/编辑表单：
   - 平台、站点（含“全部站点”）、App Key、App Secret、可选 callbackKey。
   - 编辑时 App Secret 留空表示保持不变。
   - 保存前校验：同组织同平台同站点唯一；同平台 App Key 不得属于其他组织。
5. 删除：二次确认；删除后相关店铺需重新配置才能授权/同步。

### 7.3 未配置提示

- `settings/shops/new`：按当前平台/站点查询配置；缺失时显示 Alert 并链接到“平台应用配置”，保留“仍然提交”由后端返回明确错误（不伪造成功）。
- 店铺列表/详情：授权失败信息包含配置页链接。
- 不使用 mock 授权结果。

## 8. 权限与审计

| 操作 | tenant_owner | tenant_engineer | 其他 |
| --- | --- | --- | --- |
| 查看配置列表（脱敏） | ✅ | ✅ | ❌ |
| 新增/编辑/删除 | ✅ | ❌ | ❌ |
| 发起 OAuth | ✅ | ✅ | ❌ |

审计事件：

- `marketplace_app_credential.create`
- `marketplace_app_credential.update`
- `marketplace_app_credential.remove`
- `marketplace_app_credential.oauth_verified`

`before` / `after` 仅记录 `platform`、`region`、`appKey`、`callbackKey`、`status`，禁止记录 `appSecret` 或密文以外的敏感信息。`detail` 使用脱敏摘要。

## 9. 环境变量清理

删除：

- `DARAZ_APP_KEY` / `DARAZ_APP_SECRET` / `DARAZ_CALLBACK_URL` / `DARAZ_DEFAULT_REGION`
- `LAZADA_APP_KEY` / `LAZADA_APP_SECRET` / `LAZADA_CALLBACK_URL` / `LAZADA_DEFAULT_REGION`
- `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET` / `TIKTOK_CALLBACK_URL` / `TIKTOK_DEFAULT_REGION`

保留：

- `MARKETPLACE_CREDENTIALS_KEY`：加密应用 Secret 与 token。
- `BETTER_AUTH_URL` / `NEXT_PUBLIC_URL`：构造回调地址。
- webhook 验签开关、同步 cron、内部同步 API Key 等非应用凭据变量。

同步更新 `turbo.json`、`.env.example`、`packages/marketplace/ENV_CHECKLIST.md` 与相关文档。

## 10. 迁移与兼容

- 由 `pnpm --filter @workspace/db db:generate` 生成新迁移，不手改 `packages/db/drizzle/`。
- 现有环境若仍配置全局 App Key：不自动导入数据库，不做兼容回退；上线后由租户在控制台录入并重新授权。
- 已存 token 仍可解密（同一 `MARKETPLACE_CREDENTIALS_KEY`）；token 刷新需要对应租户配置存在且 App Key/Secret 正确。
- 删除旧 env 前先在目标环境完成至少一个租户配置与真实 OAuth 验证。

## 11. 错误与可观测性

- 未配置：`PRECONDITION_FAILED`，`平台应用未配置，请先在「设置 → 平台应用配置」完成配置`。
- 凭据被禁用：`PRECONDITION_FAILED`，提示联系租户所有者启用。
- App Secret 解密失败：记录 `marketplace_app_credentials.last_error='credential_decrypt_failed'`，日志不输出密文。
- OAuth 失败：`integration_logs` 记录 action/status/message/detail，detail 不含 code、token、secret。
- 同步失败：`sync_tasks` / `integration_logs` 记录“租户未配置应用凭据”，按店铺隔离，不中断其他租户。

## 12. 验收清单

- [ ] 租户所有者可在新页面创建 `daraz + LK` 配置，App Secret 保存后不可回显。
- [ ] `tenant_engineer` 可查看但无法调用写接口。
- [ ] 同组织同平台同站点重复创建被拒绝；同 App Key 跨组织被拒绝。
- [ ] 精确站点配置优先于通用配置；缺失通用配置时返回未配置。
- [ ] `shops.beginAuthorization` 使用租户配置，未配置时提示配置页。
- [ ] 默认回调与新平台路径可完成真实 Daraz OAuth，state 含 `appCredentialId`。
- [ ] 带 `callbackKey` 的路径校验通过；错误路径被拒绝。
- [ ] `apps/api` 同步/token 刷新使用同一租户配置。
- [ ] webhook 按 `app_key` 找到租户并用对应 Secret 验签，跨租户 seller id 不串店。
- [ ] 旧全局平台凭据 env 已从代码、turbo、示例环境删除。
- [ ] `pnpm lint`、`pnpm typecheck` 与受影响包测试通过；浏览器验证配置 → 授权 → 回调完整流程。
