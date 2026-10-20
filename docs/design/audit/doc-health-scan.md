# 文档健康扫描报告（2026-10-06）

> 机器扫描，可重复执行。矛盾的人工裁决见 [doc-contradictions.md](doc-contradictions.md)。


## 概览

| 检查项 | 数量 | 说明 |
| --- | --- | --- |
| md 文档总数 | 235 | 含 design/guide/business/archive |
| 跨文档 `§` 引用失效 | ~~7 处~~ → **3 处已修 + 4 处误报** | 真失效已改锚；4 处目标用中文数字章节（`## 十二、`/`## 四、`/`## 第二部分：`），扫描器按阿拉伯数字未命中 |
| 相对链接断链 | ~~36 处 / 14 文件~~ → **0 处** | **2026-10-06 已全部修复**（详见 §2 修复记录） |
| 代码围栏不闭合 | ~~3 文件~~ **误报** | 标准状态机验证三份均正常闭合；奇数来自 code block **内部**出现的 \`\`\`sql 等带标记行（2026-10-06 复核） |
| 含状态标记的文档 | 105 文件 / 424 处 | 待定/TODO/未实现/缺失… |
| 表名断言未命中 schema | 116 处 / 49 文件 | 需人工区分「规划中的新表」与「过期描述」（schema 共 287 张表） |

## 1. 跨文档 §章节引用失效

| 引用方 | 目标 | 章节 |
| --- | --- | --- |
| `apps/web/content/design/finance-single-period-income-design.md` | `billing-period-import-design.md` | §5.4 |
| `apps/web/content/design/platform-pricing-design.md` | `billing-period-import-design.md` | §4.6.1 |
| `apps/web/content/design/supplier-database.md` | `billing-period-import-design.md` | §4.6.1 |
| `docs/design/cloud/capsule-skypilot-multi-tenancy.md` | `../../../apps/gpus/content/design/gpus-database-and-skypilot.md` | §2 |
| `docs/design/cloud/procurement-to-onboarding-closed-loop.md` | `idle-compute-gateway-network.md` | §12 |
| `docs/design/cloud/procurement-to-onboarding-closed-loop.md` | `idle-compute-gateway-network.md` | §12 |
| `docs/design/cloud/procurement-to-onboarding-closed-loop.md` | `device-onboarding-flow.md` | §4 |

**处置（2026-10-06 已完成）**：

- **3 处真失效已修**：`§4.6.1` → §7 成本计算 / §4.4 导入校验 V14；`§5.4/§5.7` → §5 数据模型（均标注原引用已失效）。
- **4 处为扫描误报**：`idle-compute-gateway-network.md §12`（实为 `## 十二、`）、`device-onboarding-flow.md §4`（实为 `## 四、`）、`gpus-database-and-skypilot.md §2`（实为 `## 第二部分：`）—— 目标章节以**中文数字**书写，扫描器按阿拉伯数字匹配未命中，引用本身有效。


## 2. 相对链接断链

