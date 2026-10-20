# 平台孤儿 — 匹配规则与自动导入机房设备设计方案

> 版本：v1.0（草案）  
> 日期：2026-06-22  
> 状态：**待确认后实施**  
> 性质：在既有 **设备平台探测 / 对账**（CM-7 平台孤儿）之上，增加 **可配置命名规则 → 机房映射 → 预览入库** 能力，将 K8s（及少量接入端/裸金属）孤儿补录为 CRM `supplier_device` 主数据。

**关联文档**：

- [supplier-device-platform-probe-design.md](supplier-device-platform-probe-design.md) — 平台探测、孤儿反扫、`missing_crm`（v1.5 CM-7 ✅）
- [supplier-device-import-schema.md](supplier-device-import-schema.md) — 库存设备 Excel 导入与 `gpu_card_type` 解析（R-DI8）
- [supplier-datacenter-import-design.md](supplier-datacenter-import-design.md) — 机房主数据与 `container_instance_region`
- [supplier-device-ops-pool-masterdata-design.md](supplier-device-ops-pool-masterdata-design.md) — 主数据真源边界（探测 **不自动回写** ops，导入 **允许** 人工设定初始 ops）

**关联实现（现状）**：

- UI：`apps/web/src/app/[locale]/(protected)/supplier/device-platform-probe/`
- 孤儿构建：`device-platform-probe-build.ts#buildOrphanSnapshots`
- 列表/详情：`device-platform-probe-content.tsx`、`device-platform-probe-detail-content.tsx`
- 设备入库：`device-import.ts#commitInventory`

---

## 1. 背景与问题

### 1.1 典型场景

设备对账列表中会出现 **平台孤儿**（`record_kind = platform_orphan`，`consistency_flag = missing_crm`）：平台侧（多为 K8s `node_device/list`）有记录，CRM 库存无对应 `supplier_device`。

K8s 节点命名常带 **集群/租户前缀**，形如 `{prefix}:{node}`：

| K8s `device_name` 示例 | 业务机房（人工认知） |
|------------------------|----------------------|
| `fjsq:fjsq-p1-worker-17` | 内蒙一区 |
| `gdeq-tent:gj-virtual-node` | 华南二区 |
| `liblib-ack:i-5a5s2ra730m1epj8o7atvwp9w` | 广东二区 |

当前实现中：

1. 孤儿行 `sn` 优先取 K8s `device_name`（见 `buildOrphanSnapshots`），故列表第一列可直接看到上述格式。
2. **K8s 孤儿无法通过 `idc_key` 反查机房**（仅接入端/裸金属 staging 带 `idc_key`）；`data_center_id` / `data_center_name` 常为空。
3. `suggested_action` 为固定文案：「平台/订单有记录但 CRM 无对应库存设备，请补主数据或确认平台是否应下线」，**无法指导按前缀归属机房**。
4. 补录主数据仍依赖 **Excel 设备导入** 或手工流程，与对账页割裂，运营需反复抄 SN / IP。

### 1.2 业务目标

| # | 目标 | 说明 |
|---|------|------|
| G1 | **可配置匹配规则** | 用户维护「命名模式 → 目标机房」规则，支持前缀/正则等 |
| G2 | **对账页一键预览入库** | 从最新孤儿快照选中（或批量）生成 `supplier_device` 预览，确认后写入 |
| G3 | **规则可解释** | 预览行展示命中哪条规则、目标机房、冲突原因 |
| G4 | **与探测闭环** | 入库后下一轮探测应从 `platform_orphan` 变为 `crm_inventory`（按 IP + region 匹配） |
| G5 | **审计可追溯** | 记录导入批次、操作人、来源 probe snapshot / 规则版本 |

### 1.3 非目标（本期）

- **不**在探测 Cron 内 **静默自动入库**（默认必须 preview → commit；可选二期「自动导入开关」见 §8.3）
- **不**根据平台信号 **自动修改** 已存在设备的 `ops_status` / `lifecycle_status`
- **不**调用平台 API 下线/删除孤儿节点
- **不**替代完整 Excel 导入（缺字段用规则默认值 + 人工补全，见 §5）
- **不**处理 `probe_status = ambiguous` 的 staging 行（仍不占 claimed，不进入导入候选）

---

