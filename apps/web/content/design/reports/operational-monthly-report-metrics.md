# 平台运营月报 — 指标分类体系

> 依据 `packages/db/src` 当前数据库设计整理。  
> 版本：v1.0 · 统计周期：自然月（YYYY-MM），与 `billing_period.period_code` / `usage_month` 对齐。  
> 用途标签：**[高层]** 面向管理层汇报；**[运营]** 支撑运营复盘与针对性措施。

---

## 1. 文档说明

### 1.1 双目标与读法

| 目标 | 读者 | 关注维度 | 建议篇幅 |
|------|------|----------|----------|
| 高层汇报 | 管理层、投资人 | 规模、收入、毛利、增长、风险摘要 | 1～2 页 Executive Summary |
| 运营复盘 | 销售、交付、供应链、财务、运维 | 结构拆解、异常清单、漏斗瓶颈、可行动项 | 分域详表 + 附录 |

### 1.2 数据真值层级

| 层级 | 说明 | 典型表 |
|------|------|--------|
| **财务月结（权威）** | 账期 `published` 后的收入/成本/毛利 | `billing_period`、`platform_income_monthly`、`platform_cost_monthly` |
| **平台同步（近实时）** | 租户消费、余额、账单同步 | `consumption_usage_daily`、`tenant_consumption_daily_detail`、`tenant_balance_snapshot` |
| **供应主数据（截面/Period）** | 设备、库存、接入进度 | `supplier_device`、`global_kpi_daily`、`lifecycle_stage_daily` |
| **CRM 经营（过程）** | 客户、项目、跟进、转化 | `customer`、`project`、`conversion_record` |

> **月报原则**：财务类指标以已发布账期为准；运营类指标可并用同步层做「账期外预览」，须在报表中标注口径差异。

### 1.3 通用维度

- **时间**：自然月、环比（MoM）、同比（YoY，可选）
- **客户类型**：B / C（`customer.type`、`platform_income_monthly.customer_type`）
- **租户类型**：internal / external（`tenant.type`）
- **产品线**：弹性算力、裸金属等（`product_line`）
- **机房 × 卡型**：`data_center_id` × `gpu_card_type_id`
- **组织**：收入归属部门、商机来源、客户经理（`project_revenue_department_assignment`、`project_opportunity_source_assignment`、`project_staff_assignment`）
- **商户**：OEM 渠道（`merchant`、`tenant_merchant`）

---

## 2. Executive Summary — 高层一页纸

> 标签：**[高层]** 必选；**[运营]** 作摘要对照。

| # | 指标 | 口径摘要 | 主数据源 | 标签 |
|---|------|----------|----------|------|
| E1 | **平台总收入** | 企业收入 + 个人收入 | `billing_period.income_total` | 高层 |
| E2 | **平台总成本** | 项目成本 + 内部用户成本 | `billing_period.total_cost` | 高层 |
| E3 | **平台总毛利** | 收入 − 成本（含税口径见财务规则） | `billing_period.total_gross_profit` | 高层 |
| E4 | **毛利率** | 总毛利 / 总收入 | 派生 | 高层 |
| E5 | **企业 vs 个人收入占比** | `enterprise_income` / `personal_income` | `billing_period` | 高层 |
| E6 | **弹性 vs 裸金属收入占比** | 余额消费 + 裸金属拆分 | `billing_period.balance_income`、`baremetal_income` | 高层 |
| E7 | **GPU 总卡数（期末）** | 供应库存 GPU 汇总 | `global_kpi_daily`（`gpu_total`） | 高层 |
| E8 | **在线设备 / 在线 GPU（期末）** | lifecycle=在线 | `global_kpi_daily`（`device_online`） | 高层 |
| E9 | **活跃付费租户数** | 当月 `total_consumption > 0` 的外部租户 | `platform_income_monthly` | 高层 |
| E10 | **活跃项目数** | 当月有消费且 stage=converted 的项目 | `platform_income_monthly` + `project` | 高层 |
| E11 | **本月新增转正客户数** | `conversion_date` 落在当月 | `conversion_record`、`project_conversion_setting` | 高层 |
| E12 | **待接入积压（台/GPU）** | 期末待接入实体 + 计划缺口 | `global_kpi_daily`（`device_pending_access`） | 高层 |
| E13 | **异常设备数（期末）** | 未关闭故障关联设备 | `global_kpi_daily`（`device_abnormal`） | 高层 |
| E14 | **账期发布状态** | draft / computed / published | `billing_period.status` | 高层 |
| E15 | **Top 风险摘要** | 余额不足、黑名单、对账差异、同步失败等 | 多表聚合（见 §9） | 高层 |

