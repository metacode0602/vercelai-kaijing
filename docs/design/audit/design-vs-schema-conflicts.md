> # ⛔ 已归档 — 整篇内容已过期
>
> **归档日期**：2026-09-26　**原路径**：`design-vs-schema-conflicts.md`（仓库根目录）
> **归档原因**：生成于 2026-07-19，声称 `merchant_promo_link` / `merchant_branding` / `merchant_bill_daily` 等表「缺失」。**这些表现已全部存在**（`packages/db/src/merchant-schema.ts`），本文的每一条「缺失」结论均不成立。整篇保留仅为历史追溯，**不得据此排期或改动 schema**。
>
> **已被取代的文档**：`docs/design/cloud/merchant-billing-system-design.md`（账单口径权威）
> **当前有效设计文档**：`apps/merchant/content/design/merchant-module-review-and-design.md`

# 设计文档 vs 现有 Schema 冲突分析报告

> 生成时间：2026-07-19
> 分析范围：`docs/design/cloud/database-design.md`（主设计文档）+ 补充设计文档 vs `packages/db/src/` 全部 14 个 schema 文件

---

## 目录

1. [摘要](#1-摘要)
2. [领域 A：供应商与算力资源 (supply)](#2-领域-a供应商与算力资源-supply)
3. [领域 B：平台定价 (platform-pricing)](#3-领域-b平台定价-platform-pricing)
4. [领域 C：CRM 客户关系管理 (crm)](#4-领域-ccrm-客户关系管理-crm)
5. [领域 D：商户管理 (merchant)](#5-领域-d商户管理-merchant)
6. [领域 E：财务账期与月结 (finance)](#6-领域-e财务账期与月结-finance)
7. [领域 F：前端用户产品 (gpus 消费者域)](#7-领域-f前端用户产品-gpus-消费者域)
8. [共享交易层](#8-共享交易层)
9. [补充设计文档额外表](#9-补充设计文档额外表)
10. [仅存在于 Schema 的表（设计文档未覆盖）](#10-仅存在于-schema-的表设计文档未覆盖)
11. [汇总统计](#11-汇总统计)

---

## 1. 摘要

| 指标 | 数量 |
|------|------|
| 设计文档定义的表 | ~65+ |
| 现有 Schema 中的表 | ~110+ |
| 设计有但 Schema 无（需新建） | ~25+ |
| Schema 有但设计无（设计需补充） | ~50+ |
| 两者都有但字段不一致 | ~8 |

---

## 2. 领域 A：供应商与算力资源 (supply)

### 2.1 ✅ 一致的表（设计有，Schema 有，字段基本匹配）

| 设计表名 | Schema 变量名 | Schema 物理表名 | 状态 |
|----------|--------------|----------------|------|
| supplier | `supplier` | `supplier` | ✅ Schema 额外扩展了 `source`, `identityNo`, `businessScope`, `businessLicenseUri`, `idCardFrontUri`, `idCardBackUri`, `bankBranchName`, `bankBranchAddress`, `adminPhone`, `adminEmail`, `deviceInfoRaw`, `auditConfirmed`, `externalOnboardingId`, `externalTenantId` 等字段 |
| supplier_ops_engineer | `supplierOpsEngineer` | `supplier_ops_engineer` | ✅ |
| gpu_card_type | `gpuCardType` | `gpu_card_type` | ✅ |
| data_center | `dataCenter` | `data_center` | ✅ Schema 额外有 `externalOnboardingId`, `platformTenantId`, `description`, `auditStatus`, `auditRemark`, `sourceDeleted` |
| supplier_card_list_price | `supplierCardListPrice` | `supplier_card_list_price` | ✅ Schema 额外有 `source`, `remark` |
| supplier_contract | `supplierContract` | `supplier_contract` | ✅ Schema 额外有 `tierBasis`, `cooperationMode`, `minCommitHours`, `settlementCycle`, `terms`, `signedAt`, `signerName` |
| supplier_pricing_tier | `supplierPricingTier` | `supplier_pricing_tier` | ✅ Schema 额外有 `supplierCardListPriceId`, `dealToListRatioMin`, `dealToListRatioMax`, `remark` |
| supplier_unit_cost | `supplierUnitCost` | `supplier_unit_cost` | ✅ Schema 额外有 `supplierCardListPriceId`, `dealToListRatio`, `tierJson` |
| supplier_pricing_record | `supplierPricingRecord` | `supplier_pricing_record` | ✅ Schema 额外有 `supplierUnitCostId`, `supplierCardListPriceId`, `listPricePerHour` |
| onboarding_batch | `onboardingBatch` | `onboarding_batch` | ✅ Schema 大量扩展字段 |
| onboarding_batch_plan_line | `onboardingBatchPlanLine` | `onboarding_batch_plan_line` | ✅ |
| supplier_device | `supplierDevice` | `supplier_device` | ✅ Schema 额外有 `onboardingSubstage`, `bandwidthGroup`, `rateLimit`, `receivedAt`, `remark` |
| compute_node | `computeNode` | `compute_node` | ✅ Schema 额外有 `expectedService` |
| supplier_gpu_inventory | `supplierGpuInventory` | `supplier_gpu_inventory` | ✅ Schema 额外有 `internalTestScope`, `internalTestUntil`, `lastSyncedAt` |
| supplier_datacenter_card_type_spec | `supplierDatacenterCardTypeSpec` | `supplier_datacenter_card_type_spec` | ✅ Schema 额外有 `updatedByStaffId` |
| supplier_datacenter_infrastructure | `supplierDatacenterInfrastructure` | `supplier_datacenter_infrastructure` | ✅ |
| supplier_device_change_log | `supplierDeviceChangeLog` | `supplier_device_change_log` | ✅ Schema 额外有 `businessOnboardingBatchId`, `externalDeviceId`, `description`, `ticketNo`, `attachmentNames`, `importRowNo` |
| bare_metal_order | `bareMetalOrder` | `bare_metal_order` | ✅ Schema 额外有 `orderMark`, `platformTenantId`, `payStatus`, `purchaseQty`, `purchaseQtyText`, `importedAt`, `completedAt`, `importBatchId`, `platformPayload`, `matchFlags`, `remark` |
| bare_metal_order_device | `bareMetalOrderDevice` | `bare_metal_order_device` | ✅ Schema 额外有 `deviceModelText`, `deviceStatus`, `linkedAt`, `platformPayload`, `matchFlags` |

### 2.2 ⚠️ 设计有但 Schema 无（需新建）

| 设计表名 | 说明 | 优先级 |
|----------|------|--------|
| _(无)_ | 所有设计文档中领域 A 的表在 Schema 中均已实现 | — |

### 2.3 📝 Schema 有但设计文档未覆盖

| Schema 变量名 | 物理表名 | 说明 |
|--------------|---------|------|
| `supplierContractCapacityLine` | `supplier_contract_capacity_line` | 合同产能行 |
| `supplierTermsVersion` | `supplier_terms_version` | 供应商条款版本 |
| `supplierPricingHistory` | `supplier_pricing_history` | 定价变更历史 |
| `accessConditionSheet` | `access_condition_sheet` | 接入条件表 |
| `onboardingBatchProgressEvent` | `onboarding_batch_progress_event` | 批次进度事件 |
| `onboardingBatchDeviceLink` | `onboarding_batch_device_link` | 批次设备关联 |
| `onboardingBatchImportRow` | `onboarding_batch_import_row` | 批次导入行 |
| `onboardingTask` | `onboarding_task` | 接入任务 |
| `faultIncident` | `fault_incident` | 故障事件 |
| `internalTestHold` | `internal_test_hold` | 内部测试占用 |
| `internalTestHoldDeviceLink` | `internal_test_hold_device_link` | 测试占用设备关联 |
| `resourcePoolBinding` | `resource_pool_binding` | 资源池绑定 |
| `supplierOpsUploadBatch` | `supplier_ops_upload_batch` | 运维上传批次 |
| `supplierBill` | `supplier_bill` | 供应商结算账单 |
| `supplierBillDetail` | `supplier_bill_detail` | 供应商账单明细 |
| `bareMetalOrderImportBatch` | `bare_metal_order_import_batch` | 裸金属导入批次 |
| `bareMetalSyncJobRun` | `bare_metal_sync_job_run` | 裸金属同步任务 |
| `bareMetalSyncJobItem` | `bare_metal_sync_job_item` | 裸金属同步明细 |
| `bareMetalSyncState` | `bare_metal_sync_state` | 裸金属同步状态 |
| `devicePlatformProbeState` | `device_platform_probe_state` | 设备探测状态 |
| `devicePlatformProbeJobRun` | `device_platform_probe_job_run` | 设备探测任务 |
| `devicePlatformProbeSnapshot` | `device_platform_probe_snapshot` | 设备探测快照 |
| `devicePlatformOrphanImportRule` | `device_platform_orphan_import_rule` | 孤儿设备导入规则 |
| `devicePlatformOrphanImportBatch` | `device_platform_orphan_import_batch` | 孤儿设备导入批次 |

---

## 3. 领域 B：平台定价 (platform-pricing)

### 3.1 ✅ 一致的表

| 设计表名 | Schema 变量名 | Schema 物理表名 | 状态 |
|----------|--------------|----------------|------|
| platform_card_list_price | `platformCardListPrice` | `platform_card_list_price` | ⚠️ **字段差异**：设计有 `base_price`, `is_system`, `changed_by_staff_id`；Schema 用 `sellPrice`, `status`, `updatedByStaffId` |
| platform_card_price_record | `platformCardPriceRecord` | `platform_card_price_record` | ⚠️ **字段差异**：设计有 `status`, `effective_to`, `list_price_id`, `remark`；Schema 无 `status`/`effectiveTo`/`remark`，用 `platformCardListPriceId` |
| platform_card_price_history | `platformCardPriceHistory` | `platform_card_price_history` | ⚠️ **字段差异**：设计有 `record_id`；Schema 用 `priceRecordId`（同义）；Schema 额外有 `productLine`, `billingUnit` |
| supplier_datacenter_sell_price | `supplierDatacenterSellPrice` | `supplier_datacenter_sell_price` | ✅ Schema 额外有 `supplierId`, `inheritPlatformPrice`, `currency`, `source`, `remark`, `updatedByStaffId` |
| supplier_datacenter_sell_price_history | `supplierDatacenterSellPriceHistory` | `supplier_datacenter_sell_price_history` | ✅ Schema 额外有 `supplierId` |

### 3.2 ⚠️ 关键字段差异详情

#### `platform_card_list_price` 字段对照

| 设计字段 | Schema 字段 | 差异 |
|---------|------------|------|
| `base_price` (numeric) | `sellPrice` (numeric) | 命名不同，语义可能不同 |
| `is_system` (boolean) | _(无)_ | Schema 缺失 |
| `changed_by_staff_id` (text FK) | `updatedByStaffId` (text FK) | 命名不同 |
| _(无)_ | `status` (varchar) | Schema 额外字段 |
| _(无)_ | `remark` (text) | Schema 额外字段 |

#### `platform_card_price_record` 字段对照

| 设计字段 | Schema 字段 | 差异 |
|---------|------------|------|
| `status` (varchar) | _(无)_ | Schema 缺失 |
| `effective_to` (timestamp) | _(无)_ | Schema 缺失（用 UK 约束隐含） |
| `list_price_id` (text FK) | `platformCardListPriceId` (text FK) | 命名不同 |
| `remark` (text) | _(无)_ | Schema 缺失 |
| _(无)_ | `updatedByStaffId` (text FK) | Schema 额外字段 |

### 3.3 📝 Schema 有但设计文档未覆盖

_(无，所有 Schema 表均在设计文档中有定义)_

---

## 4. 领域 C：CRM 客户关系管理 (crm)

### 4.1 ✅ 一致的表

| 设计表名 | Schema 变量名 | Schema 物理表名 | 状态 |
|----------|--------------|----------------|------|
| customer | `customer` | `customer` | ⚠️ Schema 有大量额外字段：`shortName`, `certCode`, `lifecyclePhase`, `observedScaleSummary`, `testStartedOn`, `testCompletedOn`, `conversionDate`, `conversionTrigger`, `identityVerified*`, `platformRegisteredAt`。设计有 `code`，Schema 用 `customerCode` |
| billing_tenant (tenant) | `billingTenant` | `tenant` | ⚠️ Schema 有额外字段：`phone`, `platformRegisteredAt`, `billingSync*`。设计有 `balance` (numeric)，Schema 用 `numeric(20,4)` |
| user_staff | `userStaff` | `user_staff` | ⚠️ 设计字段简单；Schema 有 `employeeNo`(vs 设计 `staff_no`), `displayName`(vs `name`), `mobile`(vs `phone`), `roles`, `isDefault*`, `authUserId` |
| crm_project (project) | `crmProject` | `project` | ⚠️ 设计有 `code`, `business_line_code`, `contract_amount`, `expected_monthly_consumption`；Schema 用 `businessLineId`(FK), `monthlyBudget`, `lastMonthRecharge`/`thisMonthRecharge`/`lastMonthConsumption`/`thisMonthConsumption`, `balance`, `revenueDepartment`, `opportunitySource`, `dealClosedMonth`, `commissionMonthPhase` |
| project_tenant | `projectTenant` | `project_tenant` | ⚠️ 设计有 `allocation_percent`, `effective_from/to`, `source`；Schema 有 `bindingRole`, `bindingLabel`, `sortOrder`（**完全不同的关联模型**） |
| contract | `contract` | `contract` | ⚠️ 设计有 `name`, `file_uri`；Schema 有 `tenantId`, `projectId`, `paidAmount`, `signedAt`, `signerName`, `terms` |
| recharge | `recharge` | `recharge` | ⚠️ 设计有 `method`(vs Schema `paymentMethod`), `status`, `external_trade_no`(vs `transactionId`), `operated_at`(vs `completedAt`), `operator_staff_id`；Schema 额外有 `merchantId`, `projectId`, `refundId`, `refundAmount` |
| discount_template | `discountTemplate` | `discount_template` | ⚠️ **字段差异大**：设计有 `type`, `value`, `discount_percent`, `min_order_amount`, `validity_days`, `applicable_product_lines`, `cost_bearer`, `budget_limit`；Schema 用 `platformTemplateId`, `title`, `supportProducts`, `supportProductLines`, `totalAmount`, `faceAmount`, `rule`, `validityDay`, `startDate`, `endDate`, `mark`, `platformCreatedAt/UpdatedAt`, `syncedAt` |
| coupon | `coupon` | `coupon` | ⚠️ 设计有 `original_value`, `remaining_value`, `granted_at`；Schema 用 `value`, `surplusAmount`, `issuedAt`。Schema 额外有 `platformRelationId`, `merchantId`, `projectId`, `platformTemplateId`, `name`, `adminNickname`, `adminPhone`, `syncedAt` |
| consumption_record | `consumptionRecord` | `consumption_record` | ✅ Schema 额外有 `customerId`, `merchantId`, `resourceName`, `duration`, `unit` |
| compute_task | `computeTask` | `compute_task` | ⚠️ 设计有 `task_type`, `resource_spec`(jsonb), `started_at/finished_at`, `total_cost`；Schema 有 `title`, `description`, `resourceType`, `gpuCount`, `cpuCount`, `memoryGb`, `startTime`, `endTime`, `cost` |
| tenant_bill | `tenantBill` | `tenant_bill` | ⚠️ 设计简单；Schema 额外有 `customerId`, `merchantId`, `projectId`, `balanceAmount`, `couponAmount`, `dueDate`, `platformPeriodStart/End` |
| tenant_bill_daily | `tenantBillDaily` | `tenant_bill_daily` | ⚠️ 设计有 `product_line`, `amount`, `usage`；Schema 用 `totalAmount`, `balanceAmount`, `couponAmount`, `platformPeriodStart/End`, `syncedAt`（**不同的粒度模型**） |

### 4.2 ⚠️ 设计有但 Schema 无（需新建）

| 设计表名 | 说明 | 补充来源 |
|----------|------|----------|
| _(无)_ | 所有设计文档中领域 C 的核心表在 Schema 中均已实现，但字段有差异 | — |

### 4.3 📝 Schema 有但设计文档未覆盖

| Schema 变量名 | 物理表名 | 说明 |
|--------------|---------|------|
| `customerContact` | `customer_contact` | 客户联系人 |
| `tenantContact` | `tenant_contact` | 租户联系人 |
| `businessLine` | `business_line` | 业务线字典 |
| `projectRevenueDepartmentAssignment` | `project_revenue_department_assignment` | 项目营收部门分配 |
| `projectTag` | `project_tag` | 项目标签 |
| `projectOpportunitySourceAssignment` | `project_opportunity_source_assignment` | 项目机会来源分配 |
| `projectConversionSetting` | `project_conversion_setting` | 项目转化设置 |
| `projectTagAssignment` | `project_tag_assignment` | 项目标签关联 |
| `projectStaffAssignment` | `project_staff_assignment` | 项目人员分配 |
| `accountManagerAssignment` | `account_manager_assignment` | 客户经理分配 |
| `projectActivity` | `project_activity` | 项目活动 |
| `projectActivityAttachment` | `project_activity_attachment` | 项目活动附件 |
| `activityTypeDefinition` | `activity_type_definition` | 活动类型字典 |
| `accountActivity` | `account_activity` | 客户活动记录 |
| `calendarWorkday` | `calendar_workday` | 工作日历 |
| `lifecycleMilestone` | `lifecycle_milestone` | 生命周期里程碑 |
| `milestoneEvidence` | `milestone_evidence` | 里程碑证据 |
| `testVoucherIssue` | `test_voucher_issue` | 测试券发放 |
| `contractSnapshot` | `contract_snapshot` | 合同快照 |
| `rechargeOrder` | `recharge_order` | 充值订单 |
| `consumptionUsageDaily` | `consumption_usage_daily` | 日用量消费 |
| `tenantConsumptionDailyDetail` | `tenant_consumption_daily_detail` | 租户日消费明细 |
| `tenantRegionGpuConsumptionDaily` | `tenant_region_gpu_consumption_daily` | 租户区域 GPU 日消费 |
| `tenantRegionGpuConsumptionMonthly` | `tenant_region_gpu_consumption_monthly` | 租户区域 GPU 月消费 |
| `conversionRecord` | `conversion_record` | 转化记录 |
| `engagementDocument` | `engagement_document` | 交付文档 |
| `followUpTask` | `follow_up_task` | 跟进任务 |
| `engagementComment` | `engagement_comment` | 交付评论 |
| `billingSyncJobRun` | `billing_sync_job_run` | 账单同步任务 |
| `billingSyncJobItem` | `billing_sync_job_item` | 账单同步明细 |
| `balanceSnapshotJobRun` | `balance_snapshot_job_run` | 余额快照任务 |
| `balanceSnapshotJobItem` | `balance_snapshot_job_item` | 余额快照明细 |
| `tenantBalanceSnapshot` | `tenant_balance_snapshot` | 租户余额快照 |
| `platformTenantBlacklist` | `platform_tenant_blacklist` | 平台租户黑名单 |
| `tenantBlacklistSyncState` | `tenant_blacklist_sync_state` | 黑名单同步状态 |
| `tenantBlacklistSyncJobRun` | `tenant_blacklist_sync_job_run` | 黑名单同步任务 |
| `tenantBillDetail` | `tenant_bill_detail` | 月账单明细 |
| `tenantBillDailyDetail` | `tenant_bill_daily_detail` | 日账单明细 |

---

## 5. 领域 D：商户管理 (merchant)

### 5.1 ✅ 一致的表

| 设计表名 | Schema 变量名 | Schema 物理表名 | 状态 |
|----------|--------------|----------------|------|
| merchant | `merchant` | `merchant` | ⚠️ Schema 额外有 `companyFullName`, `unifiedSocialCreditCode`, `merchantMark`, `isDefault`, `contactUser`, `contactPhone`, `remark`, `platformSyncedAt`, `adminUrl`, `consoleUrl`, `website`。设计有 `account_manager_staff_id`，Schema 无 |
| merchant_datacenter_region | _(无直接对应)_ | — | ⚠️ 设计有此表，Schema 中未找到直接对应的 `merchant_datacenter_region` 表 |
| merchant_purchase_price | _(无直接对应)_ | — | ⚠️ 设计有此表，Schema 中未找到直接对应的 `merchant_purchase_price` 表 |
| merchant_bill | _(无直接对应)_ | — | ⚠️ 设计有此表，Schema 中未找到直接对应的 `merchant_bill` 表 |
| merchant_payment_node | `merchantPaymentNode` | `merchant_payment_node` | ✅ Schema 额外有 `expectedAmount`(vs 设计 `amount`), `sortOrder`, `remark`, `billMonth`, `createdByStaffId`, `updatedByStaffId` |

### 5.2 ⚠️ 设计有但 Schema 无（需新建）

| 设计表名 | 说明 |
|----------|------|
| `merchant_datacenter_region` | 商户机房区域关联 |
| `merchant_purchase_price` | 商户采购价 |
| `merchant_bill` | 商户月账单 |

### 5.3 📝 Schema 有但设计文档未覆盖

| Schema 变量名 | 物理表名 | 说明 |
|--------------|---------|------|
| `merchantContact` | `merchant_contact` | 商户联系人 |
| `tenantMerchant` | `tenant_merchant` | 租户商户关联 (deprecated · **2026-10-06 已删 schema 定义并 DROP 空表**) |
| `merchantPaymentNodeAuditLog` | `merchant_payment_node_audit_log` | 回款节点审计 |
| `merchantRechargeRecord` | `merchant_recharge_record` | 商户充值记录 |
| `merchantRechargeAttachment` | `merchant_recharge_attachment` | 充值附件 |
| `merchantRechargeAuditLog` | `merchant_recharge_audit_log` | 充值审计 |
| `merchantActivity` | `merchant_activity` | 商户活动 |
| `merchantOrder` | `merchant_order` | 商户订单 |
| `merchantRegionMapping` | `merchant_region_mapping` | 商户区域映射 |

---

## 6. 领域 E：财务账期与月结 (finance)

### 6.1 ✅ 一致的表

| 设计表名 | Schema 变量名 | Schema 物理表名 | 状态 |
|----------|--------------|----------------|------|
| billing_period | `billingPeriod` | `billing_period` | ⚠️ 设计有 `period_year/month`, `period_name`, `income_data_source`, `opened_at`；Schema 用 `periodCode`, `periodStart/End`。Schema 额外有大量汇总字段 |
| platform_income_monthly | `platformIncomeMonthly` | `platform_income_monthly` | ⚠️ 设计有 `product_line`, `usage_unit`, `usage_total`, `unit_price`, `income_amount`, `cost_amount`, `gross_margin`；Schema 有 `customerType`, `tenantPlatformId`, `tenantName`, `supplementaryConsumption`, `balanceConsumption`, `bareMetalConsumption`, `totalConsumption`（**完全不同的模型**） |
| platform_cost_monthly | `platformCostMonthly` | `platform_cost_monthly` | ⚠️ 设计简单（`supplier_id`, `data_center_id`, `gpu_card_type_id`, `cost_amount`）；Schema 大量扩展：`staffId`, `accountManager`, `totalConsumption`, `voucherConsumption`, `balanceConsumption`, `totalCardHours`, `confirmedRevenueExclTax`, `soldDurationCostExclTax`, `grossProfit`, `pricingSnapshotId` 等 |
| billing_tenant_cost_allocation | `billingTenantCostAllocation` | `billing_tenant_cost_allocation` | ✅ Schema 额外有 `tenantPlatformId`, `presetId`, `createdBy` |
| monthly_cost_base_line | `monthlyCostBaseLine` | `monthly_cost_base_line` | ✅ Schema 额外有大量字段用于提成计算 |

### 6.2 📝 Schema 有但设计文档未覆盖

| Schema 变量名 | 物理表名 | 说明 |
|--------------|---------|------|
| `billingPeriodCostSourceLine` | `billing_period_cost_source_line` | 成本来源行 |
| `billingPeriodCostPricingSnapshot` | `billing_period_cost_pricing_snapshot` | 成本定价快照 |
| `billingPeriodTenantBillWindow` | `billing_period_tenant_bill_window` | 账单窗口 |
| `billingPeriodImportBatch` | `billing_period_import_batch` | 导入批次 |
| `billingPeriodPersonalIncomeSummary` | `billing_period_personal_income_summary` | 个人收入汇总 |
| `billingPeriodPersonalIncomeTenantLine` | `billing_period_personal_income_tenant_line` | 个人收入租户行 |
| `billingPeriodRawCustomerConsumption` | `billing_period_raw_customer_consumption` | 原始客户消费 |
| `billingPeriodAggCustomerConsumption` | `billing_period_agg_customer_consumption` | 聚合客户消费 |
| `billingPeriodRawBaremetalOrder` | `billing_period_raw_baremetal_order` | 原始裸金属订单 |
| `billingPeriodRawTenantBill` | `billing_period_raw_tenant_bill` | 原始租户账单 |
| `billingPeriodTenantProjectEnrichment` | `billing_period_tenant_project_enrichment` | 租户项目 enrichment |
| `tenantProjectCost` | `tenant_project_cost` | 租户项目成本分配 |
| `projectMonthlyCostSnapshot` | `project_monthly_cost_snapshot` | 项目月度成本快照 |
| `billingPeriodReconciliationReport` | `billing_period_reconciliation_report` | 对账报告 |
| `billingPeriodOperationLog` | `billing_period_operation_log` | 操作日志 |
| `supplementaryConsumptionHistory` | `supplementary_consumption_history` | 补充消费历史 |
| `incomeAdjustmentHistory` | `income_adjustment_history` | 收入调整历史 |
| `voucherCardHoursAdjustmentHistory` | `voucher_card_hours_adjustment_history` | 券卡时调整历史 |
| `platformCostCommissionDeriveRun` | `platform_cost_commission_derive_run` | 提成计算批次 |
| `platformCostCommissionDeriveProject` | `platform_cost_commission_derive_project` | 提成项目 |
| `platformCostCommissionDeriveLine` | `platform_cost_commission_derive_line` | 提成明细 |
| `platformCostCommissionDeriveAmPhase` | `platform_cost_commission_derive_am_phase` | 提成 AM 阶段 |
| `platformCostCommissionDeriveDeptPhase` | `platform_cost_commission_derive_dept_phase` | 提成部门阶段 |
| `platformCostCommissionDeriveIssue` | `platform_cost_commission_derive_issue` | 提成问题 |
| `monthlyCostRun` | `monthly_cost_run` | 月度成本运行 |
| `monthlyCostCommissionProjectLine` | `monthly_cost_commission_project_line` | 月度提成项目行 |
| `monthlyCostCommissionLine` | `monthly_cost_commission_line` | 月度提成行 |
| `monthlyCostDeptPoolLine` | `monthly_cost_dept_pool_line` | 部门池行 |
| `monthlyCostDeptPoolProjectLine` | `monthly_cost_dept_pool_project_line` | 部门池项目行 |
| `monthlyCostDeptContributionWeight` | `monthly_cost_dept_contribution_weight` | 部门贡献权重 |
| `monthlyCostDeptDistributionLine` | `monthly_cost_dept_distribution_line` | 部门分配行 |

---

## 7. 领域 F：前端用户产品 (gpus 消费者域)

### 7.1 ⚠️ 设计有但 Schema 无（核心消费者域表）

设计文档 §7.2 明确标注"**待实现表**"：

| 设计表名 | 说明 | 状态 |
|----------|------|------|
| `tenant_profiles` | 租户业务扩展表 | ❌ 未实现 |
| `user_profiles` | 用户业务扩展表 | ❌ 未实现 |
| `projects` | 项目/工作空间表 (gpus 域) | ❌ 未实现 |
| `task_definitions` | 任务定义 | ❌ 未实现 |
| `task_instances` | 任务实例 | ❌ 未实现 |
| `retail_pricing` | 零售价表 | ❌ 未实现 |
| `billing_snapshots` | 计费快照 | ❌ 未实现 |
| `coupon_templates` | 券模板 (gpus 域) | ❌ 未实现 |
| `coupons` | 券实例 (gpus 域) | ❌ 未实现 |
| `coupon_usages` | 券使用明细 | ❌ 未实现 |
| `marketing_cost_allocations` | 营销成本分配 | ❌ 未实现 |
| `idc_providers` | IDC 供应商 | ❌ 未实现 |
| `idc_cost_pricing` | IDC 采购成本价 | ❌ 未实现 |
| `idc_settlements` | IDC 结算单 | ❌ 未实现 |

### 7.2 ✅ 设计有且 Schema 有（核心余额/流水表）

| 设计表名 | Schema 状态 | 说明 |
|----------|------------|------|
| `tenant_balance` | ❌ **Schema 中未找到** | 设计文档 `tenant-balance-unification.md` 定义了权威余额表，但 Schema 中未实现。现有 `billingTenant.balance` 字段是内嵌的简单余额 |
| `balance_transaction` | ❌ **Schema 中未找到** | 设计文档定义了余额变动流水，Schema 中未实现 |

---

## 8. 共享交易层

### 8.1 ⚠️ 设计有但 Schema 无

| 设计表名 | 说明 | 来源文档 |
|----------|------|----------|
| `balance_transaction` | 余额变动流水 | `database-design.md` §9.1 + `tenant-balance-unification.md` |
| `coupon_usage_log` | 券使用记录 | `database-design.md` §9.2 |

### 8.2 补充设计文档额外表

| 设计表名 | 说明 | 来源文档 | Schema 状态 |
|----------|------|----------|------------|
| `payment_order` | 支付单 | `recharge-flow-and-database-design.md` | ❌ Schema 无 |
| `prepaid_card` | 预付卡 | `recharge-flow-and-database-design.md` | ❌ Schema 无 |

---

## 9. 补充设计文档额外表

### `recharge-flow-and-database-design.md` 定义的表

| 表名 | 说明 | Schema 状态 |
|------|------|------------|
| `payment_order` | 支付单（支付网关对接） | ❌ 未实现 |
| `prepaid_card` | 预付卡 | ❌ 未实现 |

### `../../business/bare-metal-order-commercialization.md` 定义的表

| 表名 | 说明 | Schema 状态 |
|------|------|------------|
| `bare_metal_order` | 裸金属订单 | ✅ 已实现 |
| `bare_metal_order_device` | 裸金属订单设备 | ✅ 已实现 |

### `tenant-balance-unification.md` 定义的表

| 表名 | 说明 | Schema 状态 |
|------|------|------------|
| `tenant_balance` | 余额表（权威） | ❌ 未实现 |
| `balance_transaction` | 余额变动流水 | ❌ 未实现 |

---

## 10. 仅存在于 Schema 的表（设计文档未覆盖）

以下表存在于现有 Schema 但设计文档中未提及，属于**实现先行**的表：

### Supply 域（24 个额外表）
- `supplier_contract_capacity_line` — 合同产能行
- `supplier_terms_version` — 供应商条款版本
- `supplier_pricing_history` — 定价变更历史
- `access_condition_sheet` — 接入条件表
- `onboarding_batch_progress_event` — 批次进度事件
- `onboarding_batch_device_link` — 批次设备关联
- `onboarding_batch_import_row` — 批次导入行
- `onboarding_task` — 接入任务
- `fault_incident` — 故障事件
- `internal_test_hold` — 内部测试占用
- `internal_test_hold_device_link` — 测试占用设备关联
- `resource_pool_binding` — 资源池绑定
- `supplier_ops_upload_batch` — 运维上传批次
- `supplier_bill` — 供应商结算账单
- `supplier_bill_detail` — 供应商账单明细
- `bare_metal_order_import_batch` — 裸金属导入批次
- `bare_metal_sync_job_run` — 裸金属同步任务
- `bare_metal_sync_job_item` — 裸金属同步明细
- `bare_metal_sync_state` — 裸金属同步状态
- `device_platform_probe_state` — 设备探测状态
- `device_platform_probe_job_run` — 设备探测任务
- `device_platform_probe_snapshot` — 设备探测快照
- `device_platform_orphan_import_rule` — 孤儿设备导入规则
- `device_platform_orphan_import_batch` — 孤儿设备导入批次

### CRM 域（39 个额外表）
- `customer_contact`, `tenant_contact` — 联系人
- `business_line` — 业务线
- `project_revenue_department_assignment`, `project_tag`, `project_opportunity_source_assignment`, `project_conversion_setting`, `project_tag_assignment` — 项目扩展
- `project_staff_assignment`, `account_manager_assignment` — 人员分配
- `project_activity`, `project_activity_attachment`, `activity_type_definition`, `account_activity` — 活动记录
- `calendar_workday` — 工作日历
- `lifecycle_milestone`, `milestone_evidence` — 里程碑
- `test_voucher_issue` — 测试券
- `contract_snapshot` — 合同快照
- `recharge_order` — 充值订单
- `consumption_usage_daily`, `tenant_consumption_daily_detail` — 日消费
- `tenant_region_gpu_consumption_daily`, `tenant_region_gpu_consumption_monthly` — 区域 GPU 消费
- `conversion_record` — 转化记录
- `engagement_document`, `follow_up_task`, `engagement_comment` — 交付管理
- `billing_sync_job_run`, `billing_sync_job_item` — 账单同步
- `balance_snapshot_job_run`, `balance_snapshot_job_item`, `tenant_balance_snapshot` — 余额快照
- `platform_tenant_blacklist`, `tenant_blacklist_sync_state`, `tenant_blacklist_sync_job_run` — 黑名单
- `tenant_bill_detail`, `tenant_bill_daily_detail` — 账单明细

### Merchant 域（9 个额外表）
- `merchant_contact` — 商户联系人
- `tenant_merchant` — 租户商户关联 (deprecated · **已清理**，归属 `tenant.merchant_id`)
- `merchant_payment_node_audit_log` — 回款审计
- `merchant_recharge_record`, `merchant_recharge_attachment`, `merchant_recharge_audit_log` — 充值管理
- `merchant_activity` — 商户活动
- `merchant_order` — 商户订单
- `merchant_region_mapping` — 商户区域映射

### Finance 域（31 个额外表）
- 详见 §6.3

### SLA 域（20 个表，设计文档完全未覆盖）
- `sla_import_batch`, `sla_bitable_sync_config` — 导入/同步
- `offline_bare_metal_order`, `offline_bare_metal_order_supply_line` — 离线裸金属
- `sla_ops_fault_incident`, `sla_ops_fault_incident_device`, `sla_ops_fault_daily` — 故障
- `sla_fault_count_daily`, `sla_supply_daily`, `sla_fault_card_hours_daily` — 日统计
- `sla_utilization_daily`, `sla_waste_daily` — 利用率/浪费
- `sla_onboarding_loss` — 接入损耗
- `sla_platform_offline_baremetal_incident`, `sla_platform_online_incident` — 平台故障
- `sla_platform_internal_usage` — 内部使用
- `sla_fault_device_daily`, `sla_device_monthly` — 设备级 SLA
- `sla_datacenter_card_type_monthly`, `sla_datacenter_monthly` — 机房级 SLA
- `sla_monthly_report_compensation` — 月度赔偿

### Supplier Quote 域（6 个表，设计文档完全未覆盖）
- `supplier_quote`, `supplier_quote_history`, `supplier_quote_supplier_alias`, `supplier_quote_gpu_card_type_alias`, `supplier_quote_import_batch`, `supplier_quote_import_batch_item`

### Whole Rent Equipment 域（1 个表）
- `whole_rent_equipment` — 整租设备

### Auth 域（10 个表，设计文档未覆盖）
- `users`, `session`, `account`, `verification` — Better Auth 标准表
- `user_invitation_codes`, `user_invitation_relations` — 邀请码
- `organization`, `member`, `invitation` — 组织/成员
- `user_site_message` — 站内消息

### Dashboard 域（2 个表）
- `device_lifecycle_event` — 设备生命周期事件
- `device_daily_snapshot` — 设备日快照

---

## 11. 汇总统计

### 按领域统计

| 领域 | 设计表数 | Schema 表数 | 一致 | 设计有Schema无 | Schema有设计无 | 字段不一致 |
|------|---------|------------|------|---------------|---------------|-----------|
| A: Supply | 19 | 43 | 19 | 0 | 24 | 0 |
| B: Platform Pricing | 5 | 5 | 5 | 0 | 0 | 3 |
| C: CRM | 13 | 51 | 13 | 0 | 38 | 10 |
| D: Merchant | 5 | 14 | 2 | 3 | 9 | 1 |
| E: Finance | 5 | 36 | 5 | 0 | 31 | 3 |
| F: Consumer (gpus) | 14 | 0 | 0 | 14 | 0 | — |
| 共享交易层 | 4 | 0 | 0 | 4 | 0 | — |
| SLA | 0 | 20 | 0 | 0 | 20 | — |
| Supplier Quote | 0 | 6 | 0 | 0 | 6 | — |
| Auth | 0 | 10 | 0 | 0 | 10 | — |
| 其他 | 0 | 5 | 0 | 0 | 5 | — |
| **合计** | **~65** | **~110+** | **~44** | **~21** | **~50+** | **~17** |

### 关键结论

1. **设计文档覆盖不足**：设计文档仅覆盖约 40% 的现有 Schema 表，SLA、供应商报价、认证、Dashboard 等领域完全未在设计文档中体现
2. **消费者域完全未实现**：设计文档 §7.2 定义的 14+ 张消费者核心表（余额、交易流水、任务、券等）均未在 Schema 中实现
3. **`tenant_balance` 和 `balance_transaction` 缺失**：这是最核心的缺失，影响充值-消费-结算全链路
4. **字段命名不一致**：多处设计与 Schema 字段命名不同（如 `base_price` vs `sellPrice`、`code` vs `customerCode`、`name` vs `displayName`）
5. **商户域设计滞后**：设计文档仅定义了 5 张表，Schema 已实现 14 张，且设计中的 `merchant_datacenter_region`、`merchant_purchase_price`、`merchant_bill` 在 Schema 中无对应
6. **CRM 域 Schema 大量扩展**：Schema 实现了大量设计文档未覆盖的 CRM 功能（活动记录、里程碑、转化、黑名单、消费明细等）

---

## 建议后续动作

1. **优先补齐消费者域 Schema**：实现 `tenant_balance`、`balance_transaction`、`coupon_usage_log` 等核心交易表
2. **更新设计文档**：将 SLA、供应商报价、CRM 扩展表等补充到设计文档中
3. **统一字段命名**：对 `platform_card_list_price` 等字段差异进行对齐决策
4. **补充商户域设计**：将 `merchant_datacenter_region`、`merchant_purchase_price`、`merchant_bill` 加入设计文档
