# 评论抓取与 HTML 报告设计（Daraz/Lazada 等跨境平台）

> 状态：设计稿  
> 适用范围：`packages/marketplace`（平台适配）、`apps/web`（平台运营后台）或 `apps/shop`（租户端）接入、报告生成工具链  
> 目标：优先使用平台 API 获取评论，辅助 AI 抓取（兜底），最终可生成 `docs/comments/` 下的 HTML 报告；设计需涵盖 HTML 报告内容结构。

## 1. 背景与现状

现有样例（`docs/design/comments/Daraz评价分析报告-3D打印机器人.html`）展示了最终报告形态：
- 商品信息（主图、标题、Item ID、店铺、价格、平台评价数/分、销量等）
- KPI（实抓评价数、样本平均分、正/中/负向、带图数）
- 评分分布（星级条形图 + 平台统计 vs 实抓）
- 关键发现（卖点/痛点/机会点、选品视角建议）
- 负向与中性（含高分差评标记、SKU、原文、中文翻译、备注、图片）
- 全部评价（按情感分组）

目前代码库中 `packages/marketplace` 已有 Lazop（Daraz/Lazada）连接器框架，但未发现评论（Review/Rating）相关接口定义。`packages/db` 暂无评论相关 schema。

## 2. 设计目标

- **API 优先**：优先接入平台官方 Review API（Lazop Open Platform `review` 相关接口；TikTok Shop 等后续扩展），有 API 则走 API。
- **AI 辅助兜底**：当 API 不可用/额度受限/字段缺失时，使用受控的 AI 抓取（HTML 抓取 + 解析 + 去重 + 情感分类），并保留抓取元数据（来源、抓取方式、时间、URL）。
- **统一领域模型**：抽象 `Review` 领域类型，适配多平台。
- **可追溯**：每条评论需记录 `platform`、`itemId`、`reviewId`（平台侧 ID，若无则生成稳定 hash）、`sku`、`rating`、`content`、`images`、`createdAt`、`buyer`（脱敏）、`source`（`api` | `ai_scrape`）。
- **报告生成**：从统一数据源生成静态 HTML（沿用现有样式结构，可直接输出到 `docs/comments/`），同时支持后续导出 JSON/CSV。
- **最小侵入**：复用 `MarketplaceConnector` 接口模式，不破坏现有依赖方向。

## 3. 架构设计

### 3.1 整体链路

```text
[平台 API] --(优先)--> MarketplaceConnector.listReviews() 
                            ↓（不可用/无数据时）  
                       AI 抓取（受控） 
                            ↓
                        规范化 -> DomainReview[]
                            ↓
                        去重（platform+itemId+reviewId/hash）
                            ↓
                        分析（评分分布、情感、关键词、图片）
                            ↓
                        HTML 模板渲染 -> docs/comments/<报告名>.html
```

### 3.2 模块划分

| 层级 | 路径 | 职责 |
|---|---|---|
| 领域类型 | `packages/marketplace/src/domain/review.ts`（新增） | `DomainReview`、`ReviewFilter`、`PagedReviewResult` 等统一类型 |
| 连接器接口 | `packages/marketplace/src/adapters/types.ts`（扩展） | 新增 `listReviews?(...)`、可选 `getReviewStats?` |
| Lazop 适配 | `packages/marketplace/src/adapters/lazop-base.ts`、`daraz.ts`、`lazada.ts` | 实现 API 路径（待确认 Open Platform 文档后填充）；失败时不强制实现 |
| 抓取工具 | `packages/marketplace/src/reviews/`（新增） | `api-fetcher.ts`、`ai-scraper.ts`（HTML 抽取、清洗、翻译提示）、`normalizer.ts`、`dedup.ts` |
| 分析与报告 | `packages/marketplace/src/reviews/analyze.ts`、`packages/marketplace/src/reports/html-generator.ts`（新增） | 统计、情感分类、生成 HTML（沿用现有样式） |
| CLI/任务入口（可选） | `packages/marketplace/src/cli/reviews.ts` 或 `apps/web` tRPC 路由（后续） | 统一入口：`pnpm marketplace:reviews --platform daraz --item-id ...` |

> 注：AI 抓取需遵循平台 ToS；仅在必要且合规的场景下使用，且需在报告中标注 `source: ai_scrape`。

