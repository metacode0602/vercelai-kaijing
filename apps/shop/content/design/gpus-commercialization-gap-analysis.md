# GPUS 商业化实现差距分析

> **基于** `docs/design/cloud/` 设计文档（31 份）  
> **对标** `apps/gpus` 当前实现  
> **日期** 2026-07-21

---

## 1. 总览

### 1.1 设计文档覆盖的产品线

| 产品线 | 设计文档 | 状态 |
|--------|---------|------|
| Cloud VM (云服务器) | `container-cloud-instance-implementation.md` §3, `cloud-vm-implementation.md` | ✅ 完整 |
| Serverless (弹性服务) | `serverless-implementation.md` | ✅ 完整 |
| Bare Metal (裸金属) | `../../business/bare-metal-order-commercialization.md` | ✅ 完整 |
| Inference (LLM 推理) | `serverless-inference.md` | ✅ 完整 |
| Job (批处理) | `container-cloud-instance-implementation.md` §6 | ✅ 完整 |

### 1.2 实现成熟度概览

| 产品线 | 前端 UI | 购买流程 | DB 集成 | 计费集成 | 券抵扣 | 续费 | 状态 |
|--------|--------|---------|---------|---------|-------|------|------|
| Cloud VM | ✅ 完整 | ❌ Mock | ❌ | ❌ | ❌ UI-only | ❌ | 仅 UI 壳 |
| Serverless | ✅ 完整 | ❌ Mock | ❌ | ❌ | ❌ UI-only | ❌ | 仅 UI 壳 |
| Bare Metal | ✅ 完整 | ⚠️ 部分 | ✅ 下单 | ❌ | ❌ 前端硬编码 | ❌ | 下单可跑，缺计费/续费 |
| Inference | ❌ 无页面 | ❌ | ❌ | ❌ | ❌ | ❌ | 未开始 |
| Job (批处理) | ❌ 空壳 | ❌ | ❌ | ❌ | ❌ | ❌ | 未开始 |

### 1.3 关键结论

**当前 `apps/gpus` 不具备完整的商业化能力。** 三个核心产品线（Cloud VM / Serverless / Bare Metal）中：

- **Bare Metal** 是唯一具备真实 DB 集成的产品线（下单 → 扣款 → 入库），但缺少自动续费、逾期处理、价格快照等关键环节
- **Cloud VM 和 Serverless** 的购买流程完全是前端 Mock（`setTimeout` 模拟），无任何后端持久化
- **计费体系**（OpenMeter 集成、5 分钟定时扣款、余额三层防超额）完全未实现
- **算力券抵扣**仅在前端 UI 展示，无后端校验和扣减
- **充值流程**部分实现（对公转账 + 微信/支付宝接口未接通）

---

## 2. Cloud VM (云服务器) 商业化差距

### 2.1 设计要求 vs 实现现状

| 功能模块 | 设计要求 | 实现现状 | 差距 |
|---------|---------|---------|------|
| **市场列表** | 从 `data_center` × `gpu_card_type` × `supplier_datacenter_sell_price` 聚合查询 | 硬编码 `MARKET_OFFERINGS` 静态数组 (15条) | 🔴 无 DB 查询 |
| **部署下单** | tRPC → 事务(余额检查+冻结+INSERT `compute_base`+`cloud_vm_detail`+事件) | `setTimeout` 2000ms → `addServerInstance()` 内存状态 | 🔴 零后端 |
| **余额校验** | `SELECT ... FOR UPDATE` `tenant_balance` | `const MOCK_BALANCE = 0` 硬编码 | 🔴 Mock |
| **券抵扣** | 校验 `coupon` → 计算抵扣 → 扣减 `surplus_amount` → 写 `coupon_usage_log` | 前端 `getComputeVoucherDeduction()` 纯计算，无后端 | 🔴 仅前端 |
| **实例启动** | SkyPilot POST `/api/jobs` → 调度 → 容器启动 | `ConsoleStoreProvider.addServerInstance()` 内存 | 🔴 零调度 |
| **实例停止** | SkyPilot 取消 → 最终结算 → 释放预留金 | `ConsoleStoreProvider.stopServerInstance()` 内存 | 🔴 零结算 |
| **实例重启** | SkyPilot 重启容器 | 内存状态切换 | 🔴 零操作 |
| **配置升级** | 差价计算 → 余额检查 → SkyPilot 更新 | 无 | 🔴 未实现 |
| **保存镜像** | `docker commit` → 推送 registry → `custom_image` 表 | 无 | 🔴 未实现 |
| **日志查询** | `compute_task_log` 表 + Loki SSE | 无 | 🔴 未实现 |
| **事件时间线** | `compute_task_event` 表 | 无 | 🔴 未实现 |