## 2. 规则模型

### 2.1 概念

```
平台孤儿 snapshot
    → 提取 match_text（默认 k8s_device_name 或 sn）
    → 按 priority 逐条匹配 enabled 规则
    → 命中则得到 target_data_center_id + 默认字段模板
    → preview（create | skip | error）
    → commit → supplier_device + onboarding_batch
    → 可选：probe 快照关联 supplier_device_id（仅审计，下轮 job 自然重算）
```

### 2.2 匹配字段（`match_field`）

| 值 | 来源 | 适用孤儿类型 |
|----|------|--------------|
| `k8s_device_name` | `device_platform_probe_snapshot.k8s_device_name` | K8s 孤儿（**默认**） |
| `sn` | `snapshot.sn` | 全类型；K8s 孤儿与 `k8s_device_name` 通常相同 |
| `internal_ip` | `snapshot.internal_ip` | IP 段规则（慎用，易误匹配） |
| `proxy_platform_device_id` | `proxy_platform_device_id` | 接入端孤儿 |
| `bare_metal_order_no` | `bare_metal_order_no` | 裸金属孤儿 |

**默认策略**：`match_field = k8s_device_name`；若为空则 fallback `sn`。

### 2.3 匹配算子（`match_operator`）

| 算子 | 参数 | 示例 | 说明 |
|------|------|------|------|
| `prefix` | `match_value` 字符串 | `fjsq:` | `match_text` 以该前缀开头（**大小写敏感**，与平台一致） |
| `prefix_ignore_case` | 同上 | `FJSQ:` | 忽略大小写前缀 |
| `suffix` | 字符串 | `-worker` | 后缀匹配 |
| `contains` | 字符串 | `virtual-node` | 子串包含 |
| `exact` | 字符串 | `gdeq-tent:gj-virtual-node` | 全等 |
| `regex` | 正则（RE2 语义） | `^fjsq:fjsq-p\d+-worker-\d+$` | 命中组 0；**仅 admin 可配**，需校验编译 |

**推荐**：运营首选 `prefix` + `prefix:` 形式（含冒号），与现有三节命名一致，避免跨集群误伤。

### 2.4 规则作用域

| 字段 | 说明 |
|------|------|
| `supplier_id` | **可选**；非空时仅匹配该供应商下机房；空表示全局（须 admin） |
| `presence_channel` | 可选过滤：`k8s_only` \| `proxy_only` \| `any`（默认 `any`） |
| `enabled` | 停用后不参与匹配 |

### 2.5 优先级与冲突

- 规则按 **`priority` 升序**（数字越小越优先）评估，**首条命中即停止**。
- 同一 `(supplier_id, match_field, match_operator, match_value)` 在 enabled 状态下 **唯一**（DB UK）。
- 预览时若 **零规则命中** → 行状态 `unmatched`（不入库，可导出）。
- 若 **多条规则同 priority 且均命中**（配置错误）→ preview `error`，commit 阻断。

### 2.6 内置示例规则（种子数据，可导入模板）

| 规则名 | match_operator | match_value | 目标机房（示例名） |
|--------|----------------|-------------|-------------------|
| 内蒙一区 FJSQ 集群 | `prefix` | `fjsq:` | 内蒙一区 |
| 华南二区 GDEQ 租户 | `prefix` | `gdeq-tent:` | 华南二区 |
| 广东二区 Liblib ACK | `prefix` | `liblib-ack:` | 广东二区 |

> 目标机房以环境中 `data_center.name` 下拉选择为准；种子数据 **不硬编码 ID**，仅提供 CSV/JSON 模板。

---

## 3. 导入字段映射（孤儿 → `supplier_device`）

### 3.1 直接映射

| CRM 字段 | 来源 |
|----------|------|
| `sn` | 优先 `k8s_device_name`；否则 `sn`；**不得**使用 `ORPHAN-{ip}` 合成值入库（合成 SN 行标记 `error`） |
| `internal_ip` | `snapshot.internal_ip`（必填，非空） |
| `data_center_id` | 命中规则的 `target_data_center_id` |
| `supplier_id` | `data_center.supplier_id` |
| `idc_code` | `data_center.code` |
| `idc_region` | `data_center.location` 或 `region_tags[0]` |
| `gpu_count` | K8s payload `gpu_count`；缺省用规则模板或 `8` |
| `platform_resource_id` | K8s `platform_node_id` 或 proxy `platform_device_id`（可选） |

