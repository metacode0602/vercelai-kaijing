# 好时运 ERP 整改设计响应（2026-11-03）

| 项 | 内容 |
|----|------|
| 输入 | `apps/shop/content/design/好时运ERP开发人员整改清单_2026-11-03.xlsx`（26 项：P0×18、必须修改 5、需补充 15、共同确认 6） |
| 范围 | 26 项逐条给出设计响应、文档落点与确认状态；C1/C2/C3 已随 migration `0009_careless_tyrannus` 落地实现（2026-11-08 重生成后并入 `0002_glamorous_bruce_banner.sql`） |
| 关联 | [erp-requirements-q01-q35-dev-replies.md](./erp-requirements-q01-q35-dev-replies.md)（Q01–Q35 原答复）、[haoshiyun-erp-database-schema.md](./haoshiyun-erp-database-schema.md)、[haoshiyun-erp-ued-catalog.md](./haoshiyun-erp-ued-catalog.md)、[haoshiyun-erp-console-menu-ia.md](./haoshiyun-erp-console-menu-ia.md)、[haoshiyun-erp-gap-analysis-and-remediation.md](./haoshiyun-erp-gap-analysis-and-remediation.md)、[fee-templates-ued.md](../../apps/shop/content/design/fee-templates-ued.md) |
| 状态 | **设计已定 19 项（2026-11-03 两轮拍板）；10 项待确认 + 5 项已拍板待填细节（见 §6）** |

### 修订记录

| 版本 | 日期 | 变更摘要 |
|------|------|----------|
| v1.0 | 2026-11-03 | 初版：26 项整改逐条响应；库位绑定禁删+履历表、RBAC country scope+六动作、费用模板审核状态机+历史快照三项设计定稿 |
| v1.1 | 2026-11-03 | 第二轮拍板写入：C3/C6/C7/C10/C11/C12/C13/C15/C17/C18/C20/C23/C25/C30 共 14 项（含库存状态机、报表口径、Lazada 授权建议采纳）；C4 选 B（改动行待补） |
| v1.2 | 2026-11-07 | C1/C2/C3 已实现：`commerce_bin_bindings` + `bin_binding_history` + `commerce_warehouse_zones` + `inventory_pools` 随 0009 落库（现于 `0002_glamorous_bruce_banner.sql`）；WMS/海运 tRPC 与种子已接 |

---

## 1. 总览

整改 26 项按处理方式分三类：

| 类别 | 条目 | 处理 |
| --- | --- | --- |
| **设计已定（本文档定稿，可进实现）** | Q10 库位绑定、Q23 RBAC、Q30 费用模板（审核+历史取值部分） | §2 / §3 / §4；确认项 C1/C2/C5/C8/C9 已拍板 |
| **设计骨架已给、值待填** | Q09、Q16、Q19、Q21、Q07、Q08、Q11、Q12、Q14、Q15、Q17、Q34、Q35 | §5 逐条表；对应确认项 C11–C18、C27–C30 |
| **纯排期/交付承诺（设计无法代填）** | Q02、Q03、Q04、Q25、Q26、Q31、Q32、Q33 | §5 逐条表；对应确认项 C19–C26 |

与原答复的两处**口径修正**（本文档为准）：

1. **Q10 物理删除**：原答复「允许管理员物理清除绑定行」（`erp-requirements-q01-q35-dev-replies.md` Q10/Q20）**推翻**，整改口径生效——绑定记录任何角色不得物理删除。
2. **Q23 数据范围**：`erp_role_scopes` 在原 `all/platform/marketplace/shop/warehouse` 基础上**新增 `country`**；permission 动作收敛为六动作码（§3.2）。

---

## 2. 库位绑定与履历（Q10，P0 必须修改）

### 2.1 已定决策

| 编号 | 决策 |
| --- | --- |
| **C1** | **彻底禁止物理删除**：任何角色（含最高管理员）不得物理删除绑定记录。只能**解绑 / 停用 / 更正**，且必须保留原记录、操作人、时间和原因。原 Q10/Q20「管理员可物理清除」答复作废。 |
| **C2** | **索引 + 事务双保险**强制「一个库位同一时点只有一个有效内部 SKU」：partial unique index 兜底 + 服务层事务校验给出友好报错。 |
| **C3（已定）** | 解绑/换绑前提（选 **C**）：**二者皆可**——库存为零可直接解绑/换绑；有库存则先走库存转移单后再换绑。两条路径均强制写履历+原因。 |