### 2.2 缺失的数据模型

设计要求以下表结构在 `@workspace/db` 中定义（`container-cloud-instance-implementation.md` §2）：

| 表名 | 用途 | 是否已建 |
|------|------|---------|
| `compute_base` | 统一计算任务基础表（所有 K8s 产品线共享） | 🔴 未建 |
| `cloud_vm_detail` | 云主机扩展表 | 🔴 未建 |
| `compute_task_event` | 任务事件时间线 | 🔴 未建 |
| `compute_task_log` | 任务日志 | 🔴 未建 |
| `compute_task_worker` | Serverless Worker Pod | 🔴 未建 |
| `saved_template` | 用户保存的部署模板 | 🔴 未建 |
| `user_volume` | S3 存储卷 | 🔴 未建 |
| `preload_task` | 预加载任务 | 🔴 未建 |
| `preload_node_task` | 预加载节点子任务 | 🔴 未建 |

### 2.3 缺失的后端模块

| 模块 | 路径（按 AGENTS.md 规范） | 用途 |
|------|--------------------------|------|
| dataaccess/compute | `src/lib/server/dataaccess/compute/` | compute_base CRUD、状态机 |
| dataaccess/cloud-vm | `src/lib/server/dataaccess/compute/cloud-vm.ts` | 云服务器专用操作 |
| tRPC compute router | `src/lib/server/routers/compute.ts` | 所有 K8s 产品线统一路由 |
| SkyPilot 集成 | `src/lib/server/services/skypilot.ts` | SkyPilot REST API 封装 |
| 节点 Agent 集成 | `src/lib/server/services/node-agent.ts` | 镜像预拉取等节点操作 |

---

## 3. Serverless (弹性服务) 商业化差距

### 3.1 设计要求 vs 实现现状

| 功能模块 | 设计要求 | 实现现状 | 差距 |
|---------|---------|---------|------|
| **部署下单** | tRPC → 事务 → `compute_base` + `serverless_detail` → SkyPilot Serve | `setTimeout` 3000ms → `addInstance()` 内存 | 🔴 零后端 |
| **可中断调度** | `interruptible` 默认 true，跨区选区，`region_compliance_domain` 校验 | 前端 UI 勾选框，无后端逻辑 | 🔴 仅 UI |
| **跨区迁移** | `serverless_region_migration` 表 + 迁移状态机 + sticky URL | 无 | 🔴 未实现 |
| **扩缩容** | `scaleEndpoint` → 更新 min/max replicas | 前端 UI 控件，无后端 | 🔴 仅 UI |
| **Worker 管理** | `compute_task_worker` 表 + Pod 级查询 | 前端 Mock 数据 | 🔴 仅 UI |
| **存储挂载** | `user_volume` + S3 卷 + 本地盘 | 前端 UI，无后端 | 🔴 仅 UI |
| **余额/计费** | 同 Cloud VM | 同 Cloud VM | 🔴 同上 |
| **中断通知** | 站内信 + Webhook 必达通知 | 无 | 🔴 未实现 |
| **迁移计费** | 双跑只计新区，旧区 `billing_exclude` | 无 | 🔴 未实现 |
| **合规域** | `region_compliance_domain` + 同域约束 | 无 | 🔴 未实现 |
| **镜像预热联动** | 迁移前自动 preload | 无 | 🔴 未实现 |
| **SLA** | 通知 ≥60s、切流成功率 ≥99%/月 | 无 | 🔴 未实现 |

