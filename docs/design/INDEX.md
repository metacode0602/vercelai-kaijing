# 设计文档索引

> Open Shop 当前只维护跨境运营域的设计文档。跨模块设计在本目录，模块内设计就地存放在 `<app>/content/design/`。

## 1. 跨模块设计（`docs/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [crossborder-mvp-overview.md](crossborder-mvp-overview.md) | **生效** | 改造总览：模块边界、组织角色、实施顺序 |
| [crossborder-database-design.md](crossborder-database-design.md) | **生效** | 跨境运营域 Drizzle / PostgreSQL schema 设计 |
| [crossborder-api-mcp-design.md](crossborder-api-mcp-design.md) | **设计稿** | `apps/api` OpenAPI + MCP 资源与 tools（待实现） |
| [marketplace-connectors.md](marketplace-connectors.md) | **生效** | `packages/marketplace`：Daraz / Lazada / TikTok OAuth、签名与同步 worker |

## 2. 模块内设计

### `apps/shop` — 租户端（`apps/shop/content/design/`）

| 文档 | 状态 | 定位 |
| --- | --- | --- |
| [crossborder-shop-ued-product-design.md](../../apps/shop/content/design/crossborder-shop-ued-product-design.md) | **生效** | 租户端 IA、布局、逐页 UED 与迁移方案 |
| [cost-calculator-sl-landed-ued.md](../../apps/shop/content/design/cost-calculator-sl-landed-ued.md) | **生效** | 斯里兰卡到仓成本计算器（税项 / LCL·FCL / 建议售价） |
| [console-inbox-sheet.md](../../apps/shop/content/design/console-inbox-sheet.md) | Demo | 控制台站内信 Sheet 交互 |

### `apps/web` — 平台运营后台

当前无独立设计文档；租户/店铺审核、同步健康、待审抽检见总览中的模块边界。

## 3. 撰写约定

- 流程图用 mermaid，线框图保持原格式。
- 文档只描述跨境运营域，不再新增历史业务域内容。
- 代码里用 `@see <仓库根相对路径> §章节号` 指向设计文档。