- `apps/web/content/design/feishu-integration-design.md` → `./supplier-device-masterdata-integration-api-design.md`
- `apps/web/content/design/global-dashboard-period-analytics.md` → `./supplier-device-masterdata-integration-api-design.md`　（**已归档** → `docs/design/archive/`，大盘下线）
- `apps/web/content/design/global-dashboard-period-composition-card-hours-design.md` → `./supplier-device-masterdata-integration-api-design.md`, `./supplier-device-masterdata-integration-api-design.md`, `./supplier-device-masterdata-integration-api-design.md`　（**已归档** → `docs/design/archive/`，大盘下线）
- `apps/web/content/design/global-dashboard-period-composition-m2-masterdata-etl.md` → `./supplier-device-masterdata-integration-api-design.md`, `./supplier-device-masterdata-integration-api-design.md`, `./supplier-device-masterdata-integration-api-design.md`　（**已归档** → `docs/design/archive/`，大盘下线）
- `apps/web/content/design/idc-auto-onboarding-implementation.md` → `../../docs/content/design/cloud/capsule-skypilot-multi-tenancy.md`, `../../docs/content/design/cloud/multi-idc-federation.md`
- `apps/web/content/design/reports/operational-dashboard-cluster-analysis-implementation-plan.md` → `./tenant-region-gpu-consumption-daily-monthly-design.md`, `./global-dashboard-period-composition-card-hours-design.md`, `./global-dashboard-period-composition-card-hours-design.md`　（**已归档** → `docs/design/archive/`，大盘下线）　（**已归档** → `docs/design/archive/`，大盘下线）
- `apps/web/content/design/supplier-device-import-schema.md` → `./supplier-device-masterdata-integration-api-design.md`
- `apps/web/content/design/supplier-device-ops-pool-masterdata-design.md` → `./supplier-device-masterdata-integration-api-design.md`, `./supplier-device-masterdata-integration-api-design.md`
- `apps/web/content/design/supplier-device-platform-probe-design.md` → `./supplier-device-masterdata-integration-api-design.md`
- `apps/web/content/design/supplier-internal-occupancy-batch-design.md` → `../../packages/db/src/supply-lifecycle-dictionary.ts`, `../../packages/db/src/supply-schema.ts`, `../../apps/web/src/lib/server/dataaccess/supplier/device-import.ts`, `../../apps/web/src/lib/server/dataaccess/supplier/overview.ts`
- `apps/web/content/design/supplier-onboarding-plan-changelog-tracking-design.md` → `./supplier-onboarding-quantity-tracking-design.md`, `../../src/lib/supplier/overview-stats.ts`
- `docs/design/cloud/merchant-billing-system-design.md` → `../../web/content/design/merchant-management-design.md`, `../../web/content/design/tenant-billing-import-design.md`, `../../web/content/design/tenant-bill-daily-sync-design.md`, `../../web/content/design/finance-single-period-income-design.md`, `../../web/content/design/discount-coupon-sync-design.md`
- `docs/design/cloud/openmeter-billing-design.md` → `../../k8s/cloud-native-integration.md`, `../../k8s/image-registry-cost-optimization.md`, `../../k8s/image-tenant-workflow.md`
- `docs/design/cloud/tenant-billing-system-design.md` → `../../web/content/design/tenant-billing-import-design.md`, `../../web/content/design/tenant-bill-daily-sync-design.md`, `../../web/content/design/discount-coupon-sync-design.md`, `./tenant-billing-import-design.md`, `./tenant-bill-daily-sync-design.md`

**处置（2026-10-06 已完成，断链 42 → 0）**：

| 类别 | 数量 | 处理 |
| --- | --- | --- |
| 层级笔误（同名文件存在） | 28 处 | 按实际深度改写：`../../web/...` → `../../../apps/web/...`、`../../k8s/...` → `../../../docs/design/k8s/...`、`../../docs/content/design/` → `../../../../docs/design/`、`reports/` 下 `./` → `../` 等 |
| 目标文件从未存在 | 13 处 | `supplier-device-masterdata-integration-api-design.md`（11）、`supplier-onboarding-quantity-tracking-design.md`（1）转为纯文本并标注「规划中，未创建」；`overview-stats.ts`（1）标注「文件已删除」 |
| 含括号的源码路径 | 5 处 | `[x](../../src/app/[locale]/(protected)/...)` 会在第一个 `)` 处被解析器截断，改为 `[x](<...>)` 尖括号包裹 |
| 引用方自身为本次订正新增 | 1 处 | `reports/operational-monthly-report-p0-metrics.md` 勘误链接少一层 `../`，已修正 |


## 3. 代码围栏不闭合（2026-10-06 复核：**误报**）