### 3.2 缺失的数据模型

| 表名 | 用途 | 是否已建 |
|------|------|---------|
| `serverless_detail` | 弹性服务扩展表（含 interruptible、region_policy） | 🔴 未建 |
| `serverless_region_migration` | 迁移审计表 | 🔴 未建 |
| `region_compliance_domain` | 合规域 | 🔴 未建 |

### 3.3 缺失的 API

设计要求的 tRPC 接口（`serverless-implementation.md` §7）：

| 接口 | 状态 |
|------|------|
| `createServerless` | 🔴 未实现 |
| `scaleEndpoint` | 🔴 未实现 |
| `updateEndpointConfig` | 🔴 未实现 |
| `listWorkers` | 🔴 未实现 |
| `getWorkerLogs` | 🔴 未实现 |
| `expandDataDisk` | 🔴 未实现 |
| `attachVolume` | 🔴 未实现 |
| `admin.forceMigrateServerless` | 🔴 未实现 |

---

## 4. Bare Metal (裸金属) 商业化差距

### 4.1 设计要求 vs 实现现状

| 功能模块 | 设计要求 | 实现现状 | 差距 |
|---------|---------|---------|------|
| **市场列表** | 从 `supplier_device` × `gpu_card_type` × `platform_card_price_record` 聚合 | 硬编码 `METAL_DEVICES` 静态数组 (14条) | 🟡 有 DB 下单但列表仍 Mock |
| **下单创建** | tRPC → 事务(锁设备+余额检查+扣款+INSERT 订单+事件) | ✅ `createMetalOrderAction` → `createMetalOrder` → 真实 DB | ✅ 基本可用 |
| **价格快照** | `bare_metal_order_price_snapshot` 表，冻结下单时价格 | 🔴 无，续费时按当前价 | 🔴 缺失 |
| **订单日志** | `bare_metal_order_log` 表，审计所有操作 | 🔴 无 | 🔴 缺失 |
| **自动续费** | 定时扫描 `next_billing_at` → 扣款 → 续期 → 重试 | 🔴 无 | 🔴 缺失 |
| **预提醒通知** | 到期前 N 天发送通知（按 billing_unit 分级） | 🔴 无 | 🔴 缺失 |
| **逾期处理** | 3 次重试 → overdue → 停机 → 充值恢复 | 🔴 无 | 🔴 缺失 |
| **券抵扣** | 校验 applicableBilling/minSpend → 扣减 | 前端硬编码券列表 + 后端未校验 | 🔴 仅前端 |
| **手动续费** | `renewNow` → 扣款 → 续期 | 前端 UI 无后端 | 🔴 仅 UI |
| **停止释放** | 更新设备状态 + 释放 | 前端内存操作 | 🔴 仅 UI |
| **提前释放退款** | 按剩余时长计算退款 | UI 有显示但无后端 | 🔴 仅 UI |
| **预约单** | 设备不可用 → 排队 → 运营手动交付 | 无 | 🔴 未实现 |

### 4.2 缺失的数据模型

| 表名 | 用途 | 是否已建 |
|------|------|---------|
| `bare_metal_order_price_snapshot` | 价格快照（续费定价依据） | 🔴 未建 |
| `bare_metal_order_log` | 操作审计日志 | 🔴 未建 |

### 4.3 缺失的后端逻辑

| 模块 | 说明 |
|------|------|
| 自动续费定时任务 | 每小时扫描到期订单，按 billing_unit 扣款 |
| 逾期重试机制 | 3 次重试策略 + 逾期停机 |
| 券适用性校验 | 后端校验 applicableBilling、minSpend、过期 |
| 设备分配自动化 | 从 `supplier_device` 锁定可用设备 |
| 提前释放退款计算 | 按剩余小时数计算退款金额 |

---

## 5. 通用基础设施差距