---

## 3. 经营与财务

### 3.1 收入结构

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 企业收入合计 | 有 CRM 项目绑定的租户消费 | `billing_period.enterprise_income` | 高层/运营 | 对比预算、AM 业绩 |
| 个人收入合计 | 非项目租户 + 黑名单子集 | `billing_period.personal_income`、`billing_period_personal_income_summary` | 高层/运营 | 评估 C 端/散客策略 |
| 余额消费收入 | 实付消费 | `platform_income_monthly.balance_consumption` 汇总 | 运营 | 充值与消耗匹配分析 |
| 裸金属消费收入 | 裸金属订单确认消费 | `platform_income_monthly.bare_metal_consumption` | 高层/运营 | 整租业务增长 |
| 补充消费 | 线下订单、补偿等调账 | `platform_income_monthly.supplementary_consumption` | 运营 | 非标准收入占比监控 |
| 算力券消费占比 | 券消费 / 总消费 | `consumption_usage_daily.voucher_amount` / `amount` | 运营 | 补贴力度评估 |
| B/C 客户收入分布 | 按 `customer_type` 分组 | `platform_income_monthly` | 高层/运营 | 客群结构变化 |
| 按业务线收入 | project → `business_line` | `platform_income_monthly` ⋈ `project` | 运营 | 产品线聚焦 |
| 按收入归属部门 | 项目部门快照 | `crm_project.revenue_department`（~~`project_monthly_cost_snapshot.revenue_department`~~ 该列不存在） | 运营 | 部门业绩考核 |
| 按商机来源收入 | 首触/渠道归因 | `project_monthly_cost_snapshot.opportunity_source` | 运营 | 渠道 ROI |
| 按商户（OEM）收入 | 租户绑商户 | `platform_income_monthly` ⋈ `tenant_merchant` ⋈ `merchant` | 高层/运营 | 渠道贡献 |
| Top N 客户收入 | 按 customer 排序 | `platform_income_monthly` | 高层 | 集中度风险 |
| Top N 项目收入 | 按 project 排序 | `platform_income_monthly` | 运营 | 大客户维系 |
| 收入环比/同比 | MoM / YoY | `billing_period` 多期 | 高层 | 增长趋势 |

### 3.2 成本与毛利

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 项目成本合计 | 外部有项目绑定租户成本 | `billing_period.project_cost` | 高层/运营 | 供应侧结算对账 |
| 内部用户成本 | 内部租户成本 | `billing_period.internal_user_cost` | 运营 | 内测/研发占用 |
| 总毛利 / 毛利率 | 见 E3/E4 | `billing_period` | 高层 | 定价与采购策略 |
| 按机房×卡型成本 | 消费卡时 × 单价 | `platform_cost_monthly`（type=record） | 运营 | 高成本低毛利资源 |
| 按供应商成本 | supplier 维度汇总 | `platform_cost_monthly` ⋈ `supplier_unit_cost` | 运营 | 供应商谈判 |
| 按客户经理成本/毛利 | AM 维度 sum 行 | `platform_cost_monthly`（staff_id） | 运营 | AM 绩效与项目健康度 |
| 售出时长成本 vs 赠送时长成本 | 实付 vs 券对应成本 | `sold_duration_cost_excl_tax`、`gifted_duration_cost_excl_tax` | 运营 | 补贴成本控管 |
| 成交/刊例价比 | 定价健康度 | `deal_to_list_ratio` | 运营 | 折扣深度监控 |
| 阶梯分成落档分布 | `matched_tier_order` 分布 | `platform_cost_monthly` | 运营 | 供应商条款执行 |
| 项目级毛利快照 | 人工确认后快照 | `project_monthly_cost_snapshot` | 运营 | 单项目复盘 |

