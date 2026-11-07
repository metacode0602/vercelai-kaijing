# 平台 OAuth 管理员配置手册（Daraz / Lazada / TikTok Shop）

> 适用：在 `/console/settings/shops/new` 新增/授权店铺时出现
> `Missing app credentials for platform daraz`（tRPC 412 `PRECONDITION_FAILED`）。
> 本文面向部署与运维管理员，说明采购方平台应用凭据如何配置到 `apps/shop` 运行时。

## 1. 报错原因

`shops.beginAuthorization` 在发起 OAuth 前会检查 `apps/shop` 进程内的平台应用凭据：

```text
apps/shop/src/lib/marketplace/env.ts:51  assertMarketplaceAppConfigured()
apps/shop/src/lib/server/routers/shops.ts:106
```

缺少 `DARAZ_APP_KEY` 或 `DARAZ_APP_SECRET` 时直接抛出该错误，**不会跳转 Daraz 授权页**。

常见误区：

- 只把变量写进了仓库根目录 `.env`。Next.js 只读取应用目录 `apps/shop/.env*` 或进程环境，**不会自动读取 monorepo 根 `.env`**。
- 修改 `.env` 后没有重启 `apps/shop` 进程。
- 只配置了 App Key，漏了 App Secret。

## 2. 需要配置的变量

### 2.1 Daraz（当前 MVP 主站）

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DARAZ_APP_KEY` | 是 | Daraz 开放平台应用的 App Key |
| `DARAZ_APP_SECRET` | 是 | 对应 App Secret，只放服务端环境变量 |
| `DARAZ_CALLBACK_URL` | 建议显式设置 | 必须与 Daraz 开放平台登记的 Redirect/Callback URL **完全一致**；默认 `{BETTER_AUTH_URL\|NEXT_PUBLIC_URL}/api/marketplace/oauth/callback` |
| `DARAZ_DEFAULT_REGION` | 否 | 默认站点，MVP 用 `lk`；仅在店铺未记录站点时兜底 |
| `MARKETPLACE_CREDENTIALS_KEY` | 回调阶段必填 | AES-256-GCM 加密 OAuth token，写入 `integration_credentials.payload_encrypted` |
| `BETTER_AUTH_URL` | 建议显式设置 | 对外访问源，决定默认回调地址与登录跳转；生产必须是公网 HTTPS |
| `NEXT_PUBLIC_URL` | 可选 | `BETTER_AUTH_URL` 未设置时作为兜底源 |
| `REDIS_*` / `UPSTASH_REDIS_*` | 多实例必填 | OAuth state nonce 共享；单实例可退化为内存 |

其他平台变量命名同理：

| 平台 | Key / Secret | Callback | 默认站点 |
| --- | --- | --- | --- |
| Daraz | `DARAZ_APP_KEY` / `DARAZ_APP_SECRET` | `DARAZ_CALLBACK_URL` | `DARAZ_DEFAULT_REGION=lk` |
| Lazada | `LAZADA_APP_KEY` / `LAZADA_APP_SECRET` | `LAZADA_CALLBACK_URL` | `LAZADA_DEFAULT_REGION=sg` |
| TikTok Shop | `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET` | `TIKTOK_CALLBACK_URL` | `TIKTOK_DEFAULT_REGION=global` |

> `MARKETPLACE_CREDENTIALS_KEY`、`BETTER_AUTH_SECRET` 等加密相关密钥必须让
> `apps/shop` 与 `apps/api` 使用同一份值；否则 token 无法互相解密/刷新。

## 3. 操作步骤

### 3.1 在平台开放平台准备应用

以 Daraz 为例：

1. 登录 `open.daraz.com`（或对应站点开放平台），创建/查看应用。
2. 记录 **App Key** 与 **App Secret**。
3. 将回调地址登记为：

   ```text
   https://<对外域名>/api/marketplace/oauth/callback
   ```

4. 确认该应用已开通目标站点（`lk` / `pk` / `bd` / `np` / `mm`）的卖家授权权限。
5. 平台若要求 HTTPS，请使用公网域名或内网穿透地址，不要直接填 `localhost`。

### 3.2 本地开发配置

配置文件放在 **`apps/shop/.env`**（该文件已被 `.gitignore` 忽略）：

```bash
# apps/shop/.env
BETTER_AUTH_URL=http://localhost:30036
NEXT_PUBLIC_URL=http://localhost:30036

