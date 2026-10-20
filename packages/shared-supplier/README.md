# @workspace/shared-supplier — 供应商共享通知

供应商侧流程结果的**通知实现**，供平台侧在关键节点复用，避免在多个应用里重复写通知逻辑。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 封装供应商相关的通知发送 |
| 消费方 | `apps/web`（平台侧触发）等需要通知供应商的模块 |
| 依赖 | `@workspace/email` 等通知通道 |

## 主要功能

| 导出 | 触发时机 |
| --- | --- |
| `notifySupplierOnboardingResult` | 供应商入驻审核结果 |
| `notifySupplierRetireResult` | 设备/供应商退役结果 |
| `notifyBillGenerated` | 账单生成 |

## 运行

```bash
pnpm --filter @workspace/shared-supplier run lint
pnpm --filter @workspace/shared-supplier run typecheck
```

发送通知前需配置根目录 `.env` 中的邮件通道变量（`SMTP_*`，见 `.env.example`）。

## 部署

**不独立部署**，随调用方应用发布。

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- 邮件能力：[packages/email](../email/README.md)