### 3.3 充值与现金流

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 月充值总额 | status=paid 的充值 | `recharge`、`recharge_order` | 高层/运营 | 现金流与预收 |
| 充值笔数 / 充值客户数 | 去重 tenant/customer | `recharge` | 运营 | 充值活跃度 |
| 商户充值额 | OEM 渠道充值 | `merchant_recharge_record` | 运营 | 渠道资金 |
| 期末租户余额合计 | 月末截面 | `tenant_balance_snapshot`（granularity=day） | 高层/运营 | 消耗 runway |
| 低余额租户数 | balance < 阈值 | `tenant.balance`、`tenant_balance_snapshot` | 运营 | 催充值清单 |
| 逾期租户数 | `overdue_at` 非空 | `tenant` | 运营 | 信控动作 |
| 充值消费比 | 充值 / 消费 | `recharge` vs `consumption_usage_daily` | 运营 | 资金沉淀 |

### 3.4 账期与对账质量

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 账期状态与发布时间 | 月结闭环 | `billing_period` | 高层 | 关账时效 |
| 导入批次完整性 | 各 file_type 是否齐全 | `billing_period_import_batch` | 运营 | 补导数据 |
| 解析错误行数 | parse_error_count | `billing_period_import_batch` | 运营 | 源数据质量 |
| 对账报告差异项 | diff / warning 计数 | `billing_period_reconciliation_report.report_json` | 运营 | 财务修正 |
| 调账次数与金额 | 补充消费/收入/卡时调账 | `supplementary_consumption_history`、`income_adjustment_history`、`voucher_card_hours_adjustment_history` | 运营 | 人工干预监控 |
| 账期操作审计 | import / compute / publish | `billing_period_operation_log` | 运营 | 流程合规 |

---

## 4. 客户与 CRM 经营

### 4.1 客户规模与结构

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 客户总数（期末） | status=active | `customer` | 高层 | 盘子大小 |
| 新增客户数 | created_at 在当月 | `customer` | 高层/运营 | 获客 |
| B/C 客户占比 | type 分布 | `customer` | 高层 | 客群定位 |
| 实名认证率 | identity_verified=true | `customer` | 运营 | 合规与转化 |
| 按行业分布 | industry | `customer` | 运营 | 垂直行业策略 |
| 按销售经理客户数 | sales_manager_id | `customer` | 运营 | 销售负载 |

### 4.2 项目与漏斗

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 项目总数（按 stage） | lead / testing / converted | `project.stage` | 运营 | 漏斗存量 |
| 新增项目数 | created_at 在当月 | `project` | 运营 | 商机录入 |
| 测试中 → 转正数 | stage 变更或 conversion | `project_conversion_setting`、`conversion_record` | 高层/运营 | 转化效率 |
| 激励开始项目数 | conversion_date 在当月 | `project_conversion_setting` | 运营 | 提成锚定 |
| 暂停/完成项目数 | status 变更 | `project` | 运营 | 流失预警 |
| 项目四人组配置率 | 售前/AM/交付/PM 齐全占比 | `project_staff_assignment` | 运营 | 交付资源配置 |
| 有消费无项目租户数 | enrichment 缺口 | `billing_period_tenant_project_enrichment` 缺失 | 运营 | 归因补全 |
| 跟进任务完成率 | completed / total | `follow_up_task` | 运营 | 销售过程管理 |
| 项目动态数 | 当月 activity | `project_activity` | 运营 | 客户触达频率 |

### 4.3 消费行为（CRM 视角）

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 项目月消费 | 快照字段 | `project.this_month_consumption` | 运营 | 快速排名 |
| 项目月充值 | 快照字段 | `project.this_month_recharge` | 运营 | 资金配套 |
| 消费环比下滑 Top N | MoM 降幅 | `project` 快照或 `consumption_usage_daily` | 运营 | 流失挽回 |
| 消费为零但有余额项目 | 沉默客户 | `project` + `tenant.balance` | 运营 | 激活 campaign |
| 首消月分布 | deal_closed_month | `project.deal_closed_month` | 运营 | 新客爬坡 |
| ~~提成月序阶段分布~~ | ~~months_1_6 / months_7_to_2026_12~~ | ~~`project.commission_month_phase`~~ **（列已删 2026-10-06，指标下线）** | — | — |