DARAZ_APP_KEY=your_daraz_app_key
DARAZ_APP_SECRET=your_daraz_app_secret
DARAZ_CALLBACK_URL=http://localhost:30036/api/marketplace/oauth/callback
DARAZ_DEFAULT_REGION=lk

# 生成方式：openssl rand -hex 32
MARKETPLACE_CREDENTIALS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

说明：

- 若使用 `pnpm --filter shop dev`，工作目录就是 `apps/shop`，会加载该 `.env`。
- 若从仓库根目录执行 `pnpm dev`，Turbo 启动的 `shop` 任务工作目录仍是 `apps/shop`，同样不会读取根 `.env`。
- 如果坚持把变量放在根 `.env`，需要在启动 shell 中显式 `export`，或使用 `dotenv-cli` 之类的工具加载后再启动；否则 `apps/shop` 读不到。

修改后重启开发进程：

```bash
pnpm --filter shop dev
```

### 3.3 生产 / 容器 / 云平台配置

将同一组变量注入 `apps/shop` 运行环境，而不是仅写入构建环境：

| 场景 | 配置位置 |
| --- | --- |
| Docker Compose | 服务 `environment` 或 `env_file` |
| Kubernetes | Deployment 的 `env` / `envFrom`（Secret） |
| Vercel 等托管平台 | Project Settings → Environment Variables，至少覆盖 Production |
| 传统服务器 | systemd `EnvironmentFile` / PM2 `env` / shell `export` |

生产环境建议：

```bash
NODE_ENV=production
BETTER_AUTH_URL=https://shop.example.com
NEXT_PUBLIC_URL=https://shop.example.com
DARAZ_APP_KEY=...
DARAZ_APP_SECRET=...
DARAZ_CALLBACK_URL=https://shop.example.com/api/marketplace/oauth/callback
DARAZ_DEFAULT_REGION=lk
MARKETPLACE_CREDENTIALS_KEY=<openssl rand -hex 32>
```

注意：

- `BETTER_AUTH_URL`、`DARAZ_CALLBACK_URL` 与浏览器实际访问域名必须一致，否则登录态或 OAuth state cookie 校验会失败。
- 生产环境 `MARKETPLACE_CREDENTIALS_KEY` 不要使用默认值或示例值；生成后妥善保存，轮换会导致旧 token 无法解密。
- 若 `apps/api` 与本应用共用数据库做同步/刷新，需同步配置同一个 `MARKETPLACE_CREDENTIALS_KEY`。
- `DARAZ_*` / `MARKETPLACE_CREDENTIALS_KEY` 是服务端运行时变量，改完重启即可；`NEXT_PUBLIC_*` 可能在构建时内联，修改后需要重新构建镜像/应用。

### 3.4 本地联调公网回调

Daraz 通常要求 HTTPS 公网回调地址。使用内网穿透时：

1. 将 `DARAZ_CALLBACK_URL`、`BETTER_AUTH_URL`、`NEXT_PUBLIC_URL` 都设为穿透域名，例如 `https://shop-dev.example.com`。
2. 在 Daraz 开放平台登记同一个回调地址。
3. **使用穿透域名打开控制台**，不要混用 `localhost` 访问控制台、穿透域名接收回调，否则 state cookie 不在同一域名下，回调会报 `invalid oauth callback`。

## 4. 配置完成后的验证

1. 重启 `apps/shop` 进程，确认启动环境已加载新变量：

   ```bash
   cd apps/shop
   node --env-file=.env -e "console.log(Boolean(process.env.DARAZ_APP_KEY), Boolean(process.env.DARAZ_APP_SECRET))"
   ```

   预期输出 `true true`。若为 `false false`，说明变量仍未进入该进程环境。

