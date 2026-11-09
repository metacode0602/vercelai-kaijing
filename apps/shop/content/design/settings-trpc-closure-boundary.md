# Settings tRPC 闭环边界（2026-11）

## 本轮已接

- `/console/settings/fx-rates` → `fxRates` → `fx_rates`（组织隔离；软停用；审计）
- `/console/settings/integration-log` → `integrationLogs` → `integration_logs`（shops join；payload 脱敏；重试仅关联真实 `sync_tasks`）
- `/console/settings/import-templates/[id]` → `importTemplates.update`（启用/停用/字段校验 + 审计）
- `/console/settings/members` → `invite` 用 `tenantProcedure`；`cancelInvitation` 仅 owner；**不发邮件**
- `/console/settings/platform-basics` → 只读参考 + 跳转 `/console/warehouse`（无假保存）

## 明确不做 / 诚实边界

- 成员邀请：只写 `invitation.status=pending`，UI 标明「待线下发送」；接受走现有 auth，不声称邮件已发送。
- 凭证 / OAuth / 店铺绑定：不改；继续只读 + 排队重授权。
- imports 批次、钉钉 webhook、preferences/profile、org 切换：本轮不现代化为假成功。
- 接口日志重试：无 `sync_tasks` 关联时返回错误，不写假任务。

## 迁移

- `0022_commerce_fx_rates_status`：`fx_rates.status` / `note` / `updated_at`
