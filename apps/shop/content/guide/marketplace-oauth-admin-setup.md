# 平台 OAuth 租户配置手册（Daraz / Lazada / TikTok Shop）

> 适用：租户在 `/console/settings/shops/new` 新增或重连店铺时，需要配置自己的开放平台应用。
> 应用凭据由 **租户在控制台自助维护**，不再写入部署环境变量。
>
> 相关设计：[Marketplace 多租户应用凭据](../../../../docs/design/marketplace-multitenant-app-credentials.md)

## 1. 配置位置

1. 使用 `tenant_owner` 登录租户控制台。
2. 打开 **设置 → 平台应用配置**：

   ```text
   /console/settings/marketplace-apps
   ```

3. 选择平台与站点，填写平台开放后台的 **App Key** / **App Secret**。
4. 将页面展示的回调地址登记到平台开放后台，保存配置。
5. 回到 **设置 → 店铺连接** 新增店铺或重新授权。

权限：

- `tenant_owner`：查看、新增、编辑、删除。
- `tenant_engineer`：只能查看和使用配置，不能修改。
- App Secret 保存后不可回显；编辑时留空表示不修改。

## 2. 回调地址

默认回调：

```text
https://<对外域名>/api/marketplace/{platform}/oauth/callback
```

`platform` 取值：

| 平台 | 路径 |
| --- | --- |
| Daraz | `/api/marketplace/daraz/oauth/callback` |
| Lazada | `/api/marketplace/lazada/oauth/callback` |
| TikTok Shop | `/api/marketplace/tiktok_shop/oauth/callback` |

如果平台要求每个应用使用独立回调路径，可在配置中填写 `callbackKey`，使用：

```text
https://<对外域名>/api/marketplace/{platform}/oauth/callback/{callbackKey}
```

将控制台展示的完整地址**原样**登记到平台开放后台。协议、域名、端口、路径、末尾斜杠必须完全一致。

## 3. 平台侧准备

1. 登录对应开放平台（Daraz Open Platform / Lazada Open Platform / TikTok Partner Center）。
2. 创建或查看应用，记录 App Key 与 App Secret。
3. 在应用的 Redirect / Callback URL 中登记 §2 的地址。
4. 确认应用已开通目标站点权限（例如 Daraz `LK` / `PK` / `BD` / `NP` / `MM`）。
5. 平台要求 HTTPS 时使用公网域名或内网穿透地址，不要登记 `localhost`。

## 4. 站点与回退规则

配置按 `组织 + 平台 + 站点` 生效：

1. 优先使用与店铺站点完全匹配的配置（例如 `daraz + LK`）。
2. 没有精确匹配时，使用该平台的「全部站点」配置（`region=''`）。
3. 两者都没有时，授权会提示“平台应用未配置”，不会读取环境变量兜底。

建议 MVP 先为 Daraz 斯里兰卡（`LK`）创建精确配置；需要复用时再加通用配置。

## 5. 部署侧仍需配置的变量

应用凭据已迁移到数据库，部署环境只保留基础设施变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `MARKETPLACE_CREDENTIALS_KEY` | 是 | AES-256-GCM 密钥，加密租户 App Secret 与 OAuth token；`apps/shop` 与 `apps/api` 必须一致 |
| `BETTER_AUTH_URL` | 建议 | 对外访问源，用于生成回调地址与登录跳转；生产必须是公网 HTTPS |
| `NEXT_PUBLIC_URL` | 可选 | `BETTER_AUTH_URL` 未设置时作为兜底源 |
| `REDIS_*` / `UPSTASH_REDIS_*` | 多实例必填 | OAuth state nonce 共享；单实例可退化为内存 |

说明：

- 不再需要 `DARAZ_APP_KEY`、`DARAZ_APP_SECRET`、`DARAZ_CALLBACK_URL` 等全局应用变量。
- 若 `apps/api` 负责同步和 token 刷新，它读取的是同一张 `marketplace_app_credentials` 表，因此也必须使用同一个数据库与 `MARKETPLACE_CREDENTIALS_KEY`。
- 修改 `BETTER_AUTH_URL` 后，已登记在平台的回调地址也要同步修改。

## 6. 验证流程