### 3.3 领域类型（草案）

```typescript
// packages/marketplace/src/domain/review.ts
export type ReviewSource = "api" | "ai_scrape"

export interface DomainReviewImage {
  url: string
  raw?: Record<string, unknown>
}

export interface DomainReview {
  reviewId: string           // 平台 reviewId 或稳定 hash
  platform: MarketplacePlatform
  itemId: string             // 外部商品 ID（item_id）
  sku?: string               // SKU 描述（如样例中的 Color/Size）
  rating: number             // 1-5
  title?: string
  content?: string           // 原文
  contentZh?: string         // 中文（可选，由分析/AI 生成）
  buyerName?: string         // 脱敏展示用
  createdAt?: string | Date
  purchasedAt?: string | Date
  images?: DomainReviewImage[]
  tags?: string[]            // 如 "高分差评"
  sentiment?: "pos" | "neu" | "neg" | "void"
  source: ReviewSource
  raw?: Record<string, unknown>
}

export interface ReviewFilter {
  itemId: string
  pageSize?: number
  rating?: number[]          // 按星级过滤
  hasImage?: boolean
  cursor?: string | null
}

export interface PagedReviewResult {
  items: DomainReview[]
  total?: number
  nextCursor?: string | null
  stats?: ReviewStats
  raw?: Record<string, unknown>
}

export interface ReviewStats {
  total: number
  avg: number
  byRating: Record<1|2|3|4|5, number>
}
```

### 3.4 连接器接口扩展

```typescript
// packages/marketplace/src/adapters/types.ts（扩展）
import type { DomainReview, PagedReviewResult, ReviewFilter, ReviewStats } from "../domain/review"

export interface MarketplaceConnector {
  // ...existing...
  listReviews?(filter: ReviewFilter): Promise<PagedReviewResult>
  getReviewStats?(itemId: string): Promise<ReviewStats>
}
```

LazopBase 先预留方法（返回 `not implemented` 或抛出明确错误），由子类按平台文档实现。

## 4. API 获取（优先）

### 4.1 Lazop（Daraz/Lazada）调研要点
常用接口（需以实际开放平台文档为准）：
- `Get Item Review List` / `Item.GetReviewList`（路径视 family/region 而定）
- 参数：`item_id`、`page`/`offset`、`limit`、`rating` 等
- 响应需映射：`review_id`、`rating`、`review_content`、`reviewer_name`、`review_time`、`sku_info`、`images`、`order_info` 等

实现思路：
1. 在 `lazop-base.ts` 增加 `listReviews`，构造参数并调用 `this.http.call`
2. 按 `domain/review.ts` 映射，统一 `reviewId`、`sku`（拼接 `Color/Size` 等）、`images` URL
3. `total`、星级分布优先用 API 返回值，否则用统计计算

### 4.2 其他平台
- TikTok Shop：后续扩展 `tiktok.ts`
- 其他平台：按适配器模式新增

## 5. AI 辅助抓取（兜底）

### 5.1 触发条件
- 连接器未实现 `listReviews` 或返回空
- API 调用失败（权限/接口变更）
- 需补充 API 未返回的字段（如部分详情页评价）
- 用户显式指定 `--mode=ai` 强制抓取

### 5.2 抓取策略（受控）
- **目标页**：商品详情页评价 Tab（Daraz 常见：`/products/...-i{itemId}-...`，评价通过接口加载但也可解析 DOM）
- **方式**：优先用 `webfetch`（Markdown/HTML）获取页面，结合 `grep`/解析提取评价块；必要时用无头浏览器（后续评估，不纳入本次最小实现范围）
- **清洗**：去除 HTML 标签、规范化空格、处理多语言（僧伽罗语/英语等）
- **去重**：主键 `(platform,itemId,reviewId)`，若无 `reviewId` 则用 `hash(platform+itemId+buyer+content+createdAt)`
- **脱敏**：买家名仅展示首尾或掩码（如 `******008`、`0***5`）
- **标注**：所有 AI 抓取结果 `source = 'ai_scrape'`，在报告中标注抓取方式

### 5.3 抽取要点（基于样例）
需识别：
- 星级（`★` 或数值）
- 时间（如 `25 May 2026`）
- 买家名
- SKU（`SKU：Color:... Size:...`）
- 原文 + 中文（如有）
- 图片
- 点赞数（如 `👍0`）
- "高分差评" 特征（高星级但负面内容）