### 4.4 合同与商务

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 新签合同数 / 金额 | signed_at 在当月 | `contract`、`contract_snapshot` | 高层 | 商务成果 |
| 合同回款率 | paid_amount / total_amount | `contract` | 高层/运营 | 应收管理 |
| 测试券发放数 | issued_at 在当月 | `test_voucher_issue` | 运营 | 试用支持 |
| 优惠券使用数 | used_at 在当月 | `coupon` | 运营 | 促销效果 |

---

## 5. 消费与用量（平台侧）

### 5.1 整体用量

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 总消费金额 | 当月 sum(amount) | `consumption_usage_daily` | 运营 | 与账期交叉验证 |
| 总卡时 | total_card_hours | `consumption_usage_daily` | 高层/运营 | 算力规模 |
| 余额卡时 vs 券卡时 | 实付 vs 赠送算力 | `balance_card_hours`、`voucher_card_hours` | 运营 | 补贴结构 |
| 按产品线消费 | product_line 分组 | `consumption_usage_daily` | 运营 | 产品组合 |
| 按租户消费排名 | Top N | `consumption_usage_daily` | 运营 | 大客户 |
| 日消费趋势 | usage_date 序列 | `consumption_usage_daily` | 运营 | 周内/月内波动 |

### 5.2 机房 × 卡型 × 任务

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 机房×卡型消费金额 | 明细汇总 | `tenant_consumption_daily_detail` | 运营 | 热点资源 |
| 机房×卡型卡时 | total_card_hours | `tenant_consumption_daily_detail` | 运营 | 利用率对标 |
| 任务数 / 独立 platform_task_id | 去重计数 | `tenant_consumption_daily_detail` | 运营 | 工作负载 |
| 消费集中度 | Top 机房/卡型占比 | 派生 | 运营 | 供应布局 |

### 5.3 裸金属订单

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 裸金属订单数 | ordered_at 在当月 | `bare_metal_order` | 高层/运营 | 整租业务 |
| 裸金属订单金额 | final_amount 汇总 | `bare_metal_order` | 高层/运营 | 收入贡献 |
| 新购 vs 续费 | order_mark | `bare_metal_order` | 运营 | 客户粘性 |
| 设备交付数 | device_count / 已分配设备 | `bare_metal_order`、`bare_metal_order_device` | 运营 | 交付 SLA |
| 退款订单数/金额 | refund_amount > 0 | `bare_metal_order` | 运营 | 交付/质量 |
| 订单-库存匹配率 | supplier_device_id 非空占比 | `bare_metal_order_device` | 运营 | 数据一致性 |

### 5.4 账单

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 租户月账单总额 | bill_month | `tenant_bill` | 运营 | 客户对账 |
| 账单明细产品线分布 | tenant_bill_detail | `tenant_bill_detail` | 运营 | 消费结构 |
| 后付费占比 | type=后付费 | `tenant_bill_detail` | 运营 | 信用策略 |

---

## 6. 供应与资源

### 6.1 资源规模（Global KPI）

> 口径对齐 `dashboard-schema` · `DASHBOARD_KPI_METRIC_KEYS`；月报取 **月末日桶** 与 **月内 Period 净增**。

| 指标 | metric_key | 数据源 | 标签 | 运营动作参考 |
|------|------------|--------|------|--------------|
| GPU 总卡数 | gpu_total | `global_kpi_daily` | 高层 | 供应能力 |
| 在线设备（台） | device_online | `global_kpi_daily` | 高层 | 可售资源 |
| 弹性资源池（卡） | pool_elastic | `global_kpi_daily` | 运营 | 弹性供给 |
| 裸金属池（卡） | pool_bare_metal | `global_kpi_daily` | 运营 | 整租供给 |
| 内部占用（卡） | internal_test | `global_kpi_daily` | 运营 | 内测挤占 |
| 异常设备（台） | device_abnormal | `global_kpi_daily` | 高层/运营 | 故障治理 |
| 待接入设备（台/GPU） | device_pending_access | `global_kpi_daily` | 高层/运营 | 接入 backlog |
| 待接入机房（个） | idc_pending_access | `global_kpi_daily` | 高层/运营 | 新机房进度 |
| 各 KPI 月内净增 | net_change | `global_kpi_daily` | 运营 | 扩容节奏 |

