# 组织级 RBAC 阶段 A+B（shop）

> 状态：已实现（2026-11-10）  
> 对应页：`/settings/erp-access`、`/settings/members`  
> 基线：`develop` @ `8f17614`（设置区已独立为 `/settings`）

## 模型

- 两层：better-auth `member.role` 只表示组织身份；`owner` / 入驻写入的 `tenant_owner` 隐式拥有全部权限与 `scope=all`。
- 业务能力在 `roles` / `role_permissions` / `member_roles` / `role_scopes`（无 `erp_` 前缀）。
- 一人可绑多角色；权限与数据范围均取并集。
- 表结构由 `packages/db/src/rbac-columns.ts` 工厂定义：`public` 落地租户数据，`web_auth` 有同形空表（无平台种子/UI）。不在单表加 `realm`/`app` 混放。
- 权限引擎在 `@workspace/auth`（`requirePermission` 语义：owner 放行、六动作、`module.action`）。

## 本轮范围（A+B）

- 每组织幂等种子六个系统角色：`biz_admin` / `buyer` / `operator` / `finance` / `viewer` / `it_tech`。`it.impersonate` 预留且默认关闭。
- 角色列表/详情（矩阵、数据范围、成员绑定）、邀请改选业务角色（默认可多选 `operator`）。
- 侧栏按 `*.read` 隐藏无权限入口。
- 敏感写强制：角色管理、成员邀请/改角色/撤销邀请、费用模板发布、结算确认。写入 `audit_events`。
- 存量映射：保留 owner；`admin` → `biz_admin`；`viewer` → `viewer`；其余 → `operator`；非 owner 的 `member.role` 归一为 `member`。

## 延期

- 阶段 C：其余业务 router 从裸 `tenantProcedure` 换权。
- `apps/web` 权限 UI 与 `protectedProcedure` 细粒度接入。
- 列表接口按 country/marketplace/platform 范围过滤（本轮店铺/仓库过滤助手已就绪，业务列表接线随阶段 C）。
