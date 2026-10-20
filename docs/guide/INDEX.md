# 操作手册索引

> 全仓 guide（操作手册）清单：**跨模块手册在本目录，模块内手册就地存放在 `<app>/content/guide/`。**

## 1. 跨模块手册（`docs/guide/`）

| 文档 | 定位 |
| --- | --- |
| [invoice-upload-test-guide.md](invoice-upload-test-guide.md) | 发票上传测试指南 |
| [supplier-idc-provisioning-checklist.md](../../apps/supplier/content/guide/supplier-idc-provisioning-checklist.md) | 供应商机房交付清单（一次性就绪检查 / 控制主机配置 / 验收勾选表 / 上下线窗口流程） |

## 2. `apps/web` 手册（`apps/web/content/guide/`）

| 文档 | 定位 |
| --- | --- |
| [platform-admin-initialization.md](../../apps/web/content/guide/platform-admin-initialization.md) | 平台管理员初始化（配套 SQL：`platform-admin-init.sql`） |
| [supplier-platform-operation-guide.md](../../apps/web/content/guide/supplier-platform-operation-guide.md) | 供应商平台运营手册 |
| [supplier-device-onboarding-user-guide.md](../../apps/web/content/guide/supplier-device-onboarding-user-guide.md) | 供应商设备上架操作指引 |
| [contract-device-closed-loop-user-guide.md](../../apps/web/content/guide/contract-device-closed-loop-user-guide.md) | 合同-设备闭环操作指引 |
| [merchant-payment-channel-configuration.md](../../apps/web/content/guide/merchant-payment-channel-configuration.md) | 商户支付渠道配置 |
| [feishu-env-configuration.md](../../apps/web/content/guide/feishu-env-configuration.md) | 飞书集成环境配置 |
| [984-baremetal-order-summary.md](../../apps/web/content/guide/984-baremetal-order-summary.md) | 984 裸金属订单汇总操作 |
| [global-dashboard-lifecycle-funnel-pending-access-troubleshooting.md](../design/archive/global-dashboard-lifecycle-funnel-pending-access-troubleshooting.md) | 大盘生命周期漏斗 pending-access 排障 |

## 3. `apps/merchant` 手册（`apps/merchant/content/guide/`）

| 文档 | 定位 |
| --- | --- |
| [index.md](../../apps/merchant/content/guide/index.md) | 商户侧手册入口 |

## 4. `apps/docs` 运维手册（`apps/docs/content/guide/`，13 份）

平台部署与运维，按集群类型顺序阅读：

| 文档 | 定位 |
| --- | --- |
| [00-overview.md](../../apps/docs/content/guide/00-overview.md) | 运维总览与阅读顺序 |
| [01-central-cluster.md](../../apps/docs/content/guide/01-central-cluster.md) | 中心集群 |
| [02-idc-edge-cluster.md](../../apps/docs/content/guide/02-idc-edge-cluster.md) | IDC 边缘集群 |
| [03-karmada-multicluster.md](../../apps/docs/content/guide/03-karmada-multicluster.md) | Karmada 多集群 |
| [04-capsule-multitenancy.md](../../apps/docs/content/guide/04-capsule-multitenancy.md) | Capsule 多租户 |
| [05-volcano-scheduling.md](../../apps/docs/content/guide/05-volcano-scheduling.md) | Volcano 调度 |
| [06-skypilot-control.md](../../apps/docs/content/guide/06-skypilot-control.md) | SkyPilot 控制面 |
| [07-monitoring-stack.md](../../apps/docs/content/guide/07-monitoring-stack.md) | 监控栈 |
| [08-openroute-platform.md](../../apps/docs/content/guide/08-openroute-platform.md) | 开放路由平台 |
| [09-edge-agent.md](../../apps/docs/content/guide/09-edge-agent.md) | 边缘 Agent |
| [10-verification.md](../../apps/docs/content/guide/10-verification.md) | 验证步骤 |
| [11-bare-metal-infra.md](../../apps/docs/content/guide/11-bare-metal-infra.md) | 裸金属基础设施 |
| [12-openmeter.md](../../apps/docs/content/guide/12-openmeter.md) | OpenMeter 接入 |

## 5. `goes/` 手册（`goes/docs/guide/`）

[deployment.md](../../goes/docs/guide/deployment.md) · [troubleshooting.md](../../goes/docs/guide/troubleshooting.md)

## 6. 不在本分类的用户手册

面向最终用户的 quickstart / API 使用说明位于 **fumadocs 站点源** `apps/docs/content/docs/guides/`（会被发布到文档站），不参与本分类，见 [apps/docs/content/README.md](../../apps/docs/content/README.md)。
