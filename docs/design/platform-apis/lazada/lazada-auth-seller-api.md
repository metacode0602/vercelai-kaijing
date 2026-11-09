# Lazada 授权与卖家（Auth / Seller）API

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference（System `cid=11`、Seller `cid=2`）。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host、分页约定见 `lazada-common-conventions.md`。

## 1. 接口清单

| 接口 | 方法 | 路径 | 用途 | 集成标记 |
|---|---|---|---|---|
| GenerateAccessToken | GET/POST | `/auth/token/create` | 授权码换 token | 授权 |
| GenerateAccessTokenWithOpenId | GET/POST | `/auth/token/createWithOpenId` | openId 场景换 token | 授权 |
| RefreshAccessToken | GET/POST | `/auth/token/refresh` | 刷新 token | 授权 |
| GetSeller | GET | `/seller/get` | 查询当前授权卖家 | 系统同步 |
| GetSellerMetricsById | GET | `/seller/metrics/get` | 卖家指标 | 可选 |
| GetSellerPerformance | GET/POST | `/seller/performance/get` | 卖家表现 | 可选 |
| SellerPolicyFetch | GET | `/seller/policy/fetch` | 卖家政策 | 可选 |
| getCountryInfo | GET/POST | `/seller/cb/country/get` | 跨境国家信息 | CB 可选 |

Seller 分类共 17 个接口，其余为跨境注册、仓库、支付配置、Buybox、Seller Center 消息等；核心授权只需要上表前 4 个。

## 2. 授权流程

```text
应用控制台创建 App
  → 卖家打开 https://auth.lazada.com/oauth/authorize
  → 回调拿到 code
  → POST /auth/token/create（auth.lazada.com/rest）
  → 保存 access_token / refresh_token / country_user_info
  → GET /seller/get 校验 seller_id 与站点
```

- 授权 URL 常见形式：

```text
https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=<回调地址>&client_id=<app_key>
```

- 可加 `country=sg,my,th,vn,ph,id,cb` 限制授权站点；以官方授权页当前参数为准。
- 跨境卖家一次授权可返回多个国家的 `seller_id`，但每个站点仍需使用对应 REST host 调用。
- 本地卖家按站点账号分别授权。

## 3. GenerateAccessToken — `/auth/token/create`

### 3.1 请求参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| code | String | 是 | OAuth 授权码 | 从回调 URL 获取，30 分钟内有效且只能用一次 |
| uuid | String | 否 | 官方标注当前无效 | 不要使用；官方原文 `This field is currently invalid` |

公共参数（`app_key`、`timestamp`、`sign_method`、`sign`）见通用约定。该接口 `access_token` 非必填。

### 3.2 响应参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| expires_in | Number | 是 | access token 有效期 | 秒 |
| refresh_expires_in | Number | 是 | refresh token 有效期 | 秒 |
| access_token | String | 是 | 访问令牌 | 加密存储 |
| refresh_token | String | 是 | 刷新令牌 | 加密存储 |
| account_id | String | 是 | 账号 ID | `account_platform=seller_center` 时可为空 |
| account_platform | String | 是 | 账号平台 | 示例 `seller_center` |
| account | String | 是 | 登录账号 | 示例为邮箱；PII |
| country | String | 是 | 国家站 | `sg/my/th/id/vn/ph` |
| country_user_info | Object | 是 | 各国家卖家信息 | 以国家代码为 key |
| country_user_info.<country>.seller_id | String | 是 | 卖家 ID | 按站点保存 |
| country_user_info.<country>.user_id | String | 是 | 用户 ID | |
| country_user_info.<country>.short_code | String | 是 | 卖家短码 | |

### 3.3 使用方法

```text
POST https://auth.lazada.com/rest
  ?app_key=...&timestamp=...&sign_method=sha256&sign=...
  &code=<callback_code>
```

- 回调 code 只能换一次；失败时不要重复使用同一个 code。
- `country_user_info` 是多国对象；落库时展开为 `shops` 多行，不要只存第一层。
- 保存 `expires_in` 的绝对过期时间，不要保存相对秒数。

## 4. RefreshAccessToken — `/auth/token/refresh`

### 4.1 请求参数

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| refresh_token | String | 是 | 授权时取得的刷新令牌 |