### 5.1 数据库 Schema 缺失

设计文档定义但 `@workspace/db` 中**未建**的核心表：

| 域 | 表名 | 设计文档 | 状态 |
|----|------|---------|------|
| **计算任务域** | `compute_base` | container-cloud §2.2 | 🔴 |
| | `cloud_vm_detail` | container-cloud §2.2 | 🔴 |
| | `serverless_detail` | serverless-implementation §3.1 | 🔴 |
| | `compute_task_event` | container-cloud §2.3 | 🔴 |
| | `compute_task_log` | container-cloud §2.4 | 🔴 |
| | `compute_task_worker` | container-cloud §2.5 | 🔴 |
| | `saved_template` | container-cloud §2.6 | 🔴 |
| **存储域** | `user_volume` | container-cloud §2.7 | 🔴 |
| **预拉取域** | `preload_task` | container-cloud §2.8 | 🔴 |
| | `preload_node_task` | container-cloud §2.9 | 🔴 |
| **裸金属扩展** | `bare_metal_order_price_snapshot` | bare-metal §6.4 | 🔴 |
| | `bare_metal_order_log` | bare-metal §6.4 | 🔴 |
| **Serverless 扩展** | `serverless_region_migration` | serverless-implementation §3.2 | 🔴 |
| | `region_compliance_domain` | serverless-implementation §3.3 | 🔴 |
| **计费展示扩展** | `tenant_bill` 新增字段 | billing-display §3.1 | 🔴 |
| | `tenant_bill_detail` 新增字段 | billing-display §3.1 | 🔴 |
| | `cost_daily` | billing-display §3.3 | 🔴 |
| | `cost_daily_detail` | billing-display §3.3 | 🔴 |
| | `cost_monthly` | billing-display §3.3 | 🔴 |
| | `coupon_billing_link` | billing-display §3.5 | 🔴 |
| | `platform_billing_daily` | billing-display §3.6 | 🔴 |
| | `platform_billing_monthly` | billing-display §3.6 | 🔴 |

### 5.2 tRPC Router 缺失

`apps/gpus` 当前**完全没有 tRPC 路由**，所有数据交互通过 Server Actions 或内存状态管理。按设计和 AGENTS.md 规范应建立的路由：

| 路由 | 覆盖功能 | 状态 |
|------|---------|------|
| `computeRouter` | createServer / stopServer / startServer / restartServer / upgradeConfig / saveImage / listInstances / getInstance / listEvents / getLogs | 🔴 |
| `serverlessRouter` | createServerless / scaleEndpoint / updateConfig / listWorkers / getWorkerLogs / listEndpoints / getEndpoint | 🔴 |
| `metalRouter` | createOrder / listOrders / getOrderDetail / stopOrder / renewNow / cancelOrder / setAutoRenew / listApplicableVouchers | 🔴 (Server Action 替代) |
| `billingRouter` | getOverview / getMonthlyBill / getDailyDetails / listCoupons | 🔴 |
| `rechargeRouter` | createPaymentOrder / handleCallback / listTransactions | ⚠️ 部分 (Server Action) |
| `inferenceRouter` | createEndpoint / listEndpoints / getEndpoint / regenerateApiKey | 🔴 |
| `jobRouter` | createJob / listJobs / getJob / stopJob | 🔴 |
| `storageRouter` | createVolume / expandVolume / attachVolume / detachVolume | 🔴 |
| `preloadRouter` | createPreload / listPreloads / getPreload / cancelPreload | 🔴 |
| `templateRouter` | saveTemplate / listTemplates / deleteTemplate | 🔴 |
| `voucherRouter` | listApplicable / applyVoucher | 🔴 |

### 5.3 Dataaccess 层缺失

按 AGENTS.md 规范的 `dataaccess/` 架构应建立：