### 6.2 生命周期漏斗

> 五段：`pending_access` → `onboarding` → `online` → `maintenance` → `decommissioning`

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 各阶段期末 WIP（台/GPU） | wip_end_* | `lifecycle_stage_daily` | 运营 | 瓶颈阶段 |
| 各阶段月吞吐（throughput） | 期内首次进入 | `lifecycle_stage_daily` | 运营 | 接入效率 |
| 平均停留时长 | avg_dwell_seconds | `lifecycle_stage_daily` | 运营 | SLA 预警 |
| 待接入→在线转化周期 | 设备级派生 | `device_lifecycle_event` | 运营 | 接入提速 |
| 下线中设备数 | decommissioning wip | `lifecycle_stage_daily` | 运营 | 退役计划 |

### 6.3 供应商与机房

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 合作供应商数 | status 有效 | `supplier` | 高层 | 供应广度 |
| 合作机房数 | cooperation_status=active | `data_center` | 高层 | 区域覆盖 |
| 按供应商 GPU 库存 | quantity / online_quantity | `supplier_gpu_inventory` | 运营 | 供应能力 |
| 按机房×卡型在线率 | online_quantity / quantity | `supplier_gpu_inventory` | 运营 | 可售率 |
| 供应商月结算额 | bill_month | `supplier_bill.final_amount` | 运营 | 应付 |
| 供应商账单 vs 平台成本差异 | 对账 | `supplier_bill` vs `platform_cost_monthly` | 运营 | 结算争议 |
| 新接入供应商/机房 | created_at / 新 IDC 批次 | `supplier`、`onboarding_batch` | 运营 | 拓展成果 |

### 6.4 接入批次与上架

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 进行中批次数 | batch_status | `onboarding_batch` | 运营 | 并行工单 |
| 计划 vs 触达 vs 在线 | planned / touched / online | `onboarding_batch`、`onboarding_batch_plan_line` | 高层/运营 | 上架达成率 |
| 批次达成率 | online_device_count / planned_device_count | `onboarding_batch` | 运营 | 供应链 KPI |
| 月内新上架 GPU 数 | progress_event 或 batch | `onboarding_batch_progress_event` | 高层/运营 | 扩容成果 |
| 导入失败批次 | import_status=error | `onboarding_batch` | 运营 | 数据质量 |
| 退役批次完成数 | retire 相关 batch | `onboarding_batch` | 运营 | 缩容 |

### 6.5 设备一致性（平台探测）

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| CRM-平台一致率 | matched / inventory | `device_platform_probe_job_run` | 运营 | 主数据质量 |
| 平台孤儿数 | orphan_count | `device_platform_probe_job_run` | 运营 | 入库清理 |
| CRM 缺失数 | missing_crm_count | `device_platform_probe_job_run` | 运营 | 反向同步 |
| 模糊匹配数 | ambiguous_count | `device_platform_probe_job_run` | 运营 | 规则优化 |
| 孤儿导入批次 | committed_device_count | `device_platform_orphan_import_batch` | 运营 | 治理进度 |
| 一致性 flag 分布 | consistency_flag | `device_platform_probe_snapshot` | 运营 | 分类型处置 |

### 6.6 故障与运维

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 月新增故障数 | opened_at | `fault_incident` | 运营 | 稳定性 |
| 未关闭故障数 | closed_at is null | `fault_incident` | 高层/运营 | 积压 |
| 按严重度分布 | P1/P2/P3 | `fault_incident.severity` | 运营 | 响应优先级 |
| 平均影响时长 | impact_minutes | `fault_incident` | 运营 | SLA |
| 受影响设备数 | affected_device_count 汇总 | `fault_incident` | 运营 | 影响面 |
| 运维上传批次 | committed_incident_count | `supplier_ops_upload_batch` | 运营 | 故障录入 |