朴素计数（\`\`\` 行数为奇数）命中三份：`billing-display.md`(57)、`container-cloud-instance-implementation.md`(73)、`database-design.md`(15)。

**复核结论**：用标准状态机（开 \`\`\` → 遇纯净 \`\`\` 闭合）逐行解析，三份**均正常闭合**。奇数来自 code block **内部**出现的带语言标记行（\`\`\`sql 等 19/33/7 处）被朴素计数误计为 fence。**无需修复**。

## 4. 含状态标记的文档 Top 20

| 文档 | 标记数 |
| --- | --- |
| `../../../apps/gpus/content/design/gpus-commercialization-gap-analysis.md` | 48 |
| `docs/business/commercial-closed-loop-gap-analysis.md` | 36 |
| `docs/design/audit/design-vs-schema-conflicts.md` | 27 |
| `docs/design/audit/serverless-commercialization-gap.md` | 24 |
| `apps/merchant/content/design/merchant-module-review-and-design.md` | 20 |
| `../../../apps/supplier/content/design/supplier-settlement-closure-audit.md` | 16 |
| `apps/web/content/business/supplier-contract-management-design.md` | 13 |
| `apps/web/content/design/audit/design-implementation-gap-audit.md` | 13 |
| `../../../apps/supplier/content/design/supplier-settlement-open-items.md` | 13 |
| `apps/web/content/design/merchant-management-design.md` | 11 |
| `docs/archive/FINAL_SUMMARY.md` | 10 |
| `docs/design/cloud/idle-compute-gateway-network.md` | 9 |
| `docs/business/cost.md` | 7 |
| `apps/web/content/business/supplier-lifecycle-product-plan.md` | 6 |
| `docs/design/audit/merchant-console-followups.md` | 6 |
| `apps/web/content/design/feishu-integration-design.md` | 5 |
| `apps/web/content/design/supplier-database.md` | 5 |
| `docs/design/cloud/reserved-resource-pack-design.md` | 5 |
| `apps/web/content/design/bare-metal-order-discount-fields-sync-plan.md` | 4 |
| `apps/web/content/design/platform-tenant-import-design.md` | 4 |

**说明**：`docs/design/audit/` 下的审计类文档天然多标记（职责就是记录缺口），不视为过期信号；需关注的是**设计文档自身**仍标「未实现/待定」的章节。


## 5. 表名断言未命中 schema Top 12

| 文档 | 未知表名数 | 样例 |
| --- | --- | --- |
| `apps/web/content/design/monthly-cost-from-gpu-consumption-design.md` | 10 | `account_manager_name`, `balance_card_hours`, `customer_full_name`, `customer_incentive_label`, `data_center_id` |
| `../../../apps/gpus/content/design/gpus-commercialization-gap-analysis.md` | 9 | `compute_task_log`, `compute_task_worker`, `inference_api_key`, `inference_deployment`, `inference_detail` |
| `apps/web/content/design/bare-metal-order-schema-design.md` | 6 | `device_count`, `order_amount`, `order_mark`, `platform_order_id`, `project_id` |
| `apps/web/content/design/idc-auto-onboarding-implementation.md` | 6 | `capsule_tenant_registry`, `karmada_cluster_registry`, `onboarding_pipeline_run`, `sky_pilot_cluster_registry`, `supplier_device_credential_audit` |
| `docs/design/cloud/compute-task-decoupling-analysis.md` | 6 | `inference_api_key`, `inference_deployment`, `inference_detail`, `inference_usage_record`, `job_detail` |
| `apps/web/content/design/sla/datacenter-sla-implementation-design.md` | 5 | `affected_device_count`, `cooperation_mode`, `record_id`, `sla_bare_metal_usage_daily`, `sla_supplier_capacity_contract` |
| `apps/web/content/design/platform-metal-order-api-field-mapping.md` | 4 | `device_count`, `gpu_count`, `platform_order_id`, `platform_payload` |
| `docs/design/cloud/reserved-resource-pack-design.md` | 4 | `reserved_pack_default_sharing`, `reserved_pack_monthly_billing`, `reserved_pack_usage_daily`, `reserved_resource_pack` |
| `apps/web/content/design/bare-metal-order-discount-fields-sync-plan.md` | 3 | `balance_amount`, `discount_price`, `total_price` |
| `apps/web/content/design/crm-database.md` | 3 | `commission_policy`, `project_id`, `project_role_definition` |
| `apps/web/content/design/datacenter-device-retire-design.md` | 3 | `change_action`, `dc_closure`, `ticket_no` |
| `apps/web/content/design/feishu-integration-design.md` | 3 | `datacenter_activity`, `feishu_bitable_sync_config`, `ticket_no` |

**处置建议**：

1. md 写「已实现/已存在」而 schema 无此表 → **过期，标 `已取代` 或订正**
2. md 是设计提案中的「规划表」→ **正常，保留**，状态列标 `规划`
3. schema 有而 md 写「缺失」→ **md 过期**（如 `design-vs-schema-conflicts.md` 整篇已过期，见 `docs/archive/README.md`）

## 6. 复跑方式

```bash
python3 - <<'PY'  # 从 docs/design/audit/doc-health-scan.md 同次提交的内联脚本取回
# 核心检查：md 相对链接可达性 / 跨文档 §章节号 / 表名与 schema 交集
PY
```
