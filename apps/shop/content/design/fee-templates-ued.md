# 费用模板 UED（进口税 / 平台费）

| 项 | 内容 |
|----|------|
| 文档范围 | `apps/shop` 控制台 · 费用模板列表/详情 · 成本测算解析 |
| 版本 | **v1.1** |
| 日期 | 2026-11-03（Asia/Shanghai） |
| 实现 | localStorage UED（无 tRPC）；路由 `/console/fee-templates` |
| 关联 | [`cost-calculator-sl-landed-ued.md`](./cost-calculator-sl-landed-ued.md)、[`daraz-lk-erp-p0-ued.md`](./daraz-lk-erp-p0-ued.md)、[`../../../docs/design/erp-rectification-2026-11-03.md`](../../../../docs/design/erp-rectification-2026-11-03.md) §4（整改 C8/C9 规则） |

### 修订记录

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| v1.0 | 2026-10-31 | 初版：模板头+版本、两级履约、优先级解析、种子与工作台接线 |
| v1.1 | 2026-11-03 | 整改 Q30 补充：版本审核状态机与审核字段（C8）、历史订单取值快照锁定规则（C9） |

---

## 1. 审计结论（用户已确认）

| 编号 | 结论 |
|------|------|
| C1-C | 允许有效期区间重叠；必须人工「优先级」字段；解析取同维度下 **priority 最高**且在有效期内、已发布的版本 |
| C2-C | 履约两级 = **业务履约池** + **物流形态**（如 `daraz_lk_sea_lot` + FCL/LCL/AIR_DDP；`lazada_cn_spot_xmn` 等） |
| C3-C | 两套模板类型：`import_tax` 与 `platform_fee`；测算时可组合引用 |
| C4 | 新系统；保存柜次成本写入 `feeTemplateVersionId` + `components` 快照即可，不做复杂重算覆盖产品逻辑 |
| C5-A | Lazada 首期也做进口税叠（按国可配；种子占位税率标待复核） |
| C6-A | 语义表 `fee_templates` + `fee_template_versions`；原型用 localStorage；`packages/db` 可有 schema 草稿 |
| C7-A | 现 `TARIFF_PROFILES` LK 示例作初值，标「待报关行复核」 |
| C8-A | 优先费用模板；采购/库位/流水不改 |
| C9-A | 成本财务侧栏新增「费用模板」 |

---

## 2. 领域模型（原型）

### 2.1 模板头 `FeeTemplate`

`code` / `name` / `platform` / `country` / `fulfillmentPool` / `fulfillmentLogistics` / `type(import_tax|platform_fee)` / `status`

### 2.2 版本 `FeeTemplateVersion`

`versionNo` / `effectiveFrom` / `effectiveTo` / `priority` / `formulaProfile` / `components[]` / `status`（v1.1，替代纯 `published`）/ `submittedBy/At` / `reviewedBy/At` / `reviewNote`

### 2.2.1 版本审核状态机（v1.1 · 整改 Q30 / C8 已定）

```text
draft → in_review → published → disabled
  ↑         │
  └──驳回────┘（回 draft，保留驳回意见）
```

| 状态 | 含义 | 允许操作（RBAC `fee_template.*`） |
| --- | --- | --- |
| `draft` | 草稿，可编辑 | `create` / `update` |
| `in_review` | 已提交审核，**冻结编辑** | `approve`（通过/驳回；驳回必填 `reviewNote`） |
| `published` | 已发布，参与解析 | 只读；可转 `disabled` |
| `disabled` | 停用，不再参与解析 | 只读（历史引用不受影响） |

首期不接 `approval_instances` 通用审批（轻量状态机）；审核权 = `fee_template.approve`；首期允许自审（与采购 PUR 禁自审区分，业务可后续收紧）。

### 2.2.2 历史订单取值规则（v1.1 · C9 已定：快照锁定）

| 场景 | 规则 |
| --- | --- |
| 新测算 / 新柜次成本保存 | 按 asOf 解析命中版本，写入 `feeTemplateVersionId` + components **快照** |
| 模板改版 / 停用 / 新增高优先级版本 | **已保存的订单费用、柜次成本、利润快照一律不变、永不重算**；可回查当时模板编码与版本号 |
| 按新税率重估 | 只允许**新建**成本版本行（新 version_no），不覆盖旧行 |
| 历史订单 `order_fees` | 事实层已落行不重刷；来源 `api/import/manual` 不变 |

### 2.3 解析规则

维度：`platform + country + type`（+ 可选履约池/物流/formulaProfile/指定模板）。

候选：模板未停用、版本已发布、`asOf` 落在有效期；物流空=不限。

排序：`priority` 降序 → `versionNo` 降序，取首条。

### 2.4 与成本测算

`cost-calculator.ts` 按平台+国家+履约+asOf 解析 `import_tax`；失败回退 `TARIFF_PROFILES`（仅 fallback 文案）。`platform_fee` 命中则覆盖佣金/支付费百分比。保存柜次成本：`feeTemplateVersionId` + snapshot（含 components）。

---

## 3. UED

| 页面 | 说明 |
|------|------|
| `/console/fee-templates` | 列表：筛平台/国家/履约池/类型/状态；新建模板+草稿版本 |
| `/console/fee-templates/[id]` | 详情：版本时间线、优先级/有效期、组件编辑、发布 |
| 侧栏 | 成本财务组 ·「费用模板」 |
| 工作台 | `/console/costs` 计算器增加平台/国家/履约池；结果展示命中模板编码 |

---

## 4. 种子（v1）

| 模板 | 类型 | 说明 |
|------|------|------|
| `daraz_lk_import_apparel` | import_tax | 自 TARIFF apparel · 待复核 |
| `daraz_lk_import_electronics` | import_tax | 自 TARIFF electronics · 待复核 |
| `daraz_lk_import_home_sports` | import_tax | 自 TARIFF home_sports · 待复核 |
| `lazada_my_import_tax` | import_tax | MY 占位税率 · 待复核 |
| `daraz_lk_platform_fee` | platform_fee | 佣金 8% / 支付 2% 占位 |
| `lazada_my_platform_fee` | platform_fee | 佣金 6% / 支付 2.5% 占位 |

---

## 5. 代码指针

- Store：`apps/shop/src/lib/crossborder/fee-template-store.ts`
- 测算：`apps/shop/src/lib/crossborder/cost-calculator.ts`
- 柜次版本：`apps/shop/src/lib/crossborder/sku-cost-version-store.ts`
- Schema 草稿：`packages/db/src/commerce-schema.ts`（`fee_templates` / `fee_template_versions`）

---

## 6. 非目标（本 UED）

- 不接 tRPC / 不写生产库
- 不改采购、库位、库存流水原型
- 不做历史测算批量重算覆盖