### 6.7 供应链线索

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 活跃线索数 | 非 lost | `supply_chain_lead` | 运营 | 管道 |
| 月转化供应商/机房数 | converted_at | `supply_chain_lead` | 运营 | 拓展转化 |
| 线索 GPU 意向规模 | gpu snapshot | `supply_chain_lead_gpu_snapshot` | 运营 | 未来供给 |

---

## 7. 商户与渠道（OEM）

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 活跃商户数 | status 有效 | `merchant` | 高层 | 渠道规模 |
| 商户绑定租户数 | tenant_merchant | `tenant_merchant` | 运营 | 渠道渗透 |
| 商户侧月充值 | recharge_date | `merchant_recharge_record` | 运营 | 渠道资金 |
| 商户覆盖机房数 | 有效 region | `merchant_datacenter_region` | 运营 | 上架范围 |
| 商户采购价变更次数 | 当月 | `merchant_purchase_price_record` | 运营 | 定价维护 |
| 按商户消费/收入 | 租户归因 | `consumption_usage_daily` ⋈ `tenant_merchant` | 高层/运营 | 渠道贡献排名 |

---

## 8. 定价

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 平台刊例价变更次数 | changed_at | `platform_card_price_history` | 运营 | 售价策略 |
| 供应商成交价变更次数 | changed_at | `supplier_pricing_history` | 运营 | 成本变动 |
| 成交/刊例价比（平台侧） | 消费加权 | 消费 × `platform_card_price_record` | 运营 | 折扣深度 |
| 成交/刊例价比（供应侧） | 成本加权 | `platform_cost_monthly.deal_to_list_ratio` | 运营 | 采购折扣 |
| 不可用定价配置数 | config_status=unavailable | `supplier_pricing_record` | 运营 | 配置缺口 |

---

## 9. 风险、合规与系统健康

### 9.1 客户风险

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 黑名单租户数 | status 有效 | `platform_tenant_blacklist` | 高层/运营 | 风控 |
| 黑名单租户消费 | summary_kind=blacklist | `billing_period_personal_income_summary` | 运营 | 异常收入 |
| 低余额 / 零余额活跃租户 | balance 阈值 | `tenant`、`tenant_balance_snapshot` | 运营 | 催费 |
| 暂停/停用客户数 | status | `customer` | 运营 | 流失 |

### 9.2 数据同步健康

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 账单同步成功率 | success / tenant | `billing_sync_job_run` | 运营 | 消费数据完整 |
| 同步失败租户清单 | status=failed | `billing_sync_job_item` | 运营 | 补同步 |
| 余额快照成功率 | success / tenant | `balance_snapshot_job_run` | 运营 | 余额准确 |
| 裸金属同步成功率 | success / fetched | `bare_metal_sync_job_run` | 运营 | 订单完整 |
| 黑名单同步状态 | last job | `tenant_blacklist_sync_job_run` | 运营 | 风控数据 |
| 大盘 ETL 成功率 | status=succeeded | `dashboard_etl_batch` | 运营 | KPI 可用性 |

### 9.3 提成派生质量

| 指标 | 定义 | 数据源 | 标签 | 运营动作参考 |
|------|------|--------|------|--------------|
| 提成计算状态 | calculated / failed | `platform_cost_commission_derive_run` | 运营 | 薪酬闭环 |
| 提成 issue 数 | 缺 AM / 缺转化等 | `platform_cost_commission_derive_issue` | 运营 | 主数据补全 |
| 按 AM 提成基数 | gross_profit_base_sum | `platform_cost_commission_derive_am_phase` | 运营 | 绩效预览 |
| 按部门提成池 | commission_pool_sum | `platform_cost_commission_derive_dept_phase` | 运营 | 部门分配 |

---

## 10. 月报结构建议

### 10.1 高层版（5～8 页）

