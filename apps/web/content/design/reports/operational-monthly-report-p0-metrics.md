# 平台运营月报 — P0 指标清单（首期）

> 从 [operational-monthly-report-metrics.md](operational-monthly-report-metrics.md) 提炼。  
> **统计周期**：自然月（YYYY-MM），与 `billing_period.period_code` / `usage_month` 对齐。  
> **版本**：v1.1 · **首期聚焦当月经营结果**，资源 KPI 等延后至 P1+。

---

## 1. 首期聚焦（四大主题）

首期月报 **只回答当月四个问题**，其余指标见 [§8 延后指标](#8-延后指标非首期)。

| # | 主题 | 核心输出 | 章节 |
|---|------|----------|------|
| **T1** | B 端客户漏斗 | 当月新增注册、测试通过、转正 **数量** | [§2](#2-t1-b-端客户漏斗当月) |
| **T2** | B 端新客 / 老客经营 | 按项目标签拆分：**充值、消耗、毛利** | [§3](#3-t2-b-端新客--老客经营) |
| **T3** | 平台整体经营 | 全平台 **充值、消耗、毛利** | [§4](#4-t3-平台整体经营) |
| **T4** | 产品线 × 客群 | 按产品线消耗，区分 **新客 / 老客** | [§5](#5-t4-产品线消耗新客--老客) |

### 1.1 一页摘要布局（建议）

```
┌─────────────────────────────────────────────────────────┐
│  T3 平台：充值 | 消耗 | 毛利 | 毛利率 | 账期状态          │
├─────────────────────────────────────────────────────────┤
│  T1 漏斗：新增注册 → 测试通过 → 转正（含 MoM）            │
├──────────────────────────┬──────────────────────────────┤
│  T2 新客 vs 老客          │  T4 产品线 × 新客/老客        │
│  充值 | 消耗 | 毛利       │  弹性算力 / 裸金属 …         │
└──────────────────────────┴──────────────────────────────┘
```

### 1.2 数据真值层级

| 层级 | 说明 | 首期涉及表 |
|------|------|------------|
| **财务月结（权威）** | 账期 `published` 后的消耗/成本/毛利 | `billing_period`、`platform_income_monthly`、`platform_cost_monthly`、`billing_period_cost_source_line` |
| **CRM 过程（漏斗）** | 注册、测试、转正事件 | `customer`、`project`、`project_conversion_setting`、`conversion_record` |
| **充值（过程）** | 实收充值流水 | `recharge` |
| **平台同步（预览）** | 账期未发布前的消耗预览 | `consumption_usage_daily` |

> **口径原则**：**消耗、毛利以已发布账期为准**；充值以 `recharge.status=paid` 为准；账期未 `published` 时整报标注「预览版」，同步层仅作参考。

### 1.3 新客 / 老客划分（T2、T4 共用）

依据项目标签（`project_tag` / `project_tag_assignment`，种子名见 `project-tags.ts`）：

| 客群 | 判定规则 | 典型标签 |
|------|----------|----------|
| **老客** | 项目至少有一个标签为 `平台老客` 或者 `中台直客` | `平台老客` |
| **新客** | 项目有 `销售新客`，且 **不含** `平台老客` 和 `中台直客` | `销售新客` |
| **未分类** | 以上均不满足（无标签或仅其他标签） | `公海池-无人跟踪`、`产品直客` 等 |

**冲突优先级**：同时存在 `平台老客` 与其他标签 → **归老客**。

**归因路径**（消耗 / 毛利）：

1. 优先 `platform_income_monthly.project_id` → `project` → 标签；
2. 项目为空时，用 `billing_period_tenant_project_enrichment` 账期补全结果；
3. 仍无法归因 → 计入 **未分类**，单独一行，不并入新客或老客。

**充值归因**：`recharge.project_id` 非空则直挂项目；否则 `recharge.tenant_id` → `project_tenant` / `project.primary_tenant_id` → 项目 → 标签。

**B 端范围**：`customer.type = 'B'`；排除 `tenant.type = internal` 且在 `internal_effective_from/to` 账期交集内的内部租户。

---

## 2. T1 — B 端客户漏斗（当月）

> 统计 **当月发生** 的事件数量；建议附 **MoM 环比** 与漏斗转化率。

| # | 指标 | 定义 | 数据源 | 过滤条件 |
|---|------|------|--------|----------|
| F1 | **B 端新增注册数** | 当月新建 B 端客户主体 | `customer` | `type='B'`，`date_trunc('month', created_at)` = 当月 |
| F2 | **B 端测试通过数** | 当月完成试用/测试的客户 | `customer` | `type='B'`，`test_completed_on` 落在当月自然日 |
| F3 | **B 端转正数（客户）** | 当月正式转正的客户 | `customer` | `type='B'`，`conversion_date` 落在当月 |
| F4 | **B 端转正数（项目）** | 当月设置激励开始的项目 | `project_conversion_setting` ⋈ `project` ⋈ `customer` | `customer.type='B'`，`conversion_date` 落在当月 |
| F5 | **测试中 → 转正项目数** | 当月从测试阶段完成转正的项目 | `project` ⋈ `project_conversion_setting` | `stage='converted'`，`conversion_date` 在当月，且转正前曾处于 `testing`（有 `test_completed_on` 或历史 stage） |

### 2.1 辅助指标（可选，首期建议展示）

| 指标 | 定义 | 数据源 |
|------|------|--------|
| 漏斗转化率：注册→测试 | F2 / F1 | 派生 |
| 漏斗转化率：测试→转正 | F3 / F2 | 派生 |
| 当月新增项目数 | B 端客户下新建项目 | `project` ⋈ `customer`，`project.created_at` 在当月 |
| 当月进入测试阶段项目数 | 项目 stage 为 testing 且测试开始日在当月 | `project.test_started_on` 或 `customer.test_started_on` 在当月 |

### 2.2 口径说明

- **新增注册**：以 CRM `customer.created_at` 为准（企业建档），非平台 `identity_verified_at`；若需「平台实名注册数」，另计 `identity_verified_at` 在当月的 B 端客户。
- **测试通过**：以 `customer.test_completed_on` 为准；导入/手工维护字段，需保证销售及时回填。
- **转正**：客户级以 `customer.conversion_date`；项目级以 `project_conversion_setting.conversion_date`（经营激励开始）。两者可能不同月，月报 **主看 F3/F4**，并注明差异客户清单。
- **去重**：F1～F4 均按 **客户 ID** 或 **项目 ID** 去重计数，非事件条数。

---

## 3. T2 — B 端新客 / 老客经营

> 当月 **B 端** 按 [§1.3 客群划分](#13-新客--老客划分t2t4-共用) 汇总；行维度：**新客 | 老客 | 未分类 | 合计**。

| # | 指标 | 定义 | 主数据源 | 聚合键 |
|---|------|------|----------|--------|
| B1 | **充值额** | 当月实收充值 | `recharge` | 客群（经项目归因） |
| B2 | **消耗额** | 当月总消费（含补充消费） | `platform_income_monthly` | 客群（经 `project_id`） |
| B3 | **毛利额** | 当月毛利 | 见 [§3.1](#31-毛利计算口径) | 客群 |
| B4 | **毛利率** | 毛利 / 消耗 | 派生（B3 / B2） | 客群 |
| B5 | **充值客户数** | 当月有充值的去重客户 | `recharge` ⋈ `customer` | 客群 |
| B6 | **消耗客户数** | 当月 `total_consumption > 0` 的去重客户 | `platform_income_monthly` | 客群 |
| B7 | **客均消耗** | B2 / B6 | 派生 | 客群 |
| B8 | **客均毛利** | B3 / B6 | 派生 | 客群 |

### 3.1 毛利计算口径

| 优先级 | 路径 | 说明 |
|--------|------|------|
| **1（权威）** | `billing_period.total_gross_profit` + 项目分摊 | 账期已 `published`；**总毛利取 `billing_period.total_gross_profit`，分项目/分客毛利取 `project_monthly_cost_snapshot`**（`dataaccess/finance/monthly-report.ts:308`） |
| **2（快照）** | `project_monthly_cost_snapshot.gross_profit` | 财务人工确认后的项目快照；按 `settlement_month` + `project_id` 汇总 |
| **3（预览）** | 消耗 − 估算成本 | 账期未发布时仅展示消耗，毛利标注「待月结」 |

> **已订正（2026-10-06）**：路径 1 原描述「自 `platform_cost_monthly(type=record)` + `billing_period_cost_source_line` 汇总项目毛利」**已过期** —— 代码实际取 `billing_period.total_gross_profit`（总）+ `project_monthly_cost_snapshot`（分项目/分客）；`platform_cost_monthly` 仅在成本卡时侧参与（`monthly-report.ts:48`）。裁决见 [矛盾台账](../../../../../docs/design/audit/doc-contradictions.md) §4.1 第 5 条。

**首期建议**：正式版用 **路径 1**；按客群汇总时，将各项目毛利叠加后除以客群消耗得 B4。

### 3.2 充值明细口径

| 字段 | 规则 |
|------|------|
| 状态 | `recharge.status = 'paid'` |
| 时间 | `coalesce(completed_at, created_at)` 落在当月 |
| 金额 | `amount - refund_amount`（净充值） |
| 范围 | 租户归属 B 端客户，排除内部租户（见 §1.3） |

### 3.3 消耗明细口径

| 字段 | 规则 |
|------|------|
| 账期 | `billing_period.period_code = YYYY-MM` 且 `status = published` |
| 金额 | `platform_income_monthly.total_consumption`（= 余额 + 裸金属 + 补充） |
| 范围 | `customer_type = 'B'` 或关联 `customer.type = 'B'` |
| 预览 | 账期未发布时，用 `consumption_usage_daily` 按 `usage_month` 汇总，标注「同步口径」 |

### 3.4 输出表示例

| 客群 | 充值 (B1) | 消耗 (B2) | 毛利 (B3) | 毛利率 (B4) | 消耗客户数 (B6) |
|------|-----------|-----------|-----------|-------------|-----------------|
| 新客（中台直客/销售新客） | | | | | |
| 老客（平台老客） | | | | | |
| 未分类 | | | | | |
| **B 端合计** | | | | | |

---

## 4. T3 — 平台整体经营

> 全平台（B + C、企业 + 个人）当月汇总；与 T2 的关系：T3 ⊇ T2，且含 C 端 / 无项目租户。

| # | 指标 | 定义 | 主数据源 | 字段 / 规则 |
|---|------|------|----------|-------------|
| P1 | **平台充值额** | 当月全平台实收充值 | `recharge` | `status='paid'`，净额，时间见 §3.2 |
| P2 | **平台消耗额** | 当月全平台总消费 | `billing_period` | `income_total`（= 企业 + 个人） |
| P3 | **平台成本额** | 当月全平台总成本 | `billing_period` | `total_cost` |
| P4 | **平台毛利额** | 当月全平台毛利 | `billing_period` | `total_gross_profit` |
| P5 | **平台毛利率** | 毛利 / 消耗 | 派生 | P4 / P2 |
| P6 | **企业消耗** | B 端项目绑定租户消费 | `billing_period` | `enterprise_income` |
| P7 | **个人消耗** | 非项目 + 黑名单等 | `billing_period` | `personal_income` |
| P8 | **弹性算力消耗** | 余额类消费 | `billing_period` | `balance_income` |
| P9 | **裸金属消耗** | 裸金属消费 | `billing_period` | `baremetal_income` |
| P10 | **账期发布状态** | 月结是否关账 | `billing_period` | `status`；`published_at` |
| P11 | **充值客户数** | 当月有充值的去重租户 | `recharge` | DISTINCT `tenant_id` |
| P12 | **消耗租户数** | 当月有消费的外部租户 | `platform_income_monthly` | `total_consumption > 0` |

### 4.1 结构拆解（首期建议副表）

| 维度 | 指标 | 数据源 |
|------|------|--------|
| 企业 vs 个人 | P6 / P7 占比 | `billing_period` |
| 弹性 vs 裸金属 | P8 / P9 占比 | `billing_period` |
| B vs C | 按 `platform_income_monthly.customer_type` 汇总消耗 | `platform_income_monthly` |

### 4.2 交叉验证

- `consumption_usage_daily` 当月 `sum(amount)` ≈ P2（允许同步延迟差异，脚注说明）。
- T2「B 端合计」消耗 + C 端 / 未归因消耗 ≈ P2。

---

## 5. T4 — 产品线 × 新客 / 老客

> 矩阵：**行 = 产品线**，**列 = 新客 | 老客 | 未分类 | 合计**；指标以 **消耗额** 为主（首期），可选附卡时。

### 5.1 产品线维度

| 产品线 | 来源字段 | 说明 |
|--------|----------|------|
| 弹性算力 | `consumption_usage_daily.product_line` / 账期 `balance_income` | 余额消费、按量计费 |
| 裸金属 | `consumption_usage_daily.product_line` / 账期 `baremetal_income` | 整租 / 裸金属订单 |
| 其他 | `product_line` 非空且非上述 | 按实际同步值展示，不强行合并 |

账期权威口径下，可按 `platform_income_monthly` 拆分：

- 弹性：`balance_consumption + supplementary_consumption`（补充消费默认归弹性，除非明细指定产品线）
- 裸金属：`bare_metal_consumption`

同步预览口径：直接 `group by product_line` on `consumption_usage_daily` where `usage_month = YYYY-MM`。

### 5.2 指标表

| # | 指标 | 定义 | 主数据源 | 聚合 |
|---|------|------|----------|------|
| L1 | **产品线消耗额** | 当月按产品线汇总消费 | `consumption_usage_daily` 或 `platform_income_monthly` 拆分 | `product_line` × 客群 |
| L2 | **产品线余额消耗** | 实付部分 | `consumption_usage_daily.balance_amount` | 同上 |
| L3 | **产品线券消耗** | 算力券部分 | `consumption_usage_daily.voucher_amount` | 同上 |
| L4 | **产品线卡时** | 算力用量 | `consumption_usage_daily.total_card_hours` | 同上 |
| L5 | **产品线消耗占比** | 该产品线 / 平台总消耗 | 派生 | 产品线内或全表 |

### 5.3 客群归因（同 T2）

1. `consumption_usage_daily.tenant_id` → 项目（`platform_income_monthly` / `billing_period_tenant_project_enrichment` / `project_tenant`）→ [§1.3 标签规则](#13-新客--老客划分t2t4-共用)；
2. 仅 B 端客户参与新客/老客拆分；C 端消耗单独列 **「C 端 / 个人」** 行，或不纳入 T4 矩阵（首期建议 **T4 仅 B 端**，C 端在 T3 体现）。

### 5.4 输出表示例

**当月 B 端 · 按产品线 × 客群消耗（元）**

| 产品线 | 新客 | 老客 | 未分类 | 合计 |
|--------|------|------|--------|------|
| 弹性算力 | | | | |
| 裸金属 | | | | |
| 其他 | | | | |
| **合计** | | | | |

可选附表：各单元格 `total_card_hours`（L4）。

---

## 6. 首期指标总览

| 主题 | 指标编号 | 数量 | 首期必出 |
|------|----------|------|----------|
| T1 漏斗 | F1～F5 | 5 (+4 辅助) | ✅ |
| T2 新客/老客 | B1～B8 | 8 | ✅ |
| T3 平台整体 | P1～P12 | 12 | ✅ |
| T4 产品线×客群 | L1～L5 | 5 | ✅ |
| **合计** | | **30** | |

---

## 7. 首期交付检查清单

- [ ] 统计月 `billing_period.period_code` 已存在
- [ ] 正式版：`billing_period.status = published`；否则全文标注「预览版」
- [ ] T1：F1～F4 去重逻辑与 CRM 手工数据一致（抽检 5 条）
- [ ] T2：新客/老客标签归因覆盖率 > 90%；未分类清单附附录
- [ ] T3：P2 = P6 + P7；P4 = P2 − P3（含税规则以财务为准）
- [ ] T4：产品线合计 = T2 B 端消耗（口径一致）
- [ ] 充值统一用 `paid` + 净额；时间字段一致
- [ ] 所有金额指标附 MoM 环比（除漏斗绝对数外）
- [ ] 内部租户已按 §1.3 排除

---

## 8. 延后指标（非首期）

以下自原 P0 全量清单 **延后**，不在首期月报正文出现：

| 类别 | 原指标 | 分期 |
|------|--------|------|
| 供应资源 KPI | GPU 总量、在线设备、待接入、异常设备（原 §6.1） | P1 |
| 充值现金流细节 | 低余额、逾期、充值消费比（原 §3.3） | P1 |
| CRM 深度经营 | 跟进任务、合同、Top N 排名（原 §4） | P1 |
| 机房×卡型 | 明细消耗与成本（原 §5.2） | P1 |
| 风险与同步健康 | 黑名单、同步失败、对账差异（原 §9） | P2 |
| 完整 Executive Summary | 原 E7～E15 中未纳入 T1～T4 的部分 | 随分期补全 |

完整指标树见 [operational-monthly-report-metrics.md](operational-monthly-report-metrics.md)。

---

## 9. 核心表速查

| 域 | 表 | 用途 |
|----|-----|------|
| 漏斗 | `customer`、`project`、`project_conversion_setting`、`conversion_record` | T1 |
| 标签 | `project_tag`、`project_tag_assignment` | T2、T4 客群 |
| 充值 | `recharge` | T2 B1、T3 P1 |
| 账期汇总 | `billing_period` | T3 P2～P5、P8～P10 |
| 收入明细 | `platform_income_monthly` | T2 B2、T3 结构拆解 |
| 成本毛利 | `platform_cost_monthly`、`billing_period_cost_source_line`、`project_monthly_cost_snapshot` | T2 B3 |
| 项目归因 | `billing_period_tenant_project_enrichment`、`project_tenant` | T2、T4 归因 |
| 同步消耗 | `consumption_usage_daily` | T4 产品线、账期外预览 |
| 计费租户 | `tenant`（billing） | 内部租户排除 |

---

## 10. 口径注意事项

1. **内部租户**：`tenant.type=internal` 且在账期 `[internal_effective_from, internal_effective_to]` 交集内的消费/充值，**不计入** T2～T4 对外经营指标；成本在 T3 中可单独披露 `internal_user_cost`。
2. **个人收入**：C 端 / 无项目租户消耗计入 T3 P7，**不参与** T2/T4 新客老客矩阵。
3. **项目消费归因**：多租户绑定同一项目时，以 `platform_income_monthly` 账期行（`billing_period_tenant_project_enrichment` 补全）为准。
4. **标签时效**：首期按 **月末时点** 项目标签划分客群；若需「当月生效标签」，需引入 `project_tag_assignment.created_at` 历史（P1 增强）。
5. **月报时效**：账期 `published` 后 T+3 工作日内发正式版；此前可发预览版，T2/T3 毛利标注「待月结」。

---

*文档维护：首期范围随业务确认迭代；全量指标见 [operational-monthly-report-metrics.md](operational-monthly-report-metrics.md)。*