### 2.2 数据模型（对 [haoshiyun-erp-database-schema.md](./haoshiyun-erp-database-schema.md) §1.6/§5.1 的增量）

**① 当前绑定 `commerce_bin_bindings`（有效态投影，可变 state）**

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| organization_id | text FK | 租户隔离 |
| warehouse_id | text FK | |
| bin_id | text FK | → commerce_bins |
| variant_id | text FK | 内部 SKU（product_variants） |
| state | varchar(16) | `active` / `released` / `disabled` |
| bound_at / released_at | timestamptz | |
| bound_by / released_by | text | 操作人（user id） |
| release_reason | text | 解绑/停用/更正原因，**必填** |
| **UNIQUE 部分索引** | | `(organization_id, bin_id) WHERE state = 'active'` —— **R07 的 DB 强制点（C2）** |

**② 绑定履历 `bin_binding_history`（追加式，只读）**

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | text PK | |
| organization_id / warehouse_id / bin_id / variant_id | text | 谁、在哪、绑过哪个 SKU |
| action | varchar(16) | `bind` / `unbind` / `disable` / `correct` |
| reason | text | 更正/解绑原因（bind 可空，其余必填） |
| operator_id / operator_type | text / varchar(16) | 操作人（user/system） |
| occurred_at | timestamptz | 时间 |
| binding_id | text | → commerce_bin_bindings 关联行 |
| correction_of | text | 可空；`correct` 时指向被更正的历史行 id（更正=新行，原行保留） |
| request_id | text | 与 `audit_events` 串联 |

不变量：

- `bin_binding_history` **无 DELETE/UPDATE 路径**（与 `audit_events`、`inventory_ledger` 同一追加原则；更正写新行 + `correction_of` 指针）。
- `state` 从 `active` 变更（解绑/停用）时**必须**同步写一条履历行，同一事务完成（索引兜底 + 事务友好报错，C2）。
- 库位停用（`commerce_bins.status=disabled`）不删绑定，只置 `state=disabled` 并留履历。

### 2.3 交互（对 [haoshiyun-erp-ued-catalog.md](./haoshiyun-erp-ued-catalog.md) §3.2、[console-menu-ia](./haoshiyun-erp-console-menu-ia.md) §3.5 的补强）

- 库位详情新增「**绑定履历**」Tab：只读时间线——时间、动作（绑定/解绑/停用/更正）、SKU、操作人、原因；支持按 SKU/操作人/日期筛选，**导出**受 RBAC `inventory.export` 控制。
- 绑定/解绑/更正表单必填「原因」；界面**不提供任何物理删除入口**。
- 库位列表「绑定 SKU」列点击跳转履历并定位到当前有效绑定。

---

## 3. RBAC 与数据范围（Q23 + Q33，P0）

### 3.1 已定决策

| 编号 | 决策 |
| --- | --- |
| **C5** | ① `erp_role_scopes.scope_type` **新增 `country`**（与 `marketplace` 并存：marketplace=站点粒度，country=国家聚合）；② `erp_role_permissions.permission` 统一为 **`module.action` 六动作码**，与「查看/新增/修改/审核/导出/配置」一一对应。 |
| **C6（已定）** | 测试账号方案选 **A**：**每角色 1 个演示号**（只读演示+当轮六动作验证用，验证后可停用）。 |
| **C7（已定）** | 正式 RBAC 上线与 **C20 合并拍板**：随 **P5 同期**，平台顺序 **Daraz LK 先**。 |
| C4（已选 B，改动行待补） | 角色矩阵选 **B 修改**：8 行演示矩阵需修改，**改动行清单待杨洁提供**后更新 `erp-ued-data.ts` 对应设计。 |

### 3.2 权限模型（对 [database-schema.md](./haoshiyun-erp-database-schema.md) §9.1 的修订）

> 落地更名（2026-11-10）：`erp_roles` / `erp_role_permissions` / `erp_member_roles` / `erp_role_scopes` 分别落地为 `roles` / `role_permissions` / `member_roles` / `role_scopes`。租户表在 `public`，平台同形表在 `web_auth`，不在单表加标记混放。详见 [shop-org-rbac-phase-ab.md](./shop-org-rbac-phase-ab.md)。

**① 动作收敛为六动作（C5）**

