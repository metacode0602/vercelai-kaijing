# 商户充值支付方式配置指南

**文档性质**：运维 / 实施查阅手册
**适用目录**：`apps/merchant/.env`（运行时被 `@workspace/billing` 读取）
**适用症状**：商户端充值页显示「当前没有可用的支付方式，请联系平台运营。」
**关联代码**：`packages/billing/src/payment-gateway/`、`apps/merchant/src/app/[locale]/console/account/account-recharge-panel.tsx`

---

## 0. 先跑诊断，别猜

```bash
pnpm --filter @workspace/billing run diagnose:payment
```

输出会直接告诉你每个通道的状态、**缺哪几个环境变量**，以及商户端会不会展示它。
脚本只回报「设了没」，不回显密钥值，可以安全地贴到工单里。

- 退出码 `0`：至少一个线上通道可下单，商户端应当能看到入口。
- 退出码 `1`：没有任何线上通道可下单，按输出里列出的变量补 `.env` 后**重启应用**。

> 改动 `.env` 后必须重启进程。Next.js 只在启动时读取环境变量，热更新不会生效。

---

## 1. 为什么商户看不到入口

判定链路如下（任一环不满足，入口就不展示）：

```text
prepay.constants.paymentMethods
  └─ listAvailableMethods()                    packages/billing/src/payment-gateway/index.ts
       └─ 过滤 isPaymentMethodOrderable(method)
            = gateway.available && gateway.orderCapable
            ├─ available     ← 凭据是否配齐
            └─ orderCapable  ← 下单接口是否可用（微信/支付宝与 available 同源）
                                    ↓
前端 account-recharge-panel.tsx
  └─ methods = paymentMethods.filter(m => m === 'bank_transfer' ? hasAccount : true)
       └─ hasAccount = prepay.bankAccounts 有数据（该商户在 bank_account 表有启用中的账户）
                                    ↓
methods.length === 0  →  显示「当前没有可用的支付方式」
```

**关键点**：`bank_transfer`（对公转账）通道本身恒为可用（`available = true`、
`orderCapable = true`），但它**不为空**——商户端还要求 `bank_account` 表里给这个商户配了
一条 `is_active = true` 的收款账户。只配了微信/支付宝而没给商户配对公账户，商户依然看不到入口。

三种支付方式的启用条件：

| 方式 | 需要什么 | 是否需要第三方凭据 |
|------|----------|--------------------|
| 微信支付（Native 扫码） | 7 个 `WECHAT_PAY_*` 变量 | 是 |
| 支付宝（电脑网站支付） | 4 个 `ALIPAY_*` 变量 | 是 |
| 对公转账 `bank_transfer` | `bank_account` 表一条启用中的商户收款账户 | **否** |

---

## 2. 方案 A：对公转账（最快，零第三方依赖）

不依赖任何第三方凭据，是让充值入口**立刻可见**的推荐做法：平台把对公收款账户
配置给商户，商户用订单号作汇款备注转账，平台核对后回调入账。

### 2.1 为商户开设专用收款账户（推荐走后台）

1. 进入**运营平台**（`apps/web`）→ 左侧菜单 **专用收款账户**
   （`/merchant/receiving-accounts`，需 `ADMIN_USER` 角色）。
2. 点「新增专用账户」，填写：
   - **账户名称**：平台对公账户户名
   - **账号**：平台对公账号（后台列表会做掩码显示 `maskAccountNo`）
   - **开户行**：如「招商银行」
   - **开户支行**：可空
3. 保存。创建逻辑（`apps/web/src/lib/server/dataaccess/merchant/merchant-receiving-account.ts`）
   会自动完成：校验商户存在、`sort_order` 取该商户当前最大值 + 1、重复顺序拦截、
   `is_active` 置 `true`。

保存后刷新商户充值页即可看到「对公转账」。

> **关键坑**：`bank_account.merchant_id` 为 `NULL` 表示**平台通用账户，商户端不可见**
> （schema 注释明确写了这点）。只有带 `merchant_id` 的「专用账户」才会出现在商户充值页。
> 建了通用账户却发现商户仍无入口，基本都是这个原因。

