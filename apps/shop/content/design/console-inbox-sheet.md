# Console 站内信 Sheet（soft note）

> 状态：已接 `trpc.notifications`（`console_notifications`）· 与 Copilot 布局列共存（**2026-11-08 更新**，原 DEMO/mock）

## 交互

- 顶栏铃铛打开 **右侧 Sheet**（`@workspace/ui` Sheet overlay），不整页跳转。
- 列表：未读圆点、分类 Badge、标题、摘要、相对时间；点击打开 Dialog 详情并标记已读。
- 「全部已读」清空未读角标。
- **Copilot** 仍是布局右栏；站内信是 overlay drawer，二者可同时存在。

## 非目标（本迭代）

- ~~无 tRPC / 真实 `site_messages` 读写~~（**2026-11-08**：已接 `trpc.notifications` 读写 `console_notifications`；`site_messages` 外传通道仍为后续项）
- 无 `/console/assistant`、无 AppShell 改动
