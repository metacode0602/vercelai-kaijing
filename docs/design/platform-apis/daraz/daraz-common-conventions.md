# Daraz Open Platform 通用约定（中文）

> 核验日期：2026-11-05。本文依据 Daraz 官方 API Reference 的公开 JSON 数据整理：
> `https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=<分类ID>` 与
> `https://open.daraz.com/handler/share/apidoc/getApi.json?path=<path>&methodType=<method>&categoryId=<cid>`。
> 字段名、类型、必填状态均保留官方原样；官方未声明的约束不做推断。
>
> 官方入口：<https://open.daraz.com/doc/api.htm>

## 1. 站点与服务端点

每个 Daraz 站点独立卖家账号、独立授权、独立 token。斯里兰卡站（LK）使用：

| 站点 | REST 服务端点 | OAuth 授权域 |
|---|---|---|
| Sri Lanka (LK) | `https://api.daraz.lk/rest` | `https://api.daraz.lk` |
| Pakistan (PK) | `https://api.daraz.pk/rest` | `https://api.daraz.pk` |
| Bangladesh (BD) | `https://api.daraz.com.bd/rest` | `https://api.daraz.com.bd` |
| Myanmar (MM) | `https://api.shop.com.mm/rest` | `https://api.shop.com.mm` |
| Nepal (NP) | `https://api.daraz.com.np/rest` | `https://api.daraz.com.np` |

## 2. 认证与授权

### 2.1 OAuth 流程

1. 在 Daraz Open Platform 创建应用，取得 `app_key` / `app_secret`。
2. 引导卖家打开授权页：

```text
https://api.daraz.lk/oauth/authorize?response_type=code&force_auth=true&redirect_uri=<回调地址>&client_id=<app_key>
```

3. 用回调中的 `code` 调 `/auth/token/create` 换取 `access_token` / `refresh_token`。
4. 过期后用 `/auth/token/refresh` 刷新。

### 2.2 认证类接口

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| generate access_token | GET/POST | `/auth/token/create` | 用授权码换取 token |
| Refresh access_token | POST | `/auth/token/refresh` | 刷新 token |
| GetSeller | GET | `/seller/get` | 查询授权卖家信息 |

> token 有效期以官方授权文档和实际响应为准；Daraz 与 Lazada 使用同一套 Lazop 协议，但 token 秒数不应直接照搬 Lazada 文档。

## 3. 公共请求参数

除认证类接口外，业务接口通常要求以下参数：

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| app_key | String | 是 | 应用 ID | Open Platform 控制台签发 |
| timestamp | String | 是 | 请求时间戳 | 毫秒时间戳；官方要求与 UTC 时间差小于 7200 秒 |
| access_token | String | 是 | 店铺授权凭证 | 按卖家授权取得；LK token 不能用于其他站点 |
| sign_method | String | 是 | 签名算法 | 官方签名页示例使用 HMAC；具体取值以应用配置为准 |
| sign | String | 是 | 请求签名 | 由请求参数与 `app_secret` 计算，禁止写入日志或文档 |

### 3.1 签名要点

- 官方签名说明入口：<https://open.daraz.com/doc/doc.htm#?nodeId=10450&docId=108068>。
- 通用做法：除去 `sign` 外的所有请求参数按参数名 ASCII 升序拼接，使用 `app_secret` 做 HMAC（`sign_method` 指定算法），再按官方要求编码。
- 时间戳必须使用毫秒，且与服务器 UTC 时间偏差小于 7200 秒；否则会因过期被拒绝。
- `app_secret`、`access_token`、`refresh_token` 只允许加密存储；日志中只记录 `request_id`。
- 同一请求重试时应复用业务幂等键（如 `externalOrderId`），不要只依赖 HTTP 重试。

## 4. 响应与错误

### 4.1 通用响应结构

不同接口的响应包裹层不同，常见形式：

```json
{
  "code": "0",
  "request_id": "0ba1a1a1a1a1a1a1",
  "data": {}
}
```

```json
{
  "result": {
    "success": true,
    "error_code": "0",
    "error_msg": "",
    "data": {}
  }
}
```