| 子模块 | 路径 | 职责 |
|--------|------|------|
| compute | `src/lib/server/dataaccess/compute/` | compute_base + 产品线 detail CRUD |
| serverless | `src/lib/server/dataaccess/compute/serverless.ts` | serverless 专属 + 迁移 |
| recharge | `src/lib/server/dataaccess/recharge/` | 充值/支付流水 | (部分存在) |
| metal-order | `src/lib/server/dataaccess/metal-order/` | 裸金属订单 | (部分存在) |
| billing | `src/lib/server/dataaccess/billing/` | 账单聚合查询 |
| storage | `src/lib/server/dataaccess/storage/` | S3 卷管理 |
| preload | `src/lib/server/dataaccess/preload/` | 预拉取任务 |

### 5.4 计费集成缺失

| 功能 | 设计要求 | 实现状态 |
|------|---------|---------|
| **OpenMeter 部署** | 事件接收 + Meter 定义 + 查询 API | 🔴 未部署 |
| **5 分钟定时扣款** | 遍历 running 任务 → 查询增量用量 → 扣减余额 | 🔴 未实现 |
| **余额三层防超额** | L1 提交冻结 / L2 定时扣款 / L3 到期检查 | 🔴 未实现 |
| **余额并发控制** | `SELECT ... FOR UPDATE` 行级锁 | 🔴 未实现 |
| **日账单生成** | 每日 00:30 从 OpenMeter 聚合生成 | 🔴 未实现 |
| **月账单生成** | 每月 1 日汇总日账单 | 🔴 未实现 |
| **余额充足检查** | 查询 `tenant_balance` 表 | 🟡 裸金属有扣款但用直接 SQL |

### 5.5 前端数据源问题

| 数据 | 当前来源 | 应该来源 |
|------|---------|---------|
| Cloud VM 市场 | `MARKET_OFFERINGS` 硬编码 | DB: `data_center` × `gpu_card_type` × `sell_price` |
| Serverless GPU/区域 | `GPUS` / `REGIONS` 硬编码 | DB: `gpu_card_type` + `data_center` |
| Serverless 模板 | `TEMPLATES` 硬编码 | DB: `application_template` |
| Bare Metal 设备 | `METAL_DEVICES` 硬编码 | DB: `supplier_device` × `gpu_card_type` |
| 券列表 | `COMPUTE_VOUCHERS` / `METAL_VOUCHERS` 硬编码 | DB: `coupon` 表 (filtered by tenant) |
| 余额 | `MOCK_BALANCE = 0` | DB: `tenant_balance.available_balance` |
| 账单 | `MOCK_BILLING_DATA` 全零 | DB: `tenant_bill` + `tenant_bill_detail` |

### 5.6 货币单位不一致

| 数据文件 | 货币 | 问题 |
|---------|------|------|
| `gpu-data.ts` (Serverless/Apps) | USD (`$`) | 与设计文档不一致 |
| `server-market-data.ts` (Cloud VM) | CNY (`¥`) | 与设计一致 |
| `metal-market-data.ts` (Bare Metal) | CNY (`¥`) | 与设计一致 |
| `billing-data.ts` | USD (`$`) | 应为 CNY |

**设计文档全部使用 CNY**（`../../business/product-line-taxonomy.md`、`billing-display.md`、`recharge-flow-and-database-design.md`）。前端 `gpu-data.ts` 和 `billing-data.ts` 使用 USD 是错误的。

---

## 6. Inference (LLM 推理) 差距

### 6.1 设计要求

- 部署：模型参数 + 多副本 + API 端点 + Token 计费
- 推理网关：Traefik + ForwardAuth + API Key 认证
- 数据模型：`inference_detail` + `inference_deployment` + `inference_api_key` + `inference_usage_record`
- 计费：Token/请求 + GPU 时长混合计费

### 6.2 实现现状

**完全未实现** — 无前端页面、无后端逻辑、无数据模型。

### 6.3 缺失项

| 项目 | 状态 |
|------|------|
| Inference 前端页面 (`/inference/*`) | 🔴 |
| `inference_detail` 表 | 🔴 |
| `inference_deployment` 表 | 🔴 |
| `inference_api_key` 表 | 🔴 |
| `inference_usage_record` 表 | 🔴 |
| Traefik 推理网关集成 | 🔴 |
| API Key 管理 | 🔴 |
| Token 计费逻辑 | 🔴 |