### 5.4 安全与合规
- 不绕过登录/验证码
- 尊重 `robots.txt` 和频率限制
- 只抓取公开可见的评价
- 在元数据中记录抓取依据

## 6. 分析与情感分类

### 6.1 评分统计
- 实抓数、样本平均分、平台总数/均分（如可获取）
- 星级分布表（平台统计 vs 实抓）

### 6.2 情感分类（规则优先，AI 辅助）
规则优先：
- 明确负面关键词（`poor`, `bad`, `broken`, `missing`, `waste`, `don't buy` 等中英僧伽罗常用词）
- 高分差评：`rating >= 4` 且负面倾向 → 标记 `tag: "高分差评"`，归为 `neg`（或 `neu` 需谨慎）
- 中性：建议性、既有优点也有缺点
- 正向：纯好评
- `void`：纯星级无内容等

AI 辅助（可选）：调用 LLM 做分类、翻译（僧伽罗语->中文）、摘要要点，需可配置开关。

### 6.3 关键发现自动生成
基于频次提取：
- Top 卖点（如 `发光/夜光`、`价格值`）
- Top 痛点（如 `塑料质感`、`关节松紧`、`尺寸虚标`、`缺件/断件`、`色差/发光不稳定`）
- 机会点（改装需求等）
- 建议（详情页标注、包装优化、材质选型等）

## 7. HTML 报告设计（涵盖内容）

沿用现有样式，需包含以下区块：

| 区块 | 必要性 | 说明 |
|---|---|---|
| 标题与元信息 | 必需 | 标题、商品名、Item ID、抓取日期、来源（API/AI 混合） |
| 商品卡片 | 必需 | 主图、标题、店铺、价格、链接、平台统计 |
| KPI 卡片 | 必需 | 实抓、平均分、正/中/负、带图数 |
| 数据说明注记 | 必需 | 平台显示 vs 实抓差额说明、高分差评说明、真实负面率估算（如样例逻辑） |
| 评分分布表 | 必需 | 星级、占比条、平台条数/占比、实抓条数 |
| 关键发现 | 必需 | 卖点/痛点/机会点/品类判断（可自动生成+人工补充） |
| 负向与中性 | 必需 | 差评重点，含高分差评标记、SKU、原文、中文、备注、图片 |
| 全部评价 | 必需 | 全量列表，按情感分组或混排，保留全部字段 |
| 抓取元数据（可选） | 建议 | 抓取方式、工具、时间、去重数等（不影响阅读，放底部 note） |

HTML 生成需：
- 内联 CSS（沿用样例，便于单文件分享）
- 图片使用原始 URL（懒加载）
- 链接新窗口打开
- 中文为主，保留原文

## 8. 实现方案

### 8.1 新增文件清单

```text
packages/marketplace/src/domain/review.ts          # 领域类型
packages/marketplace/src/adapters/types.ts         # 扩展接口（listReviews/getReviewStats）
packages/marketplace/src/adapters/lazop-base.ts    # 预留/实现 API 抓取
packages/marketplace/src/reviews/api-fetcher.ts    # API 抓取逻辑
packages/marketplace/src/reviews/ai-scraper.ts     # AI 辅助抓取
packages/marketplace/src/reviews/normalizer.ts     # 规范化
packages/marketplace/src/reviews/dedup.ts          # 去重
packages/marketplace/src/reviews/analyze.ts        # 分析（统计/情感/关键词）
packages/marketplace/src/reviews/index.ts          # 导出
packages/marketplace/src/reports/html-generator.ts # HTML 报告生成
packages/marketplace/src/reports/templates/        # 模板（可选）
```

### 8.2 数据库（可选但推荐）
如需持久化，扩展 `packages/db/src/commerce-schema.ts`：