| 中文操作 | action 码 | permission 示例 |
| --- | --- | --- |
| 查看 | `read` | `inventory.read` / `order.read` |
| 新增 | `create` | `inventory.create` / `purchase.create` |
| 修改 | `update` | `inventory.update` / `product.update` |
| 审核 | `approve` | `purchase.approve` / `inventory.approve` |
| 导出 | `export` | `report.export` / `inventory.export` |
| 配置 | `configure` | `settings.configure` / `fee_template.configure` |

`permission = module + '.' + action`，UNIQUE `(role_id, permission)` 不变；原点状 code（`it.impersonate` 等）保留为 `it.*` 模块的特殊 action，不强行塞入六动作。

**② 数据范围 `erp_role_scopes.scope_type`（C5 增 country）**

```text
all | platform | country | marketplace | shop | warehouse
```

`scope_ref_id` 按 type 指向 `commerce_countries` / `platform_marketplaces` / `shops` / `commerce_warehouses`；`actions` 列与六动作对齐（六动作子集）。

**③ 三重校验（每次 tRPC 查询/写入）**

```text
org 成员资格（better-auth organization）
  + 功能权限（role → module.action）
  + 数据范围（scope 命中：平台/国家/站点/店铺/仓库）
```

- 导出、审核、配置三类动作**服务端强制**，不因按钮隐藏而豁免（`haoshiyun-erp-target-function-matrix.md` §2 口径不变）。
- 模块维度由 `module` 承载，不重复进 scope；「按模块控制」= 按 `module.action` 授权。
- 组织隔离：业务表强制 `organization_id`，scope 只在 org 内收敛，不跨租户（不变）。

### 3.3 测试账号演示（整改要求「用各角色测试账号演示」）

演示方案骨架（账号数量与交付时间待 C6/C19 确认）：

| 步骤 | 内容 | 通过标准 |
| --- | --- | --- |
| 1 | 按角色矩阵（`erp-ued-data.ts` 8 行演示行，终稿待 C4）为每角色建测试账号 | 账号绑定角色与 scope |
| 2 | 每账号执行六动作各一次：查看列表 / 新增 / 修改 / 审核 / 导出 / 配置 | 越权动作返回拒绝（非仅隐藏按钮） |
| 3 | 越权数据范围验证：店铺 A 账号访问店铺 B 数据 | 返回空/拒绝，不泄露 |
| 4 | 互审验证：杨洁 ↔ 黄发聪互审；申请人自审被拒 | 服务端硬拒绝（Q12 口径） |
| 5 | 导出验证：无 `*.export` 权限账号点击导出 | 服务端拒绝 + `audit_events` 记 `export` 行 |

演示证据：截图 + `audit_events` 查询结果，附在整改清单 H–L 列「测试地址或交付证据」。

---

## 4. 费用模板（Q30 + Q16）

### 4.1 已定决策

| 编号 | 决策 |
| --- | --- |
| **C8** | 版本发布走**版本状态机 + 审核字段**（轻量），首期不接 `approval_instances` 通用审批。 |
| **C9** | **历史订单/已保存柜次成本快照锁定**：写入时固化 `feeTemplateVersionId` + components，模板后续改版**不影响历史、永不重算**（与 `fee-templates-ued.md` C4 一致）。 |
| C10（已定，日期待填） | LK 种子税率按建议：**报关行复核前禁止生产启用**；复核责任人与截止日期待填（见 §6）。 |

四维配置（平台 × 国家 × 履约 × 有效期）与 Lazada/Daraz 分适用**已由 PR #36 落地为 UED**，本节不重复，只补整改要求的「审核」与「历史订单取值」两段规则。

### 4.2 版本生命周期与审核规则（对 fee-templates-ued.md / schema §8.2 的增量）

**状态机（`fee_template_versions.status`，替代纯 `published` 布尔）：**

```text
draft → in_review → published → disabled
  ↑         │
  └──驳回────┘（回 draft，保留驳回意见）
```

| 状态 | 含义 | 允许操作（RBAC） |
| --- | --- | --- |
| `draft` | 草稿，可编辑 | `fee_template.create/update` |
| `in_review` | 已提交审核，**冻结编辑** | `fee_template.approve`（通过/驳回） |
| `published` | 已发布，参与解析 | 只读；可 `disabled` |
| `disabled` | 停用，不再参与解析 | 只读（历史引用不受影响，C9） |