### 2.2 找到目标商户的 merchant_id

后台「专用收款账户」页面按商户筛选即可；若需直接查库：

```sql
SELECT m.id, m.name, m.funding_mode
FROM merchant m
JOIN organization o ON o.id = m.organization_id
WHERE o.slug = 'merchant-xxxxxxxx';   -- slug 在 organization 表
```

### 2.3 直接写库（仅在无后台权限时兜底）

```sql
-- id 是 text 主键，代码用 cuid2 生成（createId）；不要依赖 pgcrypto 扩展
INSERT INTO bank_account (
  id, account_name, account_no, bank_name, bank_branch,
  merchant_id, account_type, is_active, sort_order, created_at
) VALUES (
  'ckxxxxxxxxxxxxxxxxxxxxxxxxxx',  -- cuid2，见 apps/merchant 控制台或 node -e "console.log(require('@paralleldrive/cuid2').createId())"
  'XX科技有限公司',                 -- 平台对公账户户名
  '6222xxxxxxxxxxxx',             -- 平台对公账号
  '招商银行',                      -- 开户行
  '深圳分行科技园支行',             -- 开户支行（可空）
  '<merchant_id>',                -- 必须非空，否则商户端不可见
  'enterprise',
  true,                           -- is_active 必须为 true
  0,
  now()
);
```

同一商户的 `(merchant_id, sort_order)` 有部分唯一索引兜底，重复顺序会直接报错。

### 2.4 验证

```sql
SELECT id, account_name, account_no, bank_name, is_active
FROM bank_account
WHERE merchant_id = '<merchant_id>' AND is_active = true;
```

有返回即生效。

### 2.5 注意

- 一个商户可以有多条启用中的账户，按 `sort_order` 排序展示。
- 入账**只认平台侧回调** `handleMerchantPrepayCallback`，不会因为商户填了单就自动到账。
- 商户必须把 `order_no` 原样填进汇款备注，否则无法自动归属，需人工核对
  （后台 **转账凭证核销** `/merchant/transfer-proofs` 处理这类人工场景）。

---

## 3. 方案 B：微信支付（Native 扫码）

Native 下单是标准 HTTPS + 签名调用，不需要额外联调，所以 `orderCapable` 与
`available` 同源——**7 个变量配齐即可展示**。

| 变量 | 作用 | 获取方式 |
|------|------|----------|
| `WECHAT_PAY_MCH_ID` | 商户号 | 微信支付商户平台 → 账户中心 |
| `WECHAT_PAY_APP_ID` | 应用 AppID（Native 需绑定） | 商户平台 → 应用管理 |
| `WECHAT_PAY_PRIVATE_KEY` | 商户 API 私钥（PKCS8 PEM） | 商户平台 → 账户中心 → API 安全 |
| `WECHAT_PAY_SERIAL_NO` | 商户证书序列号 | 下载证书时 `.p12` 同目录的序列号 |
| `WECHAT_PAY_PLATFORM_CERT` | 微信支付平台公钥 | 商户平台 → 账户中心 → API 安全 |
| `WECHAT_PAY_API_V3_KEY` | APIv3 密钥（32 字节） | 商户平台 → 账户中心 → API 安全 |
| `WECHAT_PAY_NOTIFY_URL` | 异步通知回调地址 | 自建，必须是**公网 HTTPS** |

### 3.1 示例

```env
WECHAT_PAY_MCH_ID=1900000109
WECHAT_PAY_APP_ID=wx1234567890abcdef
# 多行 PEM 用 \n 转义（部署时单行环境变量常见）
WECHAT_PAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----
WECHAT_PAY_SERIAL_NO=5157F09EFDC096DE15EBE81A47057A72E627CB2
WECHAT_PAY_PLATFORM_CERT=-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----
WECHAT_PAY_API_V3_KEY=abcdef0123456789abcdef0123456789
WECHAT_PAY_NOTIFY_URL=https://your-domain/api/payments/notify/wechat
```