### 3.2 规则模板默认值（`default_fields_json`）

规则上配置 JSON，用于补齐 Excel 导入必填项：

```json
{
  "gpu_card_type_id": "uuid",
  "ops_status": "预留闲置中",
  "lifecycle_status": "在线",
  "onboarding_substage": "已完成",
  "cooperation_type": "idle_time",
  "device_purpose": "平台孤儿补录",
  "in_maintenance": false
}
```

| 字段 | 规则 |
|------|------|
| `gpu_card_type_id` | **必填**；或启用「按 K8s `gpu_name` 自动匹配卡型」（复用 R-DI8 名称/编码匹配，失败则 preview 失败行） |
| `ops_status` | 默认 `预留闲置中`；**不**从平台 `rent_status` 推导 |
| `lifecycle_status` | 默认 `在线` |
| `asset_no` | 默认 `sn`；若与已有 `asset_no` UK 冲突 → `error` |
| `external_device_id` | 空 |
| `contract_id` | 空或规则指定 |

### 3.3 可选 `compute_node` 行

若 K8s `device_name` 含 `:`，可解析：

- `cluster_name` = 冒号前段（如 `fjsq`）
- `node_name` = 冒号后段（如 `fjsq-p1-worker-17`）
- `node_role` = `Worker`

写入 `compute_node`（与 Excel 导入一致），便于后续集群视图。

### 3.4 幂等与冲突

| 检测键 | 行为 |
|--------|------|
| `sn` 已存在 | `skip` + warning「SN 已存在」或 `error`（可配置：默认 **error** 阻断单行） |
| `internal_ip` 在同供应商已存在 | `warning` + 允许继续（与 R-DI8 IP 复用卡型策略一致） |
| 同批重复 SN | `error` |

**设计原则**：与 [supplier-device-import-schema.md](supplier-device-import-schema.md) 一致 — preview 有 error 则禁用 commit。

---

## 4. 数据库设计

新增表建议落在 `packages/db/src/supply-schema.ts`（或独立 `probe-schema` 段）。

### 4.1 `device_platform_orphan_import_rule`

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | |
| `name` | varchar(128) NOT NULL | 规则展示名 |
| `supplier_id` | text FK → `supplier.id` NULL | 空=全局 |
| `enabled` | boolean NOT NULL DEFAULT true | |
| `priority` | integer NOT NULL DEFAULT 100 | 越小越优先 |
| `match_field` | varchar(32) NOT NULL | §2.2 |
| `match_operator` | varchar(32) NOT NULL | §2.3 |
| `match_value` | varchar(255) NOT NULL | |
| `presence_channel` | varchar(16) DEFAULT `'any'` | |
| `target_data_center_id` | text NOT NULL FK → `data_center.id` | |
| `default_fields_json` | jsonb NOT NULL DEFAULT `{}` | §3.2 |
| `auto_gpu_match_from_k8s` | boolean DEFAULT false | 用 `k8s_payload.gpu_name` 匹配卡型 |
| `remark` | text | |
| `created_by_staff_id` | text | |
| `updated_by_staff_id` | text | |
| `created_at` / `updated_at` | timestamptz | |

**索引 / 约束**：

- UNIQUE `(coalesce(supplier_id,''), match_field, match_operator, match_value)` WHERE `enabled = true`（或全表 UK + 软删）
- INDEX `(enabled, priority)`
- INDEX `(target_data_center_id)`

### 4.2 `device_platform_orphan_import_batch`

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | |
| `batch_code` | varchar(64) UK | 如 `ORPHAN-IMP-20260622-001` |
| `snapshot_hour` | timestamptz | 来源探测快照小时 |
| `source_job_run_id` | text FK | 可选，关联 `device_platform_probe_job_run` |
| `status` | varchar(16) | `preview` \| `committed` \| `failed` |
| `rule_ids_json` | jsonb | 本次使用的规则 ID 快照 |
| `preview_rows_json` | jsonb | 预览行（含 probe_snapshot_id、rule_id、action） |
| `committed_device_count` | integer | |
| `operator_staff_id` | text | |
| `committed_at` | timestamptz | |
| `created_at` | timestamptz | |