2. 打开 `/console/settings/shops/new`，填写店铺信息并提交。
3. 预期行为：不再出现 `Missing app credentials for platform daraz`，浏览器跳转到
   `https://api.daraz.<站点>/oauth/authorize?...`。
4. 登录并确认授权后，平台回调 `/api/marketplace/oauth/callback`。
5. 授权成功后：

   - 页面回到店铺详情并带 `?oauth=success`；
   - `shops.status` 变为 `active`；
   - `integration_credentials` 新增/更新 `kind='oauth'` 记录，`payload_encrypted` 非空。

   可用 SQL 抽查：

   ```sql
   SELECT id, platform, status, external_shop_id, region, auth_expires_at
   FROM shops
   WHERE id = '<店铺ID>';

   SELECT shop_id, kind, expires_at, left(payload_encrypted, 12) AS cipher_prefix
   FROM integration_credentials
   WHERE shop_id = '<店铺ID>';
   ```

## 5. 常见错误对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Missing app credentials for platform daraz`（tRPC 412） | `apps/shop` 进程没有 `DARAZ_APP_KEY` / `DARAZ_APP_SECRET` | 按 §3.2/§3.3 配到应用运行时并重启 |
| 回调页 `{"error":"invalid oauth callback"}` | state 与 cookie 不一致：域名/端口变化、超过 15 分钟、浏览器拦截 Cookie、回调未带 code/state | 用同一域名完成发起与回调；检查 Cookie；重新发起授权 |
| 回调页 `{"error":"oauth state expired"}` | nonce 已消费或过期；多实例未共享 Redis | 重新授权；多实例配置共享 Redis |
| 回调后页面 `?oauth=error&reason=token_exchange_failed` | App Secret 错误、回调地址与平台登记不一致、code 过期或重复使用 | 核对 Secret / 回调地址；重新发起授权 |
| 日志出现 `Missing MARKETPLACE_CREDENTIALS_KEY` | 授权成功但落库时缺少加密密钥 | 配置 `MARKETPLACE_CREDENTIALS_KEY`（或 `BETTER_AUTH_SECRET`） |
| 平台提示 `redirect_uri` 不匹配 | `*_CALLBACK_URL` 与开放平台登记值不一致（含协议、域名、端口、末尾斜杠） | 两处改成完全相同的值 |
| 跳转到错误的 Daraz 站点 | 店铺 `region` 优先于 `DARAZ_DEFAULT_REGION` | 新建店铺时选择正确站点；或修正店铺 region |
| 授权成功后同步仍失败 | `apps/api` 缺少同一套 App Key/Secret 或加密密钥 | 给 `apps/api` 配置同名变量 |

## 6. 安全与运维要求

- 不要把真实 `*_APP_SECRET`、`MARKETPLACE_CREDENTIALS_KEY`、token 提交到 Git；只提交 `.env.example` 占位。
- 生产密钥使用 Secret 管理（KMS / Vault / 云平台环境变量），按最小权限分发给 `apps/shop`、`apps/api`。
- `MARKETPLACE_CREDENTIALS_KEY` 变更前先评估已存 token：旧密文将无法解密，需要重新授权或先做迁移。
- App Secret 泄露时立即在开放平台重置，并同步更新所有运行实例。
- 授权失败排查优先查看 `integration_logs` 与 `integration_states`，不要把平台原始错误或 token 返回给前端。

## 7. 相关代码与文档

| 内容 | 位置 |
| --- | --- |
| 应用凭据读取与校验 | `apps/shop/src/lib/marketplace/env.ts` |
| 发起授权 tRPC | `apps/shop/src/lib/server/routers/shops.ts` |
| Authorize / Callback 路由 | `apps/shop/src/app/api/marketplace/oauth/{authorize,callback}/route.ts` |
| Token 加密 | `packages/marketplace/src/crypto/credentials.ts` |
| 变量模板 | `.env.example`、`packages/marketplace/ENV_CHECKLIST.md` |
| 连接器设计 | `docs/design/marketplace-connectors.md` |
