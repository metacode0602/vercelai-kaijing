# Lazada Open Platform 通用约定（中文）

> 核验日期：2026-11-05。本文依据 Lazada 官方 API Reference 的公开 JSON 数据整理：
> `https://open.lazada.com/handler/share/apidoc/getApiCategoryList.json`、
> `https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=<分类ID>&language=en`、
> `https://open.lazada.com/handler/share/apidoc/getApi.json?path=<path>&methodType=<method>&categoryId=<cid>`。
> 字段名、类型、必填状态保留官方原样；官方未声明的业务语义不做推断。
>
> 官方入口：<https://open.lazada.com/doc/api.htm>

## 1. 站点与服务端点

Lazada 按国家站独立授权、独立 token。常见 REST 端点：

| 站点 | REST 服务端点 | OAuth 授权域 |
|---|---|---|
| Singapore (SG) | `https://api.lazada.sg/rest` | `https://auth.lazada.com/rest` |
| Malaysia (MY) | `https://api.lazada.com.my/rest` | `https://auth.lazada.com/rest` |
| Thailand (TH) | `https://api.lazada.co.th/rest` | `https://auth.lazada.com/rest` |
| Vietnam (VN) | `https://api.lazada.vn/rest` | `https://auth.lazada.com/rest` |
| Indonesia (ID) | `https://api.lazada.co.id/rest` | `https://auth.lazada.com/rest` |
| Philippines (PH) | `https://api.lazada.com.ph/rest` | `https://auth.lazada.com/rest` |
| Cross Border | `https://api.lazada.com/rest` | `https://auth.lazada.com/rest` |

- 授权入口：`https://auth.lazada.com/oauth/authorize`。
- `/auth/token/refresh` 官方描述明确使用 `https://auth.lazada.com/rest`。
- 站点与 token 绑定；不要把 SG token 用于 MY/TH 等站点。

## 2. 认证与授权

### 2.1 OAuth 流程

1. 在 Lazada Open Platform 创建应用，取得 `app_key` / `app_secret`。
2. 引导卖家打开授权页：

```text
https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=<回调地址>&client_id=<app_key>
```

3. 回调拿到 `code` 后调 `/auth/token/create` 换取 `access_token` / `refresh_token`。
4. 过期后用 `/auth/token/refresh` 刷新。
5. 用 `/seller/get` 校验授权卖家与站点，写入 `shops.seller_id` / `external_shop_id`。

### 2.2 认证类接口

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| GenerateAccessToken | GET/POST | `/auth/token/create` | 用授权码换取 token |
| GenerateAccessTokenWithOpenId | GET/POST | `/auth/token/createWithOpenId` | 用 openId 场景换取 token |
| RefreshAccessToken | GET/POST | `/auth/token/refresh` | 刷新 token |
| GetSeller | GET | `/seller/get` | 查询当前授权卖家 |

> token 有效期以实际响应 `expires_in` / `refresh_expires_in` 为准。官方示例值不能当作生产 TTL。

## 3. 公共请求参数

除认证类接口外，业务接口通常要求：

| 字段名 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| app_key | String | 是 | 应用 ID | Open Platform 控制台签发 |
| timestamp | String | 是 | 请求时间戳 | 毫秒；与 UTC 偏差需小于 7200 秒 |
| access_token | String | 是 | 店铺授权凭证 | 按卖家/站点授权取得 |
| sign_method | String | 是 | 签名算法 | 常见为 `sha256`；以应用配置和官方签名页为准 |
| sign | String | 是 | 请求签名 | 由请求参数与 `app_secret` 计算，禁止落日志 |

### 3.1 签名要点

- 官方签名说明：<https://open.lazada.com/apps/doc/doc?nodeId=10450&docId=108068>。
- 通用做法：除 `sign` 外的请求参数按参数名 ASCII 升序拼接，用 `app_secret` 做 HMAC，再按官方要求编码。
- 商品创建/更新、库存更新等接口的业务主体是 XML 字符串，放在 `payload` 参数中；签名针对参数值整体计算，不要先解析 XML。
- `app_secret`、`access_token`、`refresh_token` 只允许加密存储；日志只记录 `request_id`。
- 写操作必须带业务幂等键；平台侧重试不要只依赖 HTTP 层。