- `code = "0"` 通常表示成功；业务错误需同时检查 `result.success`、`result.error_code`、`item_err_code`。
- 履约类接口即使 `result.success = true`，也必须逐个检查 `item_err_code = 0` 才能判定该订单项成功。
- 保存 `request_id` 用于向平台排查；不要保存完整签名。

### 4.2 常见错误码

| 错误码 | 含义 | 处理建议 |
|---|---|---|
| 5 | E005 请求格式无效 | 检查 URL、参数编码 |
| 6 | E006 系统错误 | 记录 `request_id`，按退避策略有限重试 |
| 14 / 19 | offset / limit 无效 | 检查分页参数范围 |
| 16 | 订单 ID 无效 | 校验订单归属与 ID |
| 17 | 日期格式无效 | 使用 ISO 8601 |
| 36 | 订单状态过滤值无效 | 使用官方枚举 |
| 900 | 未授权 | 检查 token 是否过期、店铺是否授权 |
| 901 | 请求过于频繁 | 降低并发/增加间隔 |
| 1000 | 内部应用错误 | 记录请求上下文后重试或联系平台 |

> 上表是官方各接口错误码的公共部分；单接口还有专属错误码，见各域文档。

## 5. 分页、时间窗与同步

Daraz 各域分页方式不统一，接入时必须按接口区分：

| 模式 | 典型接口 | 参数 | 注意事项 |
|---|---|---|---|
| 偏移分页 | `/products/get`、`/orders/get`、`/finance/transaction/details/get` | `offset` + `limit`（订单接口官方拼写为 `limt`） | 商品 `offset` 已弃用且最大 10000；订单最大 100；财务最大 500 |
| 页码分页 | 逆向订单、Xspace | `page_no` + `page_size` | 页码从 1 开始 |
| 游标分页 | IM 会话/消息 | `start_time` + `last_session_id` / `last_message_id` | 用上一页返回值继续翻页 |
| 时间窗增量 | 商品、订单、财务 | `update_after` / `created_after` / `start_time` | 财务区间必须小于 180 天 |

同步建议：

1. 首次全量按时间窗回补，之后按 `update_after` 增量拉取。
2. 使用平台主键（`order_id`、`order_item_id`、`item_id`、`sku_id`、`statement_number`）做幂等 upsert。
3. 本地保存 `raw` 原始响应，规范化字段单独落列；平台字段变更时不影响原始证据。
4. 对 PII（姓名、电话、地址、邮箱）做加密存储、访问审计与保留期限控制。
5. 写操作（改价、改库存、打包、RTS、取消、发消息）必须进入待审/审计流程，并设置幂等键。

## 6. 请求格式与 payload

- Daraz Open Platform 只支持 JSON 响应；商品创建/更新、价格库存更新等接口的业务主体是 XML 字符串，放在 `payload` 参数中。
- `payload` 的字段由类目和接口共同决定，必须以 `/category/attributes/get` 返回的实时属性 schema 为准。
- 不要缓存类目属性 schema 超过一个同步周期；类目属性会随平台规则变化。

## 7. 安全与合规

- 订单地址、电话、买家姓名属于个人信息，禁止写入普通日志、导出到无权限的分析表。
- 图片上传/迁移接口只接受 JPG/PNG，单图最大 1MB；多图接口单次最多 8 张。
- 物流面单、发票等文件包含收件人信息，下载后按敏感文件管理。
- 广告数据在 Daraz Open API 中没有官方接口，详见 `daraz-advertising-api.md`，不得把促销接口当作广告报表。

## 8. 官方来源

| 资源 | URL |
|---|---|
| API Reference | <https://open.daraz.com/doc/api.htm> |
| 分类目录 | <https://open.daraz.com/handler/share/apidoc/getApiCategory.json?cid=1> |
| 单接口 JSON | <https://open.daraz.com/handler/share/apidoc/getApi.json?path=%2Fproducts%2Fget&methodType=GET&categoryId=1> |
| 签名说明 | <https://open.daraz.com/doc/doc.htm#?nodeId=10450&docId=108068> |
| Daraz 授权说明 | <https://developer.alibaba.com/docs/doc.htm?articleId=121263&docType=1&treeId=754> |