### 4.3 `device_platform_orphan_import_link`（审计）

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | text PK | |
| `batch_id` | text FK | |
| `probe_snapshot_id` | text FK → `device_platform_probe_snapshot.id` | 导入时孤儿行 ID |
| `supplier_device_id` | text FK | 写入后的设备 |
| `matched_rule_id` | text FK | |
| `created_at` | timestamptz | |

### 4.4 `onboarding_batch` 扩展

新增 `batch_kind` 枚举值：`platform_orphan_import`（与 `device_inventory` 并列），便于批次列表筛选；**禁止**指向 online/order_access 业务批次（与现有约束一致）。

---

## 5. 服务层与 API

### 5.1 模块划分

| 模块 | 路径（建议） | 职责 |
|------|--------------|------|
| 规则 CRUD | `device-platform-orphan-import-rules.ts` | 列表/创建/更新/排序/启停 |
| 规则引擎 | `device-platform-orphan-rule-matcher.ts` | 纯函数：`matchOrphanSnapshot(row, rules)` |
| 预览 | `device-platform-orphan-import-preview.ts` | 拉孤儿 + 匹配 + 冲突检测 |
| 提交 | `device-platform-orphan-import-commit.ts` | 事务写 `supplier_device` / `compute_node` / batch / link |
| tRPC | `supplier.devicePlatformOrphanImport.*` | 见 §5.2 |

### 5.2 tRPC 接口（草案）

| 方法 | 权限 | 说明 |
|------|------|------|
| `rules.list` | supply | 分页，含机房名、供应商名 |
| `rules.create` / `update` / `delete` | admin | 校验 regex、机房归属 |
| `rules.reorder` | admin | 批量更新 priority |
| `rules.test` | supply | 输入 sample `device_name`，返回命中规则（规则页调试） |
| `import.preview` | supply | input: `snapshotHour?`, `probeIds?`, `orphansOnly=true` |
| `import.commit` | supply | input: `batchId` 或 重传 preview token + 确认勾选行 |
| `import.listBatches` | supply | 历史批次 |

**preview 输出行结构**（与现有 import preview 对齐）：

```typescript
type OrphanImportPreviewRow = {
  probeSnapshotId: string
  sn: string
  internalIp: string
  k8sDeviceName: string | null
  probeStatus: ProbeStatus
  presence: ProbePresence
  matchedRuleId: string | null
  matchedRuleName: string | null
  targetDataCenterId: string | null
  targetDataCenterName: string | null
  gpuCardTypeId: string | null
  gpuCardTypeLabel: string | null
  action: 'create' | 'skip' | 'error' | 'unmatched'
  messages: string[]
}
```

### 5.3 预览数据源

| 策略 | 说明 |
|------|------|
| 默认 | 取 `device_platform_probe_state.last_snapshot_hour` 下 **全部** `record_kind=platform_orphan` 且 `consistency_flag=missing_crm` |
| 筛选 | 支持列表页传入 `probeIds`（勾选行批量导入） |
| 排除 | 已存在于 `device_platform_orphan_import_link` 且对应设备仍有效的 snapshot（可选「允许重复预览」） |

### 5.4 commit 事务步骤

```text
BEGIN
  INSERT onboarding_batch (batch_kind = platform_orphan_import, ...)
  FOR each preview row WHERE action = create:
    INSERT supplier_device (...)
    OPTIONAL INSERT compute_node (...)
    INSERT device_platform_orphan_import_link (...)
  UPDATE device_platform_orphan_import_batch SET status = committed, ...
COMMIT
-- 异步或同事务后：refreshSupplierGpuInventoryForDataCenters
-- 不修改 probe snapshot；等待下次 Cron 重算
END
```

---

## 6. UI 设计

入口均挂在 **供应域 → 设备平台探测**（`/supplier/device-platform-probe`）下，与现有列表/详情一致。

### 6.1 规则管理（设置抽屉 / 子页）

**路径建议**：`/supplier/device-platform-probe/import-rules` 或列表页右上角「匹配规则」。

