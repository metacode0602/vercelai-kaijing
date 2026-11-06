# 模块9：库区页接库 + marketplace typecheck 稳定

> 状态：落地于 `feat/shop-wms-zones-typecheck`（叠在 module8 WMS / PR#45 之上，**不合并** #43/#44/#45）。
> Org：`org_shop_dev_demo`。无新 migration。

## 1. marketplace `drizzle-orm` 解析

**根因（develop）：** `@workspace/marketplace` 的 `src/db/credential-store.ts` 直接 `import … from "drizzle-orm"`，但 `packages/marketplace/package.json` 在 develop 上未声明该依赖（#13 从 auth 包拷贝时去掉了）。shop typecheck 会跟随 marketplace 源码入口解析，于是报 `TS2307 Cannot find module 'drizzle-orm'`。

**本栈修复：** 海运/WMS 前置提交 `058d152` 已把 `drizzle-orm` 写回 marketplace dependencies；本分支验证 `pnpm install` 后：

```bash
pnpm --filter @workspace/db typecheck
pnpm --filter shop typecheck
```

均通过。若本机 marketplace/node_modules 缺链路，再跑一次 `pnpm install`（lockfile 已含该依赖）。

## 2. 库区无独立表

无 `commerce_warehouse_zones` 表。约定：

| 数据 | 存放 |
| --- | --- |
| 库区元数据（名称/用途/状态/备注） | `commerce_warehouses.raw.zones[]` |
| 库位归属 | `commerce_bins.zone_code` |
| 稳定 ID | `{warehouseCode}:{zoneCode}` |

`wms.listZones` 合并 raw.zones 与 bins 上出现过的 zone_code；新建库区只写 raw；编辑不改编码。

## 3. tRPC

新增（仍在 `wms` router）：

- `listZones` / `zoneStats` / `getZone`
- `createZone` / `updateZone`

页面：`/console/warehouse-zones`、详情；去掉 localStorage `createDemoStore` 与「库区（原型）」文案。侧栏不动。

## 4. 种子 / 验证

```bash
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-wms   # 含 WH-CN-XMN-001.raw.zones A/B/C
pnpm --filter @workspace/db typecheck
pnpm --filter shop typecheck
```

## 5. 仍 mock / 未做

| 项 | 说明 |
| --- | --- |
| related-info 子表 | 仍可读 ERP demo 行；详情主路径已是 wms |
| 独立 zone 表 / 迁移 | 刻意不做 |
| #43/#44/#45 合并 | 按产品要求保持未合并 |
| 左侧菜单 | 不改 |