1. 在 **平台应用配置** 保存 `Daraz + LK` 配置。
2. 在 **店铺连接** 新增店铺，平台选 Daraz、站点选斯里兰卡。
3. 提交后会跳转 Daraz 授权页；不再出现 `Missing app credentials for platform daraz`。
4. 完成授权后回调到：

   ```text
   /api/marketplace/daraz/oauth/callback
   ```

5. 成功后回到店铺详情并带 `?oauth=success`：
   - `shops.status = active`
   - `integration_credentials` 新增/更新 `kind='oauth'` 记录
   - `marketplace_app_credentials.last_verified_at` 更新

SQL 抽查：

```sql
SELECT id, platform, region, app_key, status, last_verified_at, last_error
FROM marketplace_app_credentials
WHERE organization_id = '<组织ID>';

SELECT id, platform, status, external_shop_id, region, auth_expires_at
FROM shops
WHERE id = '<店铺ID>';

SELECT shop_id, kind, expires_at, left(payload_encrypted, 12) AS cipher_prefix
FROM integration_credentials
WHERE shop_id = '<店铺ID>';
```

## 7. 常见错误对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `平台应用未配置，请先在「设置 → 平台应用配置」完成配置` | 当前组织没有该平台/站点配置 | 按 §1 创建配置；确认站点匹配 |
| 回调页 `invalid oauth callback` | state 与 cookie 不一致：域名/端口变化、超过 15 分钟、Cookie 被拦截、回调缺少 code/state | 用同一域名完成发起与回调；检查 Cookie；重新授权 |
| 回调页 `oauth state expired` | nonce 已消费或过期；多实例未共享 Redis | 重新授权；多实例配置共享 Redis |
| `platform mismatch` | 回调路径平台与 state 平台不一致 | 检查平台开放后台登记的回调地址 |
| `callback_key_mismatch` | 配置了 `callbackKey`，但平台回调到了默认路径或错误 key | 把平台回调地址改成控制台展示的完整独立路径 |
| `token_exchange_failed` | App Secret 错误、回调地址与平台登记不一致、code 过期或重复使用 | 核对 Secret 与回调地址；重新授权 |
| `credential_decrypt_failed` | 部署环境缺少或更换了 `MARKETPLACE_CREDENTIALS_KEY` | 恢复原密钥；或在控制台重新填写 App Secret |
| 同步仍失败 | `apps/api` 数据库或加密密钥与 `apps/shop` 不一致 | 统一数据库与 `MARKETPLACE_CREDENTIALS_KEY` |
| 平台提示 `redirect_uri` 不匹配 | 控制台展示地址与开放后台登记值不一致 | 两处改成完全相同的值 |

## 8. 安全要求

- App Secret 只保存在服务端，数据库存储 AES-256-GCM 密文；接口只返回脱敏状态。
- 不要把真实 App Secret、`MARKETPLACE_CREDENTIALS_KEY`、token 提交到 Git。
- App Secret 泄露时立即在开放平台重置，并在控制台更新配置；如怀疑 token 泄露，重新授权店铺。
- 删除或修改配置会导致对应店铺无法授权/刷新 token；操作前确认影响范围。
- 排查问题优先查看「接口日志」「变更审计」与 `marketplace_app_credentials.last_error`，不要把平台原始错误或 token 返回给前端。

## 9. 相关代码与文档

| 内容 | 位置 |
| --- | --- |
| 设计文档 | `docs/design/marketplace-multitenant-app-credentials.md` |
| 配置页 | `apps/shop/src/app/[locale]/console/settings/marketplace-apps/page.tsx` |
| 配置 tRPC | `apps/shop/src/lib/server/routers/marketplace-apps.ts` |
| 授权 tRPC | `apps/shop/src/lib/server/routers/shops.ts` |
| Authorize / Callback 路由 | `apps/shop/src/app/api/marketplace/{authorize,[platform]/oauth/callback}/route.ts` |
| 租户凭据解析 | `packages/marketplace/src/db/app-credential-store.ts` |
| Token / Secret 加密 | `packages/marketplace/src/crypto/credentials.ts` |
| 连接器设计 | `docs/design/marketplace-connectors.md` |
