# 飞书工单「所属模块」与「工单分类」设计

> **状态**：Phase 1 已落地（设备上架 · 新建上架批次）；设备下架 / 订单接入待 Phase 2。  
> **关联**：[feishu-integration-design.md](feishu-integration-design.md) §5.11、[feishu-bitable-automation-inbound-design.md](feishu-bitable-automation-inbound-design.md)

---

## 1. 背景

运营侧飞书多维表格工单表包含 **所属模块**、**工单分类** 两列，须与 CRM 建单时用户选择及批次类型一致，不可仅依赖 Settings 全局默认值。

| Bitable 列 | CRM `field_key` | 用户是否可选 | 说明 |
|------------|-----------------|--------------|------|
| 所属模块 | `module` | **是** | 下拉 8 项，见 §2.1 |
| 工单分类 | `category` | **否（系统推导）** | 仅两类规范值，见 §2.2 |

---

## 2. 枚举与推导规则

### 2.1 所属模块（用户下拉）

须与飞书 Bitable 单选选项**完全一致**（含标点）：

1. 服务部署/云主机/裸金属短租
2. 资源接入（**设备上架默认**）
3. 人工撮合转售
4. 内部办公软件
5. 用户需求处理
6. 内部资源调度
7. 集群上下线
8. 集群水位调整

常量：`FEISHU_WORK_ORDER_MODULE_OPTIONS`（`apps/web/src/lib/types/feishu-work-order.ts`）

### 2.2 工单分类（系统推导，不可手填）

| 规范值 | 适用场景 |
|--------|----------|
| **集群机器上下架** | 设备上架、订单接入、设备下架 / 机房裁撤（`batch_kind ∈ {online, order_access, device_retire}`） |
| **集群上下线** | 非上述批次类型，且所属模块为「集群上下线」或「集群水位调整」时的集群运维类工单（Phase 2+） |

推导函数：`resolveFeishuWorkOrderCategory({ batchKind, workOrderModule })`

**设备上架**：无论用户选哪个所属模块，工单分类恒为 **集群机器上下架**。

---

## 3. 数据模型

### 3.1 持久化

写入 `onboarding_batch.metadata.work_order`（JSONB，无需新列）：

```json
{
  "work_order": {
    "module": "资源接入",
    "category": "集群机器上下架"
  },
  "feishu": { "create_status": "pending" }
}
```

类型：`BatchWorkOrderMeta`

### 3.2 API / Schema

| 层 | 字段 | 约束 |
|----|------|------|
| tRPC `onboardingBatch.create` | `workOrderModule` | `batch_kind=online` 时 **必填**，枚举校验 |
| `OnboardingBatchCreateInput` | `workOrderModule?` | 同上 |

---

## 4. 出站（CRM → 飞书 Bitable）

### 4.1 映射优先级

`work-order-bitable-mapper.resolveFieldValues`：

| field_key | 优先级 |
|-----------|--------|
| `module` | `metadata.work_order.module` → Settings `defaults_json.module` → `资源接入` |
| `category` | `metadata.work_order.category` → `resolveFeishuWorkOrderCategory(batch)` → Settings 默认 |

**关键变更**：批次级 `work_order` 优先于 Settings 全局默认，避免所有工单落同一模块/错误分类。

### 4.2 流程（不变）

```text
createBatch (auto)
  → INSERT onboarding_batch（含 metadata.work_order）
  → buildWorkOrderBitableRecordFields
  → POST bitable record
  → 读回 ticket_no → work_order_no
```

---

## 5. UI 改造范围

### 5.1 Phase 1 ✅ 设备上架 · 新建上架批次

**组件**：`onboarding-batch-wizard-dialog.tsx`（`routeKind=online-tasks`）

| 表单项 | 类型 | 必填 | 默认 |
|--------|------|------|------|
| 工单所属模块 | Select | 是 | 资源接入 |
| 上架原因 | Select | 是 | — |

辅助文案：同步飞书时将写入所属模块；工单分类固定为「集群机器上下架」。

### 5.2 Phase 2 待办

| 对话框 | 组件 | 工单分类 | 状态 |
|--------|------|----------|------|
| 设备下架 / 机房裁撤 | `datacenter-device-retire-dialog.tsx` | 集群机器上下架 | **已接** `workOrderModule` 下拉 |
| ~~设备下架 / 供应商域~~ | ~~`supplier-device-retire-dialog.tsx`~~ | — | **已移除**（Legacy 供应商 Excel 下架，2026-07-08） |
| 订单接入 | `onboarding-batch-wizard-dialog.tsx`（`order-access`） | 集群机器上下架 | 待 Phase 2 |
| 内部占用 | `internal-occupancy-batch-create-dialog.tsx` | 待定（通常 集群机器上下架） | 待 Phase 2 |

各对话框复用同一 `FEISHU_WORK_ORDER_MODULE_OPTIONS` 与 `resolveFeishuWorkOrderCategory`。

---

## 6. Settings 与默认值

Settings「飞书工单映射」中 `defaults_json.module` / `category` 仍作 **兜底**（无批次级 `work_order` 的历史数据、内部脚本建单等）。

建议运营将 Settings 默认分类改为 **集群机器上下架**（原设计文档 §5.11.1 写「技术支持」已过时）。

---

## 7. 验收清单（Phase 1）

- [ ] 新建上架批次对话框展示「工单所属模块」下拉，8 项可选，默认「资源接入」
- [ ] 未选模块时「确认」按钮禁用，服务端返回校验错误
- [ ] 创建批次后 `metadata.work_order.module` / `category` 正确落库
- [ ] 自动建单（Bitable）出站记录：`所属模块`=用户所选，`工单分类`=集群机器上下架
- [ ] 手工填工单号模式同样持久化 `work_order`（供后续重试 / 审计）

---

## 8. 文件索引

| 文件 | 变更 |
|------|------|
| `lib/types/feishu-work-order.ts` | 模块/分类常量、`resolveFeishuWorkOrderCategory`、`readBatchWorkOrderMeta` |
| `lib/server/routers/supplier/onboarding-batch-schemas.ts` | `workOrderModule` 校验 |
| `lib/types/onboarding-batch-api.ts` | 类型扩展 |
| `lib/server/dataaccess/supplier/onboarding-batch.ts` | 创建时写入 `metadata.work_order` |
| `lib/server/integrations/feishu/work-order-bitable-mapper.ts` | 出站优先读批次级字段 |
| `supplier/_components/onboarding-batch-wizard-dialog.tsx` | Phase 1 UI |