- **审核字段（增列）**：`submitted_by/submitted_at`、`reviewed_by/reviewed_at`、`review_note`（驳回必填）。
- **审核人**：具备 `fee_template.approve` 的角色；首期**允许自审**（费用模板非资金单据），与采购 PUR 禁自审区分，待业务可另行收紧。
- 解析规则不变：候选 = 模板未停用 + 版本 `published` + `asOf` ∈ 有效期；排序 priority 降序 → versionNo 降序。

### 4.3 历史订单取值规则（C9，明文化）

| 场景 | 规则 |
| --- | --- |
| 新测算/新柜次成本保存 | 按 asOf 解析命中版本，写入 `feeTemplateVersionId` + components **快照**（`sku-cost-version-store` 现行为） |
| 模板版本改版/停用/新增高优先级版本 | **已保存的订单费用、柜次成本、利润快照一律不变**；引用快照可回查当时的模板编码与版本号 |
| 需要按新税率重估 | 只允许**新建**成本版本行（新 version_no），不覆盖旧行；差异在版本时间线可对比 |
| 历史订单 `order_fees` | 事实层已落行不重刷；来源标记 `api/import/manual` 不变（Q16） |

### 4.4 Q16 平台费用导入（补充规格）

- 提供 Lazada/Daraz Finance API **实际返回字段样例**（证据见 `docs/design/platform-apis/{lazada,daraz}.md` §4.5）。
- 无法自动获取的佣金/物流/广告费：**标准导入模板**（列定义随模板下载）+ 行级校验 + 错误报告；导入行写 `order_fees.source='import'`，与 `api` 行可对账（差额报表 P1）。
- 广告费分摊规则（C27）待财务确认后补入本文档 §4。

---

## 5. 其余 22 条设计响应

