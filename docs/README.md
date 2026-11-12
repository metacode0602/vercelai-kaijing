# 文档索引

Open Shop（多租户跨境电商运营中枢）的文档总入口。当前仓库只维护跨境运营域文档；历史业务域文档已移除。

## 目录结构

```text
docs/
├── README.md            # 本文件：总索引
├── business/
│   └── haoshiyun-erp-sow.md   # 好时运 ERP 产品工作说明书（SOW）
└── design/
    ├── INDEX.md         # 设计文档清单
    ├── crossborder-mvp-overview.md
    ├── crossborder-database-design.md
    ├── crossborder-api-mcp-design.md
    └── marketplace-connectors.md

apps/shop/content/design/   # 租户端设计（UED / 成本计算器 / 站内信）
apps/shop/content/guide/    # 租户端操作手册（平台 OAuth 管理员配置等）
apps/web/                   # 平台运营后台（暂无独立设计文档）
apps/api/                   # OpenAPI / MCP（设计见 docs/design）
apps/docs/content/docs/     # fumadocs 站点源（会发布）
```

## 查找入口

| 想找什么 | 去哪里 |
| --- | --- |
| 全仓设计清单 | [design/INDEX.md](design/INDEX.md) |
| 产品 SOW / 排期 / 功能级交付清单 | [business/haoshiyun-erp-sow.md](business/haoshiyun-erp-sow.md)（操作级逐行清单见其 §6 附件） |
| 改造总览与模块边界 | [design/crossborder-mvp-overview.md](design/crossborder-mvp-overview.md) |
| 数据库设计 | [design/crossborder-database-design.md](design/crossborder-database-design.md) |
| OpenAPI / MCP | [design/crossborder-api-mcp-design.md](design/crossborder-api-mcp-design.md) |
| Marketplace connectors | [design/marketplace-connectors.md](design/marketplace-connectors.md) |
| Marketplace 多租户应用凭据 | [design/marketplace-multitenant-app-credentials.md](design/marketplace-multitenant-app-credentials.md) |
| 平台 OAuth 租户配置手册（Daraz / Lazada / TikTok） | [apps/shop/content/guide/marketplace-oauth-admin-setup.md](../apps/shop/content/guide/marketplace-oauth-admin-setup.md) |
| 租户端 UED | [apps/shop/content/design/crossborder-shop-ued-product-design.md](../apps/shop/content/design/crossborder-shop-ued-product-design.md) |
| 到仓成本计算 | [apps/shop/content/design/cost-calculator-sl-landed-ued.md](../apps/shop/content/design/cost-calculator-sl-landed-ued.md) |
| 模块运行说明 | 各应用 `README.md` |

## 分类约定

- 描述「系统怎么建」→ `design`
- 描述「人怎么操作」→ `guide`（如 [平台 OAuth 管理员配置](../apps/shop/content/guide/marketplace-oauth-admin-setup.md)）
- 描述「怎么卖 / 定价 / 合同 / SOW」→ `business`
- 跨模块内容上提 `docs/`，单一模块内容放 `<app>/content/`
- 被代码/构建读取的站点内容不移动；营销落地页暂保持现状
- 流程图统一用 mermaid

## 相关入口

- 仓库总览：[README.md](../README.md)
- 开发约定：[AGENTS.md](../AGENTS.md)