| 区块 | 内容 |
|------|------|
| 规则表格 | 名称、匹配字段、算子、匹配值、目标机房、优先级、启用、操作 |
| 新建/编辑表单 | 下拉选机房（按供应商过滤）；默认值折叠面板（ops、lifecycle、卡型）；「从 K8s GPU 名匹配卡型」开关 |
| 调试区 | 输入 `device_name` 试匹配，即时展示命中规则 |
| 导入模板 | 下载/上传 JSON 规则包（可选二期） |

**权限**：查看 supply；增删改 admin（与 `runNow` 探测一致）。

### 6.2 列表页增强（`device-platform-probe-content.tsx`）

| 能力 | 说明 |
|------|------|
| 列：匹配规则 | 对孤儿行调用 matcher（只读），展示「已匹配：内蒙一区 / 未匹配」 |
| 筛选：可规则导入 | `matchableOnly` — 至少命中一条 enabled 规则 |
| 批量操作 | 勾选孤儿 →「预览导入机房设备」 |
| 主按钮 | 「孤儿导入向导」— 打开 preview 对话框 |

### 6.3 导入向导（Dialog / Wizard）

**Step 1 — 范围**：最新快照 / 当前筛选 / 已勾选；展示 orphan 数量。

**Step 2 — 预览表格**：

| SN / device_name | IP | 命中规则 | 目标机房 | 卡型 | 状态 | 说明 |
|------------------|-----|----------|----------|------|------|------|

- 状态色：`create` 绿、`unmatched` 灰、`error` 红、`skip` 黄
- 未匹配行：链到规则设置
- error 行：可 inline 选手工卡型（复用 R-DI8 下拉，仅失败行）

**Step 3 — 确认**：摘要（将创建 N 台）；确认后 commit；成功 toast + 跳转批次详情或刷新列表。

### 6.4 详情页（孤儿）

在 `device-platform-probe-detail-content.tsx` 对 `isOrphan` 增加：

- 展示「规则匹配结果」（命中/未命中 + 规则名）
- 按钮「导入为机房设备」（单条 preview → 简化 confirm）

仍 **不提供**「实时重新探测」（与现网一致，孤儿不支持 live reprobe）。

### 6.5 探测列表建议文案增强（可选，轻量）

当 matcher 命中规则时，扩展 `suggested_action`：

```text
命中规则「内蒙一区 FJSQ 集群」→ 可导入机房「内蒙一区」；或使用「孤儿导入向导」批量补录主数据。
```

实现：`buildOrphanSnapshots` **不修改**；列表 API 层 join 规则 matcher 动态拼接（避免 snapshot 表膨胀）。

---

## 7. 与平台探测的协作

### 7.1 入库后的对账变化

下一轮 `device_platform_probe` job（或手动「立即探测」）：

1. 新 `supplier_device` 进入 `staging_inventory`（需 `internal_ip` + `data_center.container_instance_region` 完整）。
2. K8s staging 行通过 `(region_key, ip_host)` 或 PO-4 复核被 **claimed**。
3. 原 IP 的 `platform_orphan` 行 **不再生成**（staging 被占用）。
4. 出现 `crm_inventory` 行，`presence_crm=true`，按 CM-1 矩阵评估 consistency。

**前置条件**：目标机房必须配置 `container_instance_region` 与 K8s `region` 一致；否则入库后仍为 `dc_unmapped` / 匹配失败。规则保存时 **校验** 机房已配置 region，否则 warning。

### 7.2 机房 region 与命名规则的关系

| 机制 | 作用 |
|------|------|
| 命名规则 | 解决「**CRM 不知道是哪台机房**」 |
| `container_instance_region` | 解决「**CRM 设备与 K8s staging 如何 Join**」 |

两者 **互补**：规则只负责 `data_center_id`；Join 仍依赖 datacenter 主数据配置（见 [supplier-datacenter-import-design.md](supplier-datacenter-import-design.md) §3）。

### 7.3 不建议在 Cron 内同步入库的原因

- 卡型、ops 初始值属于 **主数据决策**，需人工确认（D1 边界）。
- 误配规则会造成批量脏数据；preview 是安全阀。
- 与「探测与真源分离」原则一致（[supplier-device-platform-probe-design.md](supplier-device-platform-probe-design.md) §1.2）。

---

## 8. 分期实施

### 8.1 Phase 1（MVP）