1. **一页摘要**：§2 Executive Summary（E1～E15）
2. **经营结果**：收入/成本/毛利 + MoM 趋势图
3. **资源规模**：GPU、在线、待接入、异常（4 张 KPI）
4. **客户增长**：新增客户、转正数、Top 5 客户
5. **风险红绿灯**：低余额、黑名单、对账差异、同步失败（各 Top 3）
6. **下月关注**：人工输入 + 系统自动异常摘要

### 10.2 运营版（分域详表）

| 章节 | 对应本文 | 负责团队 |
|------|----------|----------|
| 财务月结复盘 | §3 | 财务 |
| 销售与客户经营 | §4 | 销售 / AM |
| 消费与产品 | §5 | 运营 / 产品 |
| 供应与接入 | §6 | 供应链 / 运维 |
| 商户渠道 | §7 | 渠道 |
| 定价与毛利结构 | §8 | 财务 / 采购 |
| 风险与系统 | §9 | 运营 / 研发 |

### 10.3 附录清单（行动导向）

- 消费环比下滑 > X% 的项目清单（§4.3）
- 低余额且当月有消费的租户（§3.3）
- 待接入停留 > N 天的批次/设备（§6.2、§6.4）
- 对账差异未关闭项（§3.4）
- 平台孤儿 / 一致性异常设备（§6.5）
- 未关闭 P1/P2 故障（§6.6）
- 提成派生 issue 项目（§9.3）

---

## 11. 指标优先级（实施分期）

| 分期 | 范围 | 说明 |
|------|------|------|
| **P0 — 首版月报** | §2 + §3.1～3.2 + §6.1 + §5.1 | 依赖已发布 `billing_period` + `global_kpi_daily` + `consumption_usage_daily` |
| **P1 — 经营深化** | §4 + §3.3～3.4 + §5.2～5.3 | CRM 漏斗、机房卡型、裸金属 |
| **P2 — 供应闭环** | §6.2～6.6 + §8 | 生命周期、接入、探测、定价 |
| **P3 — 渠道与风控** | §7 + §9 | 商户、同步健康、提成质量 |

---

## 12. 口径注意事项

1. **内部租户**：`tenant.type=internal` 且落在 `internal_effective_from/to` 区间内的消费，不计入企业收入（见 `billingTenant` 设计）；月报需单独披露内部占用成本。
2. **个人收入**：含「非项目租户」与「黑名单租户」两子集（`billing_period_personal_income_summary.summary_kind`）。
3. **卡时两套口径**：财务消费卡时（`consumption_usage_daily`）≠ 供应侧设备卡时（`device_*_snapshot` Period 积分）；不可混加。
4. **项目消费归因**：多租户绑定项目时，以 `platform_income_monthly` 账期补全结果为准，非简单 `project.primary_tenant_id`。
5. **月报时效**：建议账期 `published` 后 T+3 工作日内发出正式版；此前可发「预览版」并标注未关账。

---

## 附录 A — 指标 ↔ 主表速查

| 域 | 核心表 |
|----|--------|
| 财务月结 | `billing_period`、`platform_income_monthly`、`platform_cost_monthly`、`project_monthly_cost_snapshot` |
| CRM | `customer`、`project`、`conversion_record`、`project_conversion_setting`、`follow_up_task` |
| 消费同步 | `consumption_usage_daily`、`tenant_consumption_daily_detail`、`tenant_bill` |
| 充值余额 | `recharge`、`tenant_balance_snapshot`、`tenant` |
| 供应资源 | `supplier`、`data_center`、`supplier_gpu_inventory`、`supplier_device` |
| 接入 | `onboarding_batch`、`onboarding_batch_progress_event`、`lifecycle_stage_daily` |
| 大盘 KPI | `global_kpi_daily`、`global_kpi_hourly` |
| 裸金属 | `bare_metal_order`、`bare_metal_order_device` |
| 商户 | `merchant`、`tenant_merchant`、`merchant_recharge_record` |
| 定价 | `platform_card_list_price`、`supplier_pricing_record` |
| 风控 | `platform_tenant_blacklist` |
| 系统 | `billing_sync_job_run`、`dashboard_etl_batch`、`device_platform_probe_job_run` |

---

*文档维护：随 `packages/db/src` schema 变更同步修订指标口径与数据源映射。*