| 编号 | 整改要求（摘要） | 设计响应与文档落点 | 确认 |
| --- | --- | --- | --- |
| Q09 | 事务+原子锁保证可用≥0；五国并发压测 | schema §5.1 `version` 乐观锁 + 条件更新已定；**C11 已定**：短时负库存**硬拒绝**（available<0 一律失败，无告警放行路径）；压测通过标准 = 0 超卖（P99 阈值待填） | C11✅硬拒绝 |
| Q19 | 导入模板、字段映射、校验报告、错误行、批次回滚、抽查 | schema §9.3 `import_batches/rows` 已有 dry-run/行级错误/回滚（只撤本批次）；**增补**：迁移批次必须附「旧新编码对照列 + 迁移后抽查报告」产物清单；**C18 已定**：首批范围 = 仅库存+映射（**范围收窄不豁免过程要求**——模板/校验/错误行/回滚/对照/抽查对范围内数据全部适用；历史订单延后至后续批次，非取消） | C18✅仅库存+映射 |
| Q34 | 区分 demo 编码与真实旧编码，不覆盖历史 | schema §12 legacy/alias 映射已定；**增补**：迁移输入必须先产出 demo/真实编码分类清单；**C18 已定**：首批范围 = **仅库存+映射**（不含历史订单） | C18✅仅库存+映射 |
| Q26 | 按 P0 拆分页面/接口/DB/里程碑/演示/测试环境/验收/上线日期 | gap-analysis §5 阶段 0–5 骨架已有；**增补交付计划表结构**：每项 = 负责人 + 有效日期 + 演示成果 + 验收日期；**C20 已定**：平台顺序 = **Daraz LK 先**（目标发布月待填；C7 与之合并） | C20✅Daraz LK 先 |
| Q35 | AI 选品 P2；未解释前仅人工候选 | `AI选品实现方案.md` 两阶段已定；**C30 已定（按建议）**：阶段一**仅人工候选+评审**（GO/HOLD/NO-GO），**关闭自动采购/发布**；数据源五要素（数据源/字段/更新时间/算法/人工评审）未齐不进入阶段二；数据源需合规审查 | C30✅阶段一仅人工 |
| Q02 | Token 有效期、刷新/续期、失败告警、重授权、凭证加密 | schema §9.5 + `marketplace-connectors.md` OAuth 刷新已有基础；**增补字段**：`token_expires_at`、`refresh_fail_count`、告警接通知渠道；**C23 已定（按建议）**：授权模式 = **各国本地 Seller 独立应用/授权**；失效通知 = **ERP 内红点 + 邮件**（企业微信后补）；AppKey = **五国共用一个应用** | C23✅各国独立 |
| Q03 | 逐对象可获取/不可获取/人工导入三类字段清单 | `platform-apis/*.md` §3/§4 为证据基线；**增补汇总表**：商品/订单/物流/售后/结算/广告/IM × 三类 + 人工模板链接 | C24 |
| Q04 | 按接口最终频率、频控、3 次失败告警、补数范围 | 原答复 5/15/30 三备选**作废**；**C25 已定（按建议）**：默认同步间隔 = **15 分钟**；逐接口频率/频控仍按官方文档填（见 C25 待填细节）；3 次失败告警+人工处理、补数范围不变 | C25✅默认15分钟 |
| Q08 | 取消/支付失败/超时/关闭/退款释放规则 + 可配置超时 | **C12 已定（见下方 5.1）**：平台取消事件自动释放为主 + 本地超时 30 分钟兜底 + 人工强制（需权限）；支付失败与取消同一释放路径；释放必写 `inventory_ledger(release)`；超时分钟数入配置、修改权 = `inventory.configure` | C12✅ |
| Q12 | 首期锁定 PUR-001~003；仅业务管理员可变更审批配置 | schema §4.1 + §13 禁自审不变量已有；**增补治理规则**：审批配置变更走 `settings.configure` + 审批 + `audit_events` 留痕，普通配置角色不可改 | C26 |
| Q16 | 见 §4.4 | | C27 |
| Q17 | JSB 运单/交接/清关/费用/异常模板、错误报告、去重 | 「无公开 API → 人工/导入」已定；**增补模板规格**：6 类批量模板列定义 + 去重键 `jsb_batch_no + 运单号`（待认可）+ 错误行报告 | C28 |
| Q21 | 日志保留期限、可查字段、恢复/冲正、恢复执行人 | `audit_events` 追加式 + 反向单据恢复已定；**增补**：恢复动作本身写审计行（`action='restore'`，含恢复人）；保留期限三选一 | C29 |
| Q23 | 见 §3 | 见 §3 | C4✅选B(改动行待补) / C6✅ / C7✅ |
| Q25 | 四级问题响应/修复时限、回归方式、上线阻断、测试账号交付 | gap-analysis §7 验收基线已有；**增补 SLA 表结构**：严重/高/中/低 × 响应 × 修复时限 + 上线阻断规则（值待填） | C19 |
| Q30 | 见 §4 | 见 §4 | C10✅(责任人/日期待填) |
| Q31 | 逐页「真实接口/模拟数据/未开发」+ 预计接入日期 | **增补页面状态标注规范**：每页元数据 `data_mode(real|mock|unbuilt)` + `eta`；联调前禁止标「已完成」；清单随排期填 | C21 |
| Q32 | 按「页面功能字段」表补齐后端数据/校验/权限/接口来源 | **增补验收方法**：以 `好时运ERP运营需求清单_V1.1_…xlsx`「页面功能字段」表为基线做字段 diff 清单，逐页签收 | C22 |
| Q33 | 演示采购→入库、订单→出库、LGS、JSB、售后回库、权限拦截 | ued-catalog §11 交付清单已有路由；**增补 P0 演示脚本**（六场景走查 + 权限拦截用 §3.3 演示步骤）；原型页面 ≠ P0 完成，以 tRPC+真实 DB 为准 | C7✅ |
| Q07 | Lazada 状态→ERP 动作映射表 + 推荐锁库/扣减节点 | **C12 已定（见下方 5.1）**：锁定 = 已付款自动锁+人工补锁；扣减 = 出库过账；两池同一套状态机；开发方仍需产出平台状态→ERP 动作映射表初稿落 `status_mappings` | C12✅ |
| Q11 | 确认必审范围/审批人/阈值；过账写流水禁直改 | **C13 已定（选 A）**：**全部库存调整均需审批**（无免审阈值）；审批人走设置页配置（首期杨洁↔黄发聪互审，与采购同轨）；过账必写 `inventory_ledger`、普通用户禁直改余额（不变量） | C13✅全部审批 |
| Q14 | 成本算法三选一，确认前不写死 | `cost_template_versions.method` 留空待选，不写死 | C14 |
| Q15 | 汇率来源/采用日期/本位币；留痕五件套 | **C15 已定（选 B）**：**手工为主 + 后续接指定自动源**（自动源名称待定，优先级靠后）；留痕五件套（原币/汇率/折算/来源/生效时间）不变；采用日期与本位币待业务确认 | C15✅手工为主 |
| Q22 | 私有化 vs SaaS；最高管理员、备份、数据交付 | 设计仅能保证：全量导出能力 + 最高管理员与外部 IT 权限分离；部署模式与人选属商务决策 | C16 |
| Q29 | GMV/订单/退款/毛利/净利口径 | **C17 已定（采纳建议，见下方 5.1）**：`report_metrics` 元数据结构承载公式/来源/刷新/下钻 | C17✅ |