```typescript
export const productReviews = pgTable("product_reviews", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id),
  platform: varchar("platform", { length: 32 }).notNull(),
  shopExternalId: text("shop_external_id"),
  itemId: text("item_id").notNull(),
  reviewId: text("review_id").notNull(),
  sku: text("sku"),
  rating: integer("rating").notNull(),
  content: text("content"),
  contentZh: text("content_zh"),
  buyerName: text("buyer_name"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }),
  images: jsonb("images").$type<Array<{url:string}>>(),
  sentiment: varchar("sentiment", { length: 16 }),
  source: varchar("source", { length: 16 }).notNull(), // api|ai_scrape
  raw: jsonb("raw"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("uq_product_reviews").on(t.platform, t.itemId, t.reviewId),
  idxItem: index("idx_product_reviews_item").on(t.platform, t.itemId),
}))
```

遵循现有约定：时间戳用 `withTimezone: true`，金额用 `numeric`（本场景不涉及）、主键用 `text`、JSON 用 `jsonb`。

### 8.3 入口设计

**A. 包级 CLI（推荐先做）**
```bash
# API 优先，失败则 AI 抓取
pnpm --filter @workspace/marketplace reviews:fetch \
  --platform daraz --item-id 593629355 --region lk

# 强制 AI 抓取
pnpm --filter @workspace/marketplace reviews:fetch --platform daraz --item-id ... --mode ai

# 生成报告（从已抓取数据）
pnpm --filter @workspace/marketplace reviews:report \
  --input ./reviews.json --out ./docs/comments/Daraz-xxx.html
```

**B. tRPC（平台运营后台 `apps/web`）**
在 `apps/web/src/lib/server/routers/` 新增 `reviews.ts`：
- `reviews.fetch`（需权限：平台运营或租户且有店铺绑定）
- `reviews.list`（分页）
- `reviews.generateReport`（生成 HTML 并返回内容或保存）

**C. API（`apps/api`）**
后续按 `crossborder-api-mcp-design.md` 接入 OpenAPI。

### 8.4 HTML 生成实现要点
- 复用现有 CSS（可提取为模板字符串）
- `analyze.ts` 输出结构：`kpis`、`ratingDist`（platform vs actual）、`insights`（卖点/痛点/机会点）、`groups`（neg/neu/pos/void）
- 翻译：若 `contentZh` 缺失且启用 AI，批量翻译（僧伽罗语->中文）
- 高分差评判断：`rating >= 4 && sentiment === 'neg'` → 添加 `tag.warn`
- 图片：渲染缩略图，链接原图

## 9. 测试与验证

- 单元测试：`normalizer`、`dedup`、`analyze`（情感分类规则）
- 集成测试：mock API 响应，验证映射
- 手动验证：用样例数据 `docs/design/comments/Daraz评价分析报告-3D打印机器人.html` 对比生成结果（结构一致性）
- Lint/Typecheck：`pnpm --filter @workspace/marketplace lint && typecheck`

## 10. 风险与注意事项

| 风险 | 缓解 |
|---|---|
| Lazop Review API 路径/权限未知 | 先实现接口框架 + 日志，按实际文档补充；API 失败自动降级到 AI 抓取 |
| 平台 ToS 限制爬虫 | 优先 API；AI 抓取仅公开页面，低频，标注来源 |
| 僧伽罗语翻译质量 | 规则+AI 混合，可保留原文优先展示 |
| 图片防盗链 | 使用原始 URL，报告为静态文件本地查看无跨站限制问题 |
| 高频调用导致限流 | 分页、延时、缓存（Redis） |

## 11. 实施顺序（MVP）

1. **类型定义**：新增 `domain/review.ts`，扩展 `adapters/types.ts`
2. **API 框架**：在 `lazop-base.ts` 预留 `listReviews`（可先返回 `not implemented`）
3. **规范化/去重/分析**：`reviews/normalizer.ts`、`dedup.ts`、`analyze.ts`
4. **HTML 生成器**：基于样例提取模板，生成 HTML
5. **AI 抓取（兜底）**：`ai-scraper.ts`（HTML 解析）+ 降级逻辑
6. **入口**：CLI 脚本（最简单）或 tRPC 路由
7. **文档与验证**：更新本设计文档引用，生成首个测试报告到 `docs/comments/`

## 12. 参考

- 样例报告：`docs/design/comments/Daraz评价分析报告-3D打印机器人.html`
- Marketplace 适配器模式：`packages/marketplace/src/adapters/lazop-base.ts`
- 设计索引：`docs/design/INDEX.md`
- AGENTS 约定：`AGENTS.md`（模块边界、tRPC/dataaccess、分页等）