---

## 7. Job (批处理任务) 差距

### 7.1 设计要求

- 提交脚本 + 运行到完成
- 可选 `billing_mode=spot`（闲时抢占，刊例价六折 / 乘数 0.60）
- 数据模型：`compute_base` + `job_detail` + `spot_detail`
- Spot 通知 + 重调度

### 7.2 实现现状

- `/tasks` 页面存在但使用 Mock 数据 (`tasks-data.ts`)
- 无 DB 集成
- 无 Spot 支持

### 7.3 缺失项

| 项目 | 状态 |
|------|------|
| Job 前端页面改造 | 🔴 |
| `job_detail` 表 | 🔴 |
| `spot_detail` 表 | 🔴 |
| Spot 调度集成 | 🔴 |
| Spot 抢占通知 | 🔴 |
| Job 完成检测 + 最终结算 | 🔴 |

---

## 8. 充值流程差距

### 8.1 已实现

| 项目 | 状态 |
|------|------|
| 充值页面 UI | ✅ 完整 |
| 对公转账创建 | ✅ `createRechargeOrderAction` |
| 支付订单查询 | ✅ `getRechargePageData` (真实 DB) |
| `@workspace/billing` 集成 | ✅ 基本可用 |

### 8.2 缺失项

| 项目 | 设计要求 | 状态 |
|------|---------|------|
| 微信支付对接 | `recharge-flow §5` | 🔴 仅 UI 占位 |
| 支付宝对接 | `recharge-flow §6` | 🔴 仅 UI 占位 |
| 支付回调端点 | `/api/payment/callback` | 🔴 |
| 对公转账核验 | `bank_transfer_verification` | 🔴 |
| 充值金额规则 | 最小 ¥1，最大 ¥100,000 | 🟡 |
| 确认后同步 recharge | `payment_order` → `recharge` | 🔴 |
| 余额事务流水 | `balance_transaction` 写入 | ⚠️ 裸金属有部分 |

---

## 9. 商业化上线最小可行路径 (MVP)

### 9.1 Phase 1: 数据模型 + Bare Metal 补全（预估 2-3 周）

| 优先级 | 任务 | 说明 |
|-------|------|------|
| P0 | `@workspace/db` 建 `compute_base` + `cloud_vm_detail` + `serverless_detail` | 核心表 |
| P0 | `@workspace/db` 建 `bare_metal_order_price_snapshot` + `bare_metal_order_log` | 裸金属补全 |
| P0 | `bare_metal_order` 补充 `ssh_enabled`、`ssh_public_key`、`auto_renew` 等字段 | 裸金属扩展 |
| P0 | Bare Metal 自动续费定时任务 | 续费扫描 + 扣款 + 重试 |
| P0 | Bare Metal 券抵扣后端校验 | `applicableBilling` + `minSpend` |
| P1 | Bare Metal 市场列表从 DB 查询 | 替换 `METAL_DEVICES` 硬编码 |
| P1 | Bare Metal 设备自动分配 | `supplier_device` 锁定 + 分配 |

### 9.2 Phase 2: Cloud VM + Serverless 购买流程（预估 3-4 周）

| 优先级 | 任务 |
|-------|------|
| P0 | 建立 `apps/gpus` tRPC Router 体系 |
| P0 | Cloud VM 下单流程: tRPC → 事务 → `compute_base` + `cloud_vm_detail` |
| P0 | Serverless 下单流程: tRPC → 事务 → `compute_base` + `serverless_detail` |
| P0 | Cloud VM 市场列表从 DB 聚合查询 |
| P0 | Serverless GPU/区域/模板从 DB 查询 |
| P1 | SkyPilot REST API 集成（调度/取消/重启） |
| P1 | 余额冻结 + 按量计费定时扣款 |
| P1 | 券抵扣后端集成 |

### 9.3 Phase 3: 计费体系（预估 2-3 周）