- [ ] 表 `device_platform_orphan_import_rule` + CRUD API + 规则管理 UI
- [ ] `prefix` / `exact` / `contains` 算子
- [ ] preview + commit（批量向导 + 列表勾选）
- [ ] `onboarding_batch.batch_kind = platform_orphan_import`
- [ ] 审计 link 表
- [ ] 列表列「规则匹配」只读展示

### 8.2 Phase 2

- [ ] `regex` 算子 + 规则测试台
- [ ] 单条详情页导入
- [ ] 规则 JSON 导入/导出
- [ ] 按 `gpu_name` 自动匹配卡型（R-DI8 复用）
- [ ] 列表 `suggested_action` 动态文案

### 8.3 Phase 3（可选）

- [ ] 租户级「自动导入」开关：探测 job 结束后对 **命中规则且无 error** 的孤儿自动 commit（需独立审批流）
- [ ] 接入端 / 裸金属孤儿字段扩展（`match_field` 已预留）
- [ ] 飞书通知：「本周新增 N 条可匹配孤儿未导入」

---

## 9. 权限、审计与安全

| 项 | 规则 |
|----|------|
| 规则变更 | 写 `supplier_activity` 或专用 audit log（规则 ID、旧值、新值） |
| 导入 commit | 记录 `operator_staff_id`、批次号、来源 snapshot_hour |
| 全局规则 | 仅 admin；supplier  scoped 规则绑定 `supplier_id` |
| 敏感字段 | **不**从 `k8s_payload` / `proxy_payload` 导入 SSH 密码 |
| 删除规则 | 软删；历史 link 仍保留 `matched_rule_id` 快照 |

---

## 10. 测试要点

| # | 场景 | 期望 |
|---|------|------|
| T1 | `fjsq:xxx` 命中前缀规则 | preview `create`，目标内蒙一区 |
| T2 | 无规则命中 | `unmatched`，commit 不可选 |
| T3 | SN 已存在 | preview `error`，commit 阻断 |
| T4 | 两条规则同 priority 均命中 | preview `error` |
| T5 | commit 后手动探测 | 对应 orphan 消失，CRM 行 matched K8s |
| T6 | 机房无 `container_instance_region` | 规则保存 warning；入库后探测 `dc_unmapped` |
| T7 | 合成 SN `ORPHAN-10.0.0.1` | preview `error`（禁止入库） |
| T8 | 勾选部分 probeIds 导入 | 仅选中行写入 |
| T9 | disabled 规则 | 不参与匹配 |
| T10 | supplier scoped 规则 | 仅匹配该供应商机房下的 orphan（通过 target DC 反推 supplier） |

---

## 11. 配置项（环境变量，可选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `ORPHAN_IMPORT_MAX_ROWS_PER_BATCH` | `200` | 单次 preview 上限 |
| `ORPHAN_IMPORT_ALLOW_DUPLICATE_SN` | `false` | SN 冲突是否降级为 skip |
| `ORPHAN_IMPORT_DEFAULT_GPU_COUNT` | `8` | 无 K8s gpu_count 时默认 |

---

## 12. 附录 A — 规则匹配伪代码

```typescript
function matchOrphanToRule(
  snapshot: OrphanSnapshotRow,
  rules: OrphanImportRule[],
): OrphanImportRule | null {
  const text = resolveMatchText(snapshot, rule.matchField)
  if (!text?.trim()) return null

  const sorted = rules
    .filter((r) => r.enabled)
    .filter((r) => channelMatches(snapshot, r.presenceChannel))
    .sort((a, b) => a.priority - b.priority)

  const hits = sorted.filter((r) => evaluateOperator(text, r.matchOperator, r.matchValue))
  if (hits.length === 0) return null
  if (hits.length > 1 && hits[0].priority === hits[1].priority) {
    throw new AmbiguousRuleError(hits)
  }
  return hits[0]
}
```

---

## 13. 附录 B — 与现有类型对齐

复用 `@/lib/supplier/device-platform-probe-utils` 中：

- `ProbeRecordKind`、`ConsistencyFlag`、`ProbePresence`
- `DevicePlatformProbeRow` / detail DTO 扩展可选字段：`matchedRuleName?: string`

---

## 14. 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-06-22 | 初稿：平台孤儿命名规则、预览入库、DB/API/UI、分期与测试 |