## 4. 响应与错误

### 4.1 通用响应包裹

Lazada 不同分类的包裹层不一致，常见形式：

```json
{
  "code": "0",
  "request_id": "21017d2816548274295911740",
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

- `code = "0"` 通常表示成功；仍要检查业务字段。
- 履约/广告类接口即使 `success = true`，也必须逐项检查 `item_err_code = 0` 或 `result.success`。
- `request_id` / `traceId` / `analyseTraceId` 用于向平台排查；不要保存签名与完整 token。

### 4.2 常见错误类型

| 错误 | 含义 | 处理建议 |
|---|---|---|
| `MissingParameter` | 缺少必填参数 | 检查公共参数与签名参数 |
| `IncompleteSignature` | 签名不完整 | 检查参数排序、编码、`app_secret` |
| `InvalidCode` | 授权码无效/过期/已使用 | 重新走授权；code 仅能使用一次 |
| `InvalidSignature` / 签名错误 | 签名不匹配 | 打印规范化参数（脱敏）后重算 |
| `Unauthorized` / token 过期 | token 失效 | 先 refresh；失败则重新授权 |
| 限流错误 | QPS 超限 | 退避重试；广告接口官方明确高 QPS 会被限制 |

> 各域还有专属错误码；以单接口 `errorCodes` 为准。本文不把未核验的第三方错误码表当成官方事实。

## 5. 分页、时间窗与同步

Lazada 各域分页不统一：

| 模式 | 典型接口 | 参数 | 注意事项 |
|---|---|---|---|
| 偏移分页 | `/orders/get`、`/products/get`、`/finance/transaction/details/get` | `offset` + `limit` | 订单/商品单页最大 100/50；商品 `offset` 已弃用且最大 10000 |
| 页码分页 | `/reverse/getreverseordersforseller`、EPIS Xspace、广告报表 | `page_no`/`pageNo` + `page_size`/`pageSize` | 不同接口大小写不同 |
| 游标分页 | `/im/session/list`、`/im/message/list` | `start_time` + `last_session_id` / `last_message_id` | 用响应中的 `next_start_time` 继续 |
| 日期窗口 | 订单、商品、财务、广告 | `update_after` / `created_after` / `startDate` / `endDate` | 财务交易接口日期格式为 `yyyyMMdd` 或 `yyyy-MM-dd`，逐接口确认 |

同步建议：

1. 首次全量按时间窗回补，后续按 `update_after` / `updated_at` 增量。
2. 用平台主键幂等 upsert：`order_id`、`order_item_id`、`item_id`、`sku_id`、`package_id`、`reverse_order_id`、`statement_number`。
3. 原始响应保存到 `raw`，规范化字段单独落列；不要只存规范化结果。
4. PII（姓名、电话、地址、邮箱）加密存储、访问审计、设置保留期。
5. 写操作进入待审/审计：改价、改库存、打包、RTS、取消、退款、发消息、广告调价。

## 6. 请求格式

- 商品创建/更新、库存更新、部分履约接口使用 XML `payload`；订单/物流查询使用普通 query 参数。
- 类目属性 schema 以 `/category/tree/get` + `/category/attributes/get` 实时返回为准，不要长期缓存。
- 图片上传/迁移只接受 JPG/PNG；具体大小与数量以单接口字段约束为准。

## 7. 安全与合规

- 订单地址、电话、买家姓名属于个人信息，禁止写入普通日志、无权限导出。
- 面单、发票、AWB 含收件人信息，下载后按敏感文件管理。
- 广告账户、钱包、充值配置只允许授权角色访问；写操作必须留审计。
- 不要把 Daraz LK 的 token、库存或履约结论直接套用到 Lazada；两平台分池。

## 8. 官方来源

| 资源 | URL |
|---|---|
| API Reference | <https://open.lazada.com/doc/api.htm> |
| 分类目录 | <https://open.lazada.com/handler/share/apidoc/getApiCategoryList.json> |
| 分类详情 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=11&language=en> |
| 单接口 JSON | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fauth%2Ftoken%2Fcreate&methodType=GET%2FPOST&categoryId=11> |
| 签名说明 | <https://open.lazada.com/apps/doc/doc?nodeId=10450&docId=108068> |
