# 系统卡型：类型过滤 + 卡型详情 + 机房销售价 — 实现方案

**文档性质**：实现方案（已闭合，可直接落地）  
**版本**：v0.3（2026-07-14）  
**相对 v0.2 变更**：

1. **取消**独立维护页 `/supplier/datacenter-card-specs`；配置入口收敛到业务页面
2. **数据分层**：机房×卡型仅存 `device_spec`；机房级带宽/网络/存储迁至新表 `supplier_datacenter_infrastructure`（三列 JSONB）
3. 设备配置表单结构化（下拉 + 必填项），入库前序列化为 `device_spec` 文本
4. 机房基础设施表单结构化（带宽/网络/存储三块 + 各块备注），JSON 入库、摘要文本展示

---

## 1. 目标与非目标

### 1.1 目标

1. 列表增加 **CPU / GPU** 类型过滤（映射 `device_role`）。
2. 卡型详情页 `/supplier/gpu-card-types/[id]`：
   - 当前生效平台刊例价（裸金属多租期）
   - 机房列表（设备数 / 可用数）；行点击弹窗展示**设备配置** + **机房基础设施** + 裸金属价
3. **机房×卡型设备配置**：结构化表单 → `device_spec` 文本，经「卡型成本 → 更新配置」维护
4. **机房级基础设施**：带宽 / 网络 / 存储，经机房详情页卡片维护
5. 落地 **机房级销售价**（L1 机房级覆盖，表 + API + UI），开放给 member/admin

### 1.2 非目标

- 弹窗**不**从 `supplier_device.device_spec` / `bandwidth_group` / `rate_limit` 聚合
- 不改造设备对账探测 job；数量复用 L1 库存同源聚合
- L1 平台刊例价写操作仍仅 **admin**

---

## 2. 类型过滤（CPU / GPU）

| UI | 内部 | `device_role` |
|----|------|---------------|
| 全部类型 | `all` | — |
| GPU | `gpu` | `compute` |
| CPU | `cpu` | `infra` |

- 整租占位（`wr_placeholder`）：仅「全部类型」可见
- 创建/编辑表单暴露类型字段（GPU/CPU → `deviceRole`）

---

## 3. 页面结构与维护入口

### 3.1 路由与权限

| 路由 | 角色 | 说明 |
|------|------|------|
| `/supplier/gpu-card-types`、`/[id]` | admin | 系统卡型与详情 |
| `/supplier/datacenters/[id]` | supply（admin + member） | 机房详情含基础设施卡片 |
| `/supplier/platform-pricing` | admin + member | 含机房级价维护 |

**已删除**：`/supplier/datacenter-card-specs` 独立维护页及侧边栏菜单项。

### 3.2 维护入口（闭合）

| 配置类型 | 维护入口 | 展示入口 |
|----------|----------|----------|
| 机房×卡型设备 | 机房详情 → 卡型成本 →「更新配置」Dialog | 卡型详情机房弹窗「设备配置」 |
| 机房带宽/网络/存储 | 机房详情 →「带宽/网络/存储」卡片 → 编辑配置 | 同上弹窗「机房基础设施」三节 |
| 裸金属机房级价 | 平台定价页 | 卡型详情机房弹窗「裸金属定价」 |

卡型详情弹窗内**不提供内联编辑**；「前往机房详情」外链引导维护。

### 3.3 卡型详情页结构

```
返回 · 卡型基础信息
§A 当前生效平台刊例价（只读）
§B 机房列表（设备数/可用数，行点击弹窗）
```

机房弹窗内容：

1. **设备配置（机房×卡型）**：`device_spec` 按行文本展示；未配置提示去机房详情「更新配置」
2. **机房基础设施**：带宽 / 网络 / 存储 三节摘要（与机房详情卡片一致）；未配置提示去机房详情编辑
3. **裸金属定价**：机房级价优先，缺省回退 L1 平台刊例价

---

## 4. 数据与 API

### 4.1 `gpuCardTypes.getDetailPage` / `getDatacenterDetail`

```ts
type CardTypeDatacenterSummaryRow = {
  dataCenterId: string
  dataCenterName: string
  supplierId: string
  supplierName: string
  location: string | null
  dcStatus: string
  deviceCount: number      // supplier_gpu_inventory.quantity
  availableCount: number   // supplier_gpu_inventory.online_quantity
  inventoryId: string | null
  unitLabel: '卡' | '台'
}

type GpuCardTypeDatacenterDetailData = {
  // ...机房/卡型/供应商基础信息
  deviceSpec: {
    text: string | null
    lines: string[]        // device_spec 按行拆分
    remark: string | null
    hasAny: boolean
  }
  infrastructure: {
    bandwidthLines: string[]
    networkLines: string[]
    storageLines: string[]
    hasAny: boolean
  }
  bareMetalPrices: BareMetalPriceRow[]
}
```

`getDatacenterDetail`：**设备**读 `supplier_datacenter_card_type_spec`；**基础设施**读 `supplier_datacenter_infrastructure`（按 `data_center_id`）。

### 4.2 数量口径

| 字段 | 口径 |
|------|------|
| `deviceCount` | `supplier_gpu_inventory.quantity` |
| `availableCount` | `supplier_gpu_inventory.online_quantity` |

单位：GPU（compute）为 **卡**；CPU（infra）为 **台**。机房范围：`quantity > 0`。

### 4.3 机房×卡型设备配置