| 优先级 | 任务 |
|-------|------|
| P0 | OpenMeter 部署 + Meter 定义 |
| P0 | 5 分钟定时扣款服务 |
| P0 | 余额三层防超额 |
| P0 | 日账单生成 + 月账单生成 |
| P1 | `billing-data.ts` 替换 Mock → 真实 DB 查询 |
| P1 | 计费详情页实现 (`/billing/details`) |
| P1 | `tenant_bill` 系列表扩展字段 |

### 9.4 Phase 4: 充值 + 支付（预估 2-3 周）

| 优先级 | 任务 |
|-------|------|
| P0 | 微信支付 SDK 集成 |
| P0 | 支付宝 SDK 集成 |
| P0 | 支付回调端点 |
| P1 | 对公转账核验流程 |
| P1 | `balance_transaction` 完整流水 |

### 9.5 Phase 5: Inference + Job + Serverless 高级特性（预估 4-6 周）

| 优先级 | 任务 |
|-------|------|
| P1 | Inference 前端 + 后端 + 推理网关 |
| P1 | Job + Spot 调度 |
| P2 | Serverless 跨区迁移 |
| P2 | Serverless 合规域 + SLA |
| P2 | 预加载镜像 |
| P2 | S3 存储卷 |

---

## 10. 设计文档中已定义但前端未实现的 UI 交互

### 10.1 Cloud VM 未实现的前端交互

| 交互 | 设计来源 | 当前状态 |
|------|---------|---------|
| 实例启动/停止/重启按钮 → 调用后端 API | container-cloud §3.3 | 仅内存操作 |
| 配置升级对话框（GPU/磁盘变更 → 差价计算） | container-cloud §3.4 | 有 UI 无后端 |
| 保存镜像对话框 | container-cloud §3.5 | 有 UI 无后端 |
| 实例日志面板（SSE 流式） | container-cloud §10 | 无 |
| 事件时间线面板 | container-cloud §10 | 无 |
| 节点事件面板 | container-cloud §10 | 无 |

### 10.2 Serverless 未实现的前端交互

| 交互 | 设计来源 | 当前状态 |
|------|---------|---------|
| 可中断调度开关 + 区域策略选择 | serverless §2.3 | 勾选框无后端 |
| Worker 列表（Pod 级） | serverless §4.2 | Mock 数据 |
| Worker 日志（Pod 级） | serverless §4.2 | 无 |
| 扩缩容配置 | serverless §4.2 | UI 控件无后端 |
| 配置更新（滚动更新） | serverless §4.2 | UI 无后端 |
| 数据盘扩容 | serverless §8 | UI 无后端 |
| S3 卷挂载/更换 | serverless §8 | UI 无后端 |
| 跨区迁移通知面板 | serverless §5 | 无 |

### 10.3 Bare Metal 未实现的前端交互

| 交互 | 设计来源 | 当前状态 |
|------|---------|---------|
| 自动续费开关 | bare-metal §4.1 | UI 无后端 |
| 手动续费 | bare-metal §4.1 | UI 无后端 |
| 续费时指定券 | bare-metal §3.3 | 无 |
| 提前释放（退款计算） | bare-metal §2 | UI 有显示无后端 |
| 预约单排队状态 | bare-metal §5.2 | 无 |

---

## 11. 前端硬编码数据清单

需要从 DB 动态查询替换的前端硬编码：