### 4.2 响应参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| expires_in | Number | 是 | access token 有效期 | 秒 |
| refresh_expires_in | Number | 是 | refresh token 有效期 | 秒 |
| access_token | String | 是 | 新 access token | 替换旧值 |
| refresh_token | String | 是 | 新 refresh token | 替换旧值 |
| account_id | String | 是 | 账号 ID | |
| account_platform | String | 是 | 账号平台 | |
| account | String | 是 | 登录账号 | PII |
| country | String | 是 | 国家站 | |
| country_user_info_list | Object[] | 是 | 各国家卖家信息 | 注意是 list，不是 create 的 object |
| country_user_info_list.country | String | 是 | 国家 | |
| country_user_info_list.seller_id | String | 是 | 卖家 ID | |
| country_user_info_list.user_id | String | 是 | 用户 ID | |
| country_user_info_list.short_code | String | 否 | 卖家短码 | |

- 官方描述该接口端点为 `https://auth.lazada.com/rest`。
- 刷新后旧 refresh token 是否立即失效，官方未在字段表中说明；实现上按一次性轮换处理，成功后原子替换。
- 刷新失败要区分「网络失败」与「授权失效」；后者标记店铺 `reauth_required`，不要无限重试。

## 5. GenerateAccessTokenWithOpenId — `/auth/token/createWithOpenId`

请求/响应字段与 `/auth/token/create` 基本一致：

| 字段名 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| code | String | 是 | OAuth 授权码 |
| uuid | String | 否 | 官方标注当前无效，不要使用 |

响应同样返回 `access_token`、`refresh_token`、`expires_in`、`refresh_expires_in`、`account_id`、`account_platform`、`account`、`country`、`country_user_info`。

## 6. GetSeller — `/seller/get`

### 6.1 请求参数

无业务参数；使用公共参数与 `access_token`。

### 6.2 响应参数

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| data.seller_id | Number | 是 | 卖家 ID | 与授权返回的 seller_id 对应 |
| data.name | String | 是 | 店铺名 | |
| data.name_company | String | 是 | 公司名 | |
| data.short_code | String | 是 | 卖家短码 | |
| data.email | String | 是 | 卖家邮箱 | PII |
| data.logo_url | String | 是 | Logo | |
| data.cb | Boolean | 是 | 是否跨境卖家 | |
| data.location | String | 否 | 所在地 | |
| data.status | String | 否 | 状态 | `ACTIVE` / `INACTIVE` / `DELETED` |
| data.verified | Boolean | 否 | 是否已验证 | |
| data.marketplaceEaseMode | Boolean | 否 | MarketplaceEaseMode | |

### 6.3 使用方法

- 授权成功后立即调用一次，用于校验 token 与站点，并补齐 `shops` 的 `sellerName`、`marketplaceCountry`、`currency`、`timezone`。
- `seller_id` 不是 `shop_id`；Lazada 同一 seller 可能对应多站点店铺，`shops.external_shop_id` 用站点 seller_id 或平台店铺 ID，`shops.seller_id` 保留卖家侧 ID。
- `data.status != ACTIVE` 时不要继续同步订单/商品，标记店铺异常并进入人工复核。

## 7. 凭证模型

| 数据 | 存储 | 要求 |
|---|---|---|
| `app_key` | 环境变量/配置 | 可按环境区分 |
| `app_secret` | 密钥管理 | 不落库明文、不进日志 |
| `access_token` | `integration_credentials` 加密 payload | 带绝对过期时间 |
| `refresh_token` | `integration_credentials` 加密 payload | 轮换时原子替换 |
| `country_user_info` | `shops` / `meta` | 多国展开，不覆盖 |
| `seller_id` | `shops.seller_id` | 与 `external_shop_id` 区分 |

## 8. 官方来源

| 资源 | URL |
|---|---|
| System 分类 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=11&language=en> |
| GenerateAccessToken | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fauth%2Ftoken%2Fcreate&methodType=GET%2FPOST&categoryId=11> |
| RefreshAccessToken | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fauth%2Ftoken%2Frefresh&methodType=GET%2FPOST&categoryId=11> |
| GetSeller | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fseller%2Fget&methodType=GET&categoryId=2> |
| 签名说明 | <https://open.lazada.com/apps/doc/doc?nodeId=10450&docId=108068> |
