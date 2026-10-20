> # ⛔ 已归档 — 描述的实现是错的
>
> **归档日期**：2026-09-26　**原路径**：`docs/mode-a-p0-middleware.md`
> **归档原因**：本文描述的白牌域名多租户实现**本身有缺陷**，照此实现会得到「Q17=A 从未生效」的结果（主设计文档 P1-15）。
>
> **具体错误**：
> 1. **文件名错**：本文称 `apps/merchant/src/middleware.ts` —— 该文件**不存在**，Next 16 实际为 `apps/merchant/src/proxy.ts`。
> 2. **方向错（核心缺陷）**：本文第 3 步「**Set response header**: `x-merchant-domain`」把域名写进**响应**头；而 `apps/merchant/src/lib/server/merchant-resolver.ts:20-21` 与 `branding-resolver.ts:19` 是用 `await headers()` 读**请求**头。响应头永远到不了 RSC，域名解析必然回退到 session 分支。
> 3. **正确写法**：`NextResponse.next({ request: { headers: requestHeaders } })`（或 `handleI18nRouting(request, { request: { headers } })`），即写入**请求**头再转发。
> 4. **Schema 路径过时**：应为 `packages/db/src/merchant-schema.ts:828`（`merchant_branding`）。
>
> **当前有效设计文档**：`apps/merchant/content/design/merchant-module-review-and-design.md`（见 P1-15）

# Merchant Custom Domain Middleware (M-DOMAIN)

## Overview

`apps/merchant/src/middleware.ts` enables multi-tenant custom domain resolution for the merchant platform (Q17=A architecture).

## Flow

```
1. Request arrives at merchant app
2. Middleware extracts hostname from request.nextUrl.hostname
3. If hostname is NOT local (localhost/127.*/192.168.*/*.local):
   → Set response header: x-merchant-domain = hostname
4. merchant-resolver.ts reads x-merchant-domain header
5. Queries merchant_branding table by custom_domain
6. Returns matched merchant ID or falls back to session-based resolution
```

## Key Components

### Middleware (`apps/merchant/src/middleware.ts`)

- **Input**: Request hostname
- **Output**: Response with `x-merchant-domain` header (production hostnames only)
- **Integration**: Wraps next-intl routing middleware
- **Exclusions**: `/api/*`, `/_next/*`, `/_vercel/*`, static assets

### Resolver (`apps/merchant/src/lib/server/merchant-resolver.ts`)

- **Priority 1**: Custom domain → `merchant_branding.custom_domain` lookup
- **Priority 2**: Session → `activeOrganizationId` → merchant table
- **Validation**: Checks merchant status (active/pending)
- **Redirects**: Handles inactive merchants, missing orgs, pending approval

## Database Schema

```
merchant_branding
├── custom_domain (varchar, unique)
├── merchant_id (FK → merchant.id)
└── ...

merchant
├── id (text PK)
├── organization_id (FK → organization.id)
├── status (varchar: 'active' | 'pending' | 'inactive')
└── ...
```

## Local Development

- Localhost requests skip `x-merchant-domain` header
- Falls back to session-based merchant resolution
- No custom domain simulation needed for local dev

## Production Deployment

1. Merchant configures custom domain in branding settings
2. DNS points custom domain to merchant app
3. Middleware sets `x-merchant-domain` header
4. Resolver queries by domain and returns merchant context

## Related

- **Design**: Q17=A multi-tenant architecture
- **PR**: #16 (supersedes corrupted PR #14)
- **Schema**: `packages/db/schema/merchant-branding.ts`
