> # ⛔ 已归档 — 请勿作为设计依据
>
> **归档日期**：2026-09-26　**原路径**：`IMPLEMENTATION_SUMMARY.md`（仓库根目录）
> **归档原因**：PR #1 的实施清单快照，非设计文档。迁移号 `0012_serious_tyrannus.sql` 与后续手写迁移 `0015/0016/0017` 已产生冲突（见主设计文档 P1-22）。
>
> **已知过期点**：
> - 「`merchant_sales_price` 表（销售价，Q15=B）」已建成，但**全仓无计费消费者**，销售价从未参与计费。
> - 「API 骨架完成」但 `/api/v1/tasks` 的 `merchantId` 仍由入参传入、鉴权为 TODO。
> - 「5 个 routers 已添加」后 merchant 侧持续平铺 `*-data.ts`，与 Q12=A 的分层收口未完成。
>
> **当前有效设计文档**：`apps/merchant/content/design/merchant-module-review-and-design.md`
> **决策依据**：`docs/business/merchant-product-plan.md`

# 商户算力分销平台端实施总结

## 已完成 ✅

### 1. 数据库 Schema (packages/db)

- ✅ `merchant` 表添加 `promo_enabled` / `oem_enabled` feature flags (Q11=B)
- ✅ `merchant_sales_price` 表（销售价，Q15=B）
- ✅ `merchant_branding` 表（品牌配置，Q10/Q17）
- ✅ `merchant_promo_link` 表（推广链接）
- ✅ `merchant_promo_attribution` 表（推广归因，Q3=A）
- ✅ 迁移 `0012_serious_tyrannus.sql` 已生成

### 2. apps/merchant tRPC Routers (Q12=A)

- ✅ `promoRouter` — 推广链接 CRUD 与统计
- ✅ `pricingRouter` — 定价查询（进货价/销售价）
- ✅ `tenantsRouter` — 租户列表
- ✅ `billingRouter` — 账单查询
- ✅ `rechargeRouter` — 充值记录查询
- ✅ `promo-data.ts` — 推广链接数据访问层

### 3. apps/api OpenAPI (Q7=A / Q16=A)

- ✅ `/api/v1/tasks` 路由（骨架实现）
  - POST `/tasks` — 创建任务
  - GET `/tasks` — 查询任务列表
  - GET `/tasks/{id}` — 获取任务详情
  - PATCH `/tasks/{id}` — 更新任务
  - GET `/tasks/{id}/status` — 监控任务状态

### 4. 文档

- ✅ `docs/business/merchant-product-plan.md` v0.3（Q1-Q18 锁定决策）
- ✅ `docs/business/oem-brand-site-contract.md`（品牌站集成规范）

### 5. PR 创建

- ✅ PR #1: https://github.com/gpurun/cloud/pull/1
- ✅ 分支: `cursor/merchant-distribution-platform-ab98`
- ✅ Base: `develop-gpus`

## 验证状态 ✅

### Lint

- ✅ `@workspace/db` lint 通过（仅预存警告）
- ✅ `apps/api` lint 通过（仅预存警告 + TODO 骨架）
- ⚠️ `apps/merchant` 有 eslint 配置问题（预存问题，见 AGENTS.md）

### 编译

- Schema 变更已在 TypeScript 中正确导出
- 新增 routers 与现有架构一致

## 未完成部分（后续 PR）

### 高优先级

1. **apps/gpus 推广归因** (Q2=A / Q3=A)
   - 注册页接受 `?r={promoCode}` 查询参数
   - 归因写入 `merchant_promo_attribution` 表
   - 设置 `tenant.merchant_id` = 推广商户

2. **apps/api 任务完整实现** (Q7=A / Q16=A)
   - 商户/租户权限校验
   - 任务数据库持久化
   - 与计算后端（SkyPilot）集成

3. **进货价同步服务** (Q15=B)
   - 平台定时推送进货价到品牌站
   - 品牌站 `/api/sync/purchase-prices` 接口

### 中优先级

4. **白牌控制台域名路由** (Q17=A)
   - `apps/merchant` middleware 按域名解析商户
   - 主题配置动态加载

5. **Feature Flags CRM UI** (Q11=B)
   - `apps/web` 商户管理页添加推广/OEM 开关

### 低优先级

6. **品牌站 Fork Repository** (Q6'=B)
   - 创建独立仓库 fork `apps/gpus`
   - 按 `oem-brand-site-contract.md` 改造 tRPC
   - 品牌站 DB Schema 初始化

## 设计决策对齐

| 决策 | 状态 | 说明 |
|------|------|------|
| Q1=C 同迭代竖切 | ✅ | 平台侧基础设施完成 |
| Q2=A 落地仅官方 gpus | 🚧 | Schema 就绪，前端集成待后续 |
| Q3=A tenant.merchant_id | ✅ | Attribution 表设计支持 |
| Q4=B 进销价差结算 | ✅ | Schema 支持 purchase_price 快照 |
| Q5=C 默认刊例价 | ✅ | 文档已明确 |
| Q6'=B 独立仓 fork | ✅ | 合约文档完整 |
| Q7=A 仅任务走 api | ✅ | API 骨架完成 |
| Q8=A gpus 暂不迁 | ✅ | 保持现状 |
| Q9=A CNAME | ✅ | Branding 表支持 custom_domain |
| Q10=B 自有通道 | ✅ | Branding 表支持 channel config |
| Q11=B Feature flags | ✅ | merchant 表添加字段 |
| Q12=A tRPC 全收口 | ✅ | 5 个 routers 已添加 |
| Q13=B 品牌站库自洽 | ✅ | 合约文档明确边界 |
| Q14=A 平台身份 | ✅ | 合约文档明确鉴权 |
| Q15=B 销售价品牌站库 | ✅ | Schema + 合约文档 |
| Q16=A 任务走 api | ✅ | API 骨架完成 |
| Q17=A 一套多租户 | ✅ | 合约文档明确部署模式 |
| Q18=B 客户自托管 | ✅ | 合约文档明确责任边界 |

## 后续步骤

1. **Review PR #1** — 审查平台侧基础设施
2. **合并后** — 启动高优先级后续 PR
3. **品牌站 fork** — 按合约文档创建独立仓库
4. **试点部署** — 选择 OEM 客户进行首次部署验证

## 相关链接

- PR: https://github.com/gpurun/cloud/pull/1
- 产品方案: `docs/business/merchant-product-plan.md`
- 集成合约: `docs/business/oem-brand-site-contract.md`
- Schema: `packages/db/src/merchant-schema.ts`
- Migration: `packages/db/drizzle/0012_serious_tyrannus.sql`