> `readPem()` 会把 `\n` 还原成真实换行，所以单行环境变量里可以直接写 `\n`。
>
> **含空格的 PEM 值必须用双引号包起来**（`-----BEGIN PRIVATE KEY-----` 中间有空格）。
> 不加引号时用 `set -a && . .env` 这类 POSIX shell 加载会报 `PRIVATE: command not found`。
> `@next/env` 与 POSIX shell 都会剥掉外层双引号；但若某天换成不剥引号的加载器，
> `readPem()` **不会**去掉引号，PEM 头会变成 `"-----BEGIN PRIVATE KEY-----` 而签名失败。

### 3.2 回调地址要求

- 必须是**公网可达的 HTTPS** 地址，本地调试需要内网穿透。
- 通知与查单都会用 `WECHAT_PAY_NOTIFY_URL`；配成 `localhost` 会导致回调永远收不到，
  订单长期停在 pending。
- 回调处理需要 `WECHAT_PAY_API_V3_KEY` 解密报文，缺失会验签/解密失败。

---

## 4. 方案 C：支付宝（电脑网站支付）

电脑网站支付（`alipay.trade.page.pay`）返回签名跳转 URL。

| 变量 | 作用 | 获取方式 |
|------|------|----------|
| `ALIPAY_APP_ID` | 应用 APPID | 开放平台 → 我的应用 |
| `ALIPAY_PRIVATE_KEY` | 应用私钥（PKCS8 PEM） | 开放平台 → 开发工具 → 开发密钥 |
| `ALIPAY_PUBLIC_KEY` | 支付宝公钥（验签用） | 开放平台 → 开发工具 → 支付宝公钥 |
| `ALIPAY_NOTIFY_URL` | 异步通知地址 | 自建，必须是**公网 HTTPS** |

```env
ALIPAY_APP_ID=2021000000000000
ALIPAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----
ALIPAY_PUBLIC_KEY=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n
ALIPAY_NOTIFY_URL=https://your-domain/api/payments/notify/alipay
```

可选变量：

| 变量 | 说明 |
|------|------|
| `ALIPAY_RETURN_URL` | 付款后浏览器跳回地址，**仅用于展示，不作为到账凭据** |
| `ALIPAY_GATEWAY_URL` | 网关地址，沙箱用 `https://openapi-sandbox.dl.alipaydev.com/gateway.do` |

> 沙箱仍需沙箱账号的真实密钥，不能用占位值。

---

## 5. 排障速查

| 现象 | 原因 | 处理 |
|------|------|------|
| 商户看到「当前没有可用的支付方式」 | 线上通道未配齐 **且** 该商户无启用中的 `bank_account` | 跑诊断脚本；补变量或配账户 |
| 诊断显示变量齐备但商户仍无入口 | 配了微信/支付宝，但商户没有启用中的对公账户，而线上通道实际仍不可用 | 重启应用；核对 `is_active` |
| 补完 `.env` 入口没变化 | 环境变量未重启生效 | 重启 merchant 应用进程 |
| 下单报「下单接口尚未联调」 | `orderCapable = false` | 重新跑诊断确认 `orderCapable=true` |
| 微信回调收不到 | `WECHAT_PAY_NOTIFY_URL` 非公网 HTTPS | 配公网地址或内网穿透 |
| 订单一直 pending | 渠道异步通知未送达 | 先确认回调地址可达，再查渠道侧通知日志 |
| 对公转账到账未入账 | 汇款备注没填 `order_no` | 人工核对后由平台侧补回调 |

---

## 6. 安全要求

- **绝不要把真实密钥写进仓库、`.env.example` 或工单。** `.env.example` 里只留变量名与注释。
- 诊断脚本只输出「设了没」，不会回显密钥值，可安全贴到工单。
- 私钥/平台证书建议用密钥管理服务注入；`readPem()` 已支持 `\n` 转义的单行注入。
- 通道未配齐时前端**不展示**入口，这是刻意设计：宁可商户看不到入口，也不要「进得去、
  付不了」留下永远付不了的脏单。因此**不要为了让入口显示而填占位密钥**——那样入口会显示，
  但真实下单会在渠道侧失败，比不显示更难排查。