### 5.1 已拍板规则明细（2026-11-03 第二轮）

#### C12 · 库存锁定 / 扣减 / 释放状态机（Q07 + Q08，采纳整套建议）

| 节点 | 决策 |
| --- | --- |
| 锁定触发 | **已付款自动锁**（unpaid→pending 即 `reserved`）+ 人工「确认占库/补锁」并存；映射异常/未支付不占库 |
| 正式扣减 | **出库过账时**扣减 `on_hand`、释放 `reserved`，写「订单出库」流水 |
| 两池状态机 | Lazada 五站共享池与 Daraz Colombo 池**同一套锁定/扣减/释放规则**；Daraz 柜次四态（在途/清关/本地/残次）仅为库存形态，不另立状态机 |
| 释放触发 | ① **平台取消事件自动释放**（主路径）② **本地超时 30 分钟兜底**（订单停留待发货超时）③ **人工强制释放**（需 `inventory.update` 权限，必填原因） |
| 支付失败 | 与「取消」**同一释放路径** |
| 超时配置 | 超时分钟数入 `status_mappings` 配置行；修改权 = `inventory.configure`；变更写 `audit_events` |
| 流水 | 所有锁定/释放/扣减必写 `inventory_ledger`，禁止静默改余额（不变量不变） |
| 平台映射表 | 开发方产出 Lazada/Daraz 平台状态→ERP 动作映射表初稿 → 运营确认 → 落配置（产物待 C12 关闭后的交付物） |

#### C17 · 仪表盘口径（Q29，采纳整套建议）

| 指标 | 口径 |
| --- | --- |
| GMV 日期 | **下单日** |
| GMV 范围 | **净 GMV**（剔除取消/关闭单；退款单列，不冲减 GMV） |
| 退款 | 单列指标（按退款发生日），不并入 GMV |
| 毛利 | 收入 − 商品成本 − 平台费 − 头程/履约成本（公式随 C14 成本算法拍板后固化） |
| 净利润 | 毛利 − 广告费 − 估算退货损失；**广告费与估算退货标「估算」来源**（`source=estimated`） |
| 跨币种合计 | **MVP 不合计**：按平台/站点原币展示（Daraz LK 用 LKR）；P1 再接「财务确认汇率」折 CNY 合计 |
| 刷新 / 下钻 | 按日刷新 + 手动刷新；每指标下钻到订单明细（`report_metrics` 元数据含 formula/source/refreshed_at/drilldown） |

---

## 6. 确认事项清单（C1–C30）

### 6.1 已拍板（19 项，2026-11-03 两轮，写入本文档）

| 编号 | 来源 | 结论 |
| --- | --- | --- |
| **C1** | Q10 | 彻底禁止物理删除绑定记录；推翻原 Q10/Q20「管理员可物理清除」答复 |
| **C2** | Q10 | partial unique index + 服务层事务双保险 |
| **C3** | Q10 | 解绑/换绑二者皆可：库存为零直接换绑，或先走库存转移单；均强制留痕 |
| **C5** | Q23 | 新增 `country` scope + 六动作码（`module.action`） |
| **C6** | Q23 | 测试账号 = 每角色 1 个演示号 |
| **C7** | Q33/Q23/Q26 | 与 C20 合并：正式 RBAC 随 P5 同期，Daraz LK 先 |
| **C8** | Q30 | 版本状态机 + 审核字段，首期不接通用审批 |
| **C9** | Q30 | 历史订单/柜次成本快照锁定，永不重算 |
| **C10** | Q30 | 按建议：报关行复核前**禁止生产启用**（责任人/日期待填，见 6.3） |
| **C11** | Q09 | 短时负库存**硬拒绝**；压测标准 0 超卖（P99 阈值待填） |
| **C12** | Q07/Q08 | 采纳整套建议：已付款自动锁+人工补锁；出库过账扣减；两池同一状态机；取消自动释放+30 分钟超时兜底+人工强制；支付失败同路径（明细见 §5.1） |
| **C13** | Q11 | 全部库存调整均需审批（无免审阈值） |
| **C15** | Q15 | 汇率手工为主 + 后续接指定自动源 |
| **C17** | Q29 | 采纳整套建议：下单日/净 GMV/退款单列/净利扣广告与估算退货/跨币种 MVP 不合计（明细见 §5.1） |
| **C18** | Q19/Q34 | 首批迁移范围 = 仅库存+映射 |
| **C20** | Q26 | P5 平台顺序 = Daraz LK 先（目标月待填） |
| **C23** | Q02 | 各国本地 Seller 独立授权；通知 = ERP 红点+邮件；AppKey 五国共用一个应用 |
| **C25** | Q04 | 默认同步间隔 15 分钟（逐接口频控按官方文档填） |
| **C30** | Q35 | 阶段一仅人工候选+评审，关闭自动采购/发布；数据源需合规审查 |