| 文件 | 硬编码内容 | 应替换为 |
|------|-----------|---------|
| `lib/server-market-data.ts` | `MARKET_OFFERINGS` (15条) | tRPC `compute.listOfferings` |
| `lib/server-market-data.ts` | `BASE_IMAGES` | tRPC `image.listBase` |
| `lib/server-market-data.ts` | `COMPUTE_VOUCHERS` | tRPC `voucher.listApplicable` |
| `lib/metal-market-data.ts` | `METAL_DEVICES` (14条) | tRPC `metal.listOfferings` |
| `lib/metal-market-data.ts` | `METAL_VOUCHERS` | tRPC `voucher.listApplicable` |
| `lib/metal-market-data.ts` | `METAL_ENV_TEMPLATES` | tRPC `template.listEnv` |
| `lib/gpu-data.ts` | `GPUS` (8条) | tRPC `compute.listGpuTypes` |
| `lib/gpu-data.ts` | `REGIONS` (3条) | tRPC `compute.listRegions` |
| `lib/gpu-data.ts` | `TEMPLATES` (4条) | tRPC `template.list` |
| `lib/gpu-data.ts` | `COMMITMENT_OPTIONS` | 常量 (可保留) |
| `lib/apps-data.ts` | `APP_TEMPLATES` | tRPC `template.listApps` |
| `lib/billing-data.ts` | `MOCK_BILLING_DATA` | tRPC `billing.getOverview` |
| `lib/recharge-data.ts` | (部分 Mock) | tRPC `recharge.listTransactions` |
| `lib/tasks-data.ts` | (全部 Mock) | tRPC `job.list` |

---

## 12. 设计文档间的语义权威约束

实现时必须遵守的优先级（`INDEX.md` §1.1）：

```
1. ../../business/product-line-taxonomy.md      ← 产品线 / billing_mode / commitment 枚举唯一定义
2. tenant-balance-unification.md ← 余额模型 (tenant_balance, tenant_id PK)
3. spot-preemption-design.md     ← Spot 仅 job；抢占必须通知租户
```

**关键约束**：
- `billing_mode=spot` **仅允许** `product_line='job'` + `commitment='on-demand'`
- Serverless `interruptible` **不等于** `billing_mode=spot`，禁止混用
- `product_line` 禁止写入：`elastic_service`、`spot`（作为 product_line）、`serverless_inference`
- 券类型禁止 `hours`，统一用 `resource_pack` + `pack_unit='gpu_hour'`
- 所有余额操作必须通过 `@workspace/billing` 原语，禁止业务直写余额表

---

## 13. 附录：设计文档完整清单

| # | 文件 | 商业化相关章节 | 关键内容 |
|---|------|--------------|---------|
| 1 | `00-overview.md` | §3.1-3.3 | 产品导航、计费模式、资金流 |
| 2 | `../../business/product-line-taxonomy.md` | 全文 | 产品线/billing_mode/commitment 权威枚举 |
| 3 | `tenant-balance-unification.md` | 全文 | 余额模型、freeze/consume/deduct 原语 |
| 4 | `container-cloud-instance-implementation.md` | §1-13 | Cloud VM/Serverless/Bare Metal/Job 全实现 |
| 5 | `serverless-implementation.md` | 全文 | Serverless 可中断调度/迁移/商业化 |
| 6 | `../../business/bare-metal-order-commercialization.md` | 全文 | 裸金属下单/续费/券/自动交付 |
| 7 | `billing-display.md` | 全文 | 账单展示/折扣/OpenMeter/日月账单 |
| 8 | `recharge-flow-and-database-design.md` | 全文 | 充值/支付/余额入账 |
| 9 | `spot-preemption-design.md` | 全文 | Spot 抢占与闲时回收 |
| 10 | `serverless-inference.md` | 全文 | LLM 推理/网关/API Key |
| 11 | `image-and-template-management.md` | §3,§8 | 镜像管理/应用模板/前端路由 |
| 12 | `storage-quota-and-s3-volume.md` | 全文 | 镜像限额/数据盘/S3卷 |
| 13 | `database-design.md` | §9 | 共享交易层表结构 |
| 14 | `gpus-database-and-skypilot.md` | §1-2 | 前端类型→后端表映射/SkyPilot交互 |
| 15 | `compute-task-decoupling-analysis.md` | 全文 | compute_base 分层 |
| 16 | `multi-tenancy-architecture.md` | 全文 | 四层组织模型/权限 |
| 17 | `api-design-reference.md` | 全文 | REST API 设计参考 |
| 18 | `node-agent-design.md` | 全文 | 节点 Agent/镜像预拉取 |
