# 好时运 ERP：平台基础资料与基础字典 UED

本设计用于 UED 评审阶段。新建/编辑动作当前只操作客户端示例状态；本稿不代表数据库、权限服务或外部平台 API 已接通。（**2026-11-08 更新**：页面已改为只读参考目录，不再提供本地保存动作；仓库主数据走 WMS。）（**2026-11-10 更新**：平台 / 国家站点 / 币种已落库并恢复 CRUD——平台侧维护全局目录，企业审核通过时初始化为组织副本，组织内只改自己的副本，见 [§7](#7-双层模型与初始化2026-11-10-已实现)。字典页仍为只读参考。）

## 1. IA

设置 → 平台基础资料（平台 / 国家站点 / 币种；仓库主数据走 WMS）  
设置 → 基础数据字典（字典分类 / 标准值 / 历史别名）  
设置 → 店铺连接（新建按平台→站点→店铺资料→选择多个仓库→指定默认出库仓）

## 2. 页面焦点与主路径

- **平台基础资料**：当前选中主数据的可搜索列表，单一“新增”主动作；Tab 仅切换资料类型。
- **基础数据字典**：左侧字典分类、右侧标准值表；主要动作是新增标准值，别名用于导入归一。
- 表单只展示当前资料必要字段；高级/低频字段后续放入折叠的“更多设置”。
- 创建店铺的目标路径为：选平台 → 选支持站点 → 填平台店铺信息 → 选择一个或多个可选仓库 → 从已选仓库指定一个默认出库仓；站点默认币种/时区自动带出，允许覆盖但清楚显示来源。
- 店铺连接列表/详情继续复用现有页面外壳；新增店铺动作启用后按向导创建，不要求用户先到不同菜单重复录入仓库关系。

## 3. 多平台/站点可复用模型

`Platform` 表示系统已适配的电商平台（Lazada、Daraz 等）；`Marketplace` 是平台下国家/站点实例（Lazada TH、Daraz LK）；`Shop` 是租户在该站点的 Seller 店铺。平台 connector 能力不由普通字典管理。`Country` 提供名称、IANA 时区和默认币种；`Warehouse` 是组织内共享资料，Shop 与 Warehouse 为多对多关系，一个店铺可关联多个仓库并指定一个默认出库仓，同一仓库可供多个店铺复用；`Currency` 是 ISO 4217 基础资料。

字典按 scope 分为系统字典和组织自定义字典。颜色、尺码、品牌、品类、履约模式、仓库类型等可以被商品、店铺、仓库、物流等多个页面复用。标准值含稳定代码、名称、排序和启停状态；alias 单独保存并指向 canonical value。停用保留历史关联；删除仅允许无引用且未进入业务交易的新建错误（后端将最终校验）。

## 4. 状态与风险

- ~~示例数据徽标保留，避免用户误认为数据已保存到服务端。~~（**2026-11-10 更新**：已落库，列表展示「来源」徽标区分平台初始化 / 组织自建。）
- ~~保存成功只反馈“已保存到本次原型会话”；刷新即恢复示例数据。~~（**2026-11-08 更新**：页面已移除本地保存，改为只读参考。）
- 不允许把停用的国家、平台、币种、仓库作为新资料默认值；历史记录仍可显示。
- 国家默认值不是交易汇率；汇率是带来源/日期的独立数据，不在本轮基础资料 CRUD 中。
- 店铺默认出库仓必须属于店铺当前启用的可选仓库集合；移除默认仓前必须先选出新的默认仓。
- 币种代码、国家代码、平台 adapter code 为受控代码，不允许普通租户随意重命名。

## 5. 页面实现

- `apps/shop/src/app/[locale]/settings/platform-basics/page.tsx`（组织副本 CRUD，见 §7）
- `apps/shop/src/app/[locale]/settings/dictionaries/page.tsx`
- 平台侧目录页：`apps/web/src/app/[locale]/(protected)/crossborder/platform-basics/page.tsx`
- 共享校验与初始化：`packages/db/src/platform-basics.ts`（默认目录 `DEFAULT_PLATFORM_BASICS`；原静态示例 `apps/shop/src/lib/crossborder/platform-basics-data.ts` 已删除）
- 设置导航：`apps/shop/src/lib/console-nav.ts`；平台侧导航：`apps/web/src/lib/crossborder/nav.ts`
- 仓库（WMS）不在本页维护：页面仅提示跳转 `/console/warehouse`；店铺创建/编辑中的仓库选择流程留待后续页面 UED 阶段接入。
- 店铺向导的完整状态及字段规格见 [ERP 页面 UED 补充设计 §3.1](./haoshiyun-erp-ued-catalog.md#31-店铺列表创建与编辑)。

## 6. 后续数据库落地建议

见 [ERP 覆盖分析与整改设计 §4.2](./haoshiyun-erp-gap-analysis-and-remediation.md#42-平台基础资料与可复用主数据本轮-ued--db-设计重点)。schema 完成后应有组织范围唯一键、system/org 字典隔离、软停用、alias 归一唯一键、店铺平台站点复合校验、`shop_warehouses` 多对多关联及每店唯一 active 默认仓约束、币种/时区标准校验及审计事件。

> 2026-11-10：平台基础资料（平台 / 国家站点 / 币种）已按 §7 落地；设计稿原建议的 4 张全局表改为 2 表 + `kind` 判别，差异见 §7。字典（标准值 / alias）与仓库多对多仍未落库。

## 7. 双层模型与初始化（2026-11-10 已实现）

| 层 | 表 | 范围 | 维护方 |
| --- | --- | --- | --- |
| 平台目录（真源） | `platform_basics_catalog`，unique `(kind, code)` | 全局 | 平台管理员：`apps/web` → `/crossborder/platform-basics` |
| 组织副本 | `commerce_platform_basics`，unique `(organization_id, kind, code)` | 单组织 | 租户：`apps/shop` → `/settings/platform-basics` |

- `kind` ∈ `platform | country | currency`，与页面三段结构同构；国家的时区 / 默认币种、平台的覆盖站点与接入状态、币种的符号 / 小数位同构存放，非当前 kind 的字段落库前被清空。
- 共享 zod 校验、默认目录与幂等初始化放在 `packages/db/src/platform-basics.ts`（apps/web 与 apps/shop 共用同一套规则）：代码大小写按 kind 归一（`Daraz` → `daraz`、`lk` → `LK`），国家必填时区与默认币种，币种必填符号与小数位（0–4）。
- **初始化**：入驻审核通过的事务内调用 `initializePlatformBasicsForOrganization(tx, organizationId)`，把目录复制成组织副本——只补缺失的 `(kind, code)`，不覆盖已有行；目录为空则不复制。存量组织可用 `pnpm --filter @workspace/db db:seed:platform-basics` 回补，或在组织页点「从平台目录补齐」（同一幂等函数）。
- **权限与隔离**：平台侧走 `protectedProcedure`，组织侧走 `tenantProcedure`，所有查询 / 写入都强制 `organization_id`；组织副本不回写目录，平台目录变更也不影响已初始化副本。
- 种子：`packages/db/src/scripts/seed-platform-basics.ts`（补目录 + 按 `orgType='tenant'` 回补组织），脚本 `db:seed:platform-basics`。
- 验证：`pnpm --filter shop test:crossborder` 中 `platform-basics-rules.test.ts` 覆盖大小写归一、国家时区 / 默认币种必填、币种符号 / 小数位必填、kind 字段归一清空与默认目录一致性。