### 6.2 待确认（10 项）

| 编号 | 来源 | 问题 | 候选选项 |
| --- | --- | --- | --- |
| C14 | Q14 | 成本算法（杨洁+黄发聪+财务共同选） | **A** 柜次/批次／ **B** 移动加权／ **C** FIFO／ **D** 分平台 |
| C16 | Q22 | 部署模式、最高管理员、备份归属 | **A** 私有化／ **B** SaaS／ **C** 混合；管理员建议 ≥2 人 |
| C19 | Q25 | 验收人、缺陷 SLA、sandbox | 杨洁单人或联审；24h/48h/3 工作日；sandbox 是/否 |
| C21 | Q31 | 各页真实数据接入排期 | 按页填预计接入日期 |
| C22 | Q32 | 字段基线与抽检 | 以 V1.1 xlsx「页面功能字段」表为准（是/否）；抽检人杨洁 |
| C24 | Q03 | 售后/广告/IM 导入模板样例提供方 | 运营／ 财务+运营／ 开发草稿+运营改定 |
| C26 | Q12 | 审批人名单、「业务管理员」定义 | 杨洁单人／ 杨洁+蔡值／ 独立系统管理员角色 |
| C27 | Q16 | 广告费分摊规则、导入模板样例 | 按 GMV／ 按 SKU／ 按店铺月度人工 |
| C28 | Q17 | JSB 模板样例与去重键 | 开发草稿→货代确认；去重键 `jsb_batch_no+运单号` 待认可 |
| C29 | Q21 | 审计保留期限、恢复执行人 | 1 年/3 年/永久；仅超管／ 双人／ 分模块 |

### 6.3 已拍板、待填细节（5 项）

| 编号 | 已定 | 待填 |
| --- | --- | --- |
| C4 | 矩阵选 **B 修改** | 改动行清单（杨洁提供后更新 `erp-ued-data.ts` 对应设计） |
| C10 | 复核前禁产启用 | 复核责任人 + 截止日期 |
| C11 | 硬拒绝 + 0 超卖 | P99 时延阈值 |
| C18 | 仅库存+映射 | 抽查比例（5%/10%/全量）+ 旧码对照表来源 |
| C20 | Daraz LK 先 | P5 目标发布月（与 C7 同填） |

**剩余优先拍板**：C14（阻塞成本/利润公式）、C16（阻塞部署与备份方案）、C19（阻塞验收排期）。

## 7. 文档链接与后续动作

| 动作 | 落点 |
| --- | --- |
| 本文档登记 | [INDEX.md](./INDEX.md) §1 |
| Q10/Q20 口径修正 | `erp-requirements-q01-q35-dev-replies.md` Q10、Q20（按 C1 修订） |
| Q23/Q30 指向本文档 | 同上 Q23、Q30 增补 `@see` |
| R07 强约束 + 履历表 | `haoshiyun-erp-database-schema.md` §1.6、§16 Q10 行（按 C2 修订） |
| RBAC country scope + 六动作 | 同上 §9.1、§16 Q23 行（按 C5 修订） |
| 库位绑定履历交互 | `haoshiyun-erp-ued-catalog.md` §3.2；`console-menu-ia.md` §3.5 |
| 费用模板审核+历史取值 | `apps/shop/content/design/fee-templates-ued.md`（升版 v1.1） |
| 实现顺序 | 不在本文档排期；进入实现须先关闭对应确认项（§6.2） |