#### 表 `supplier_datacenter_card_type_spec`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | text PK | |
| `data_center_id` | text FK NOT NULL | |
| `gpu_card_type_id` | text FK NOT NULL | |
| `device_spec` | text | 结构化表单序列化文本（见 §4.5） |
| `remark` | text | 可空 |
| `updated_by_staff_id` | text FK | |
| `created_at` / `updated_at` | timestamptz | |

UK：`(data_center_id, gpu_card_type_id)`。

> v0.3 起**不再**在本表存储带宽/网络/存储（已删三列）。

#### API

| 方法 | Procedure | 说明 |
|------|-----------|------|
| `get` | `supplyProcedure` | 按机房+卡型读取 |
| `upsert` | `supplyProcedure` | 写入 `device_spec` + `remark` |

**已删除**：`datacenterCardSpecs.list`。

### 4.4 机房级基础设施配置

#### 表 `supplier_datacenter_infrastructure`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | text PK | |
| `data_center_id` | text FK NOT NULL | UK |
| `bandwidth_config` | jsonb | 带宽结构化表单对象 |
| `network_config` | jsonb | 网络结构化表单对象 |
| `storage_config` | jsonb | 存储结构化表单对象 |
| `updated_by_staff_id` | text FK | |
| `created_at` / `updated_at` | timestamptz | |

#### 带宽 JSON 字段（摘要）

`bandwidthType`、`bandwidthSize`+`bandwidthUnit`、`isps[]`、`customIspName`、扩展开关及参数、`extraBandwidthLines`、`remark`

#### 网络 JSON 字段（摘要）

`ipv4Count`、`ipv6Option`、`portCount`、`portType`、`vlanConfig`、`vlanCount`、`internalIpRange`、`remark`

#### 存储 JSON 字段（摘要）

`storageType`、`storageCapacity`+`storageUnit`、`raidLevel`、`diskCount`、扩展开关及参数、`remark`

展示：服务端将 JSON 格式化为多行摘要文本（`formatBandwidthSummary` 等），前端按行渲染。

#### API

| 方法 | Procedure | 说明 |
|------|-----------|------|
| `datacenterInfrastructure.get` | `supplyProcedure` | 读机房配置；无记录时返回机房字段预填默认值 |
| `datacenterInfrastructure.upsert` | `supplyProcedure` | 写入三列 JSON |

### 4.5 设备配置结构化表单与文本格式

表单字段（下拉优先，GPU 可自动推断）：

- CPU：线程数、数量、型号（下拉/自定义）
- 内存：总量 GB、条数、单条容量、DDR4/DDR5
- 系统盘：数量、类型、容量+单位、RAID
- 数据本地盘：数量、类型、容量+单位、接口
- 网卡：数量、速率、端口类型
- GPU：数量（来自 `cardsPerMachine`）、型号（来自卡型名）
- 备注

入库 `device_spec` 示例：

```
CPU: 128线程， 2*6530
内存: 512GB  8*64GB DDR5
系统盘: 2*SATA 固态硬盘 容量960GB(RAID 1)
数据本地盘: 2*7.68TBu.2
网卡1: 1*100G双口
GPU: 8*RTX 5090
备注：…
```

实现：`device-spec-utils.ts`（`parseDeviceSpec` / `formatDeviceSpec` / `resolveDeviceSpecFields`）。

### 4.6 裸金属定价展示

弹窗仅展示 `product_line = bare_metal` 各 `billing_unit`：

| 展示列 | 规则 |
|--------|------|
| 租期 | hour/day/week/month |
| 销售单价 | **机房级销售价（原 L2）优先**；否则 **回退 L1 平台刊例价** |
| 价格来源 | `机房定价` / `平台刊例（回退）` / `未配置` |

---

## 5. 机房级销售价（L1 机房级覆盖，原 L2 编号）

（与 v0.2 一致：`supplier_datacenter_sell_price` + history；`platformPricing` 子路由；member+admin 可维护机房级价。）

---

## 6. 实现任务（v0.3 落地顺序）

| 序号 | 任务 | 状态 |
|------|------|------|
| M1 | Migration：`supplier_datacenter_infrastructure`；卡型表删 bandwidth/network/storage 三列 | 待执行 migration |
| M2 | `datacenterInfrastructure` dataaccess + tRPC | 已实现 |
| M3 | 机房详情基础设施卡片接 tRPC | 已实现 |
| M4 | 卡型 spec API 精简（删 list）；设备 Dialog 仅写 device_spec | 已实现 |
| M5 | 卡型详情弹窗按新结构展示；删维护页/菜单 | 已实现 |
| M6 | 类型过滤 + 机房级价全链路（沿用 v0.2） | 沿用现网 |

---

## 7. 测试要点

1. 机房详情保存基础设施后，卡型详情同机房弹窗立即可见三节摘要
2. 卡型成本「更新配置」保存后，弹窗设备配置按行展示
3. `/supplier/datacenter-card-specs` 路由不可访问；侧边栏无「机房卡型配置」
4. `datacenterCardSpecs.list` 不可调用；`get`/`upsert` 正常
5. 裸金属价 机房级/L1/皆无 四种展示仍正确
6. 数量与 `/supplier/inventory` 同机房同卡型一致

---

## 8. 结论（v0.3 已闭合）

| 项 | 决议 |
|----|------|
| 维护页 | **删除**；入口在机房详情 + 卡型成本 |
| 设备配置 | 机房×卡型表，仅 `device_spec` + `remark` |
| 带宽/网络/存储 | 机房级表，三 JSONB 列 |
| 卡型详情弹窗 | 设备 + 基础设施 + 裸金属；外链机房详情维护 |
| list API | **删除** |
