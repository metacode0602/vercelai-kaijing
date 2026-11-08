# 模块9：库区页接库 + marketplace typecheck 稳定

> 状态：初版落地于 `feat/shop-wms-zones-typecheck`；**2026-11-07 已升级为真实库区表**（migration `0009_careless_tyrannus`，2026-11-08 重生成后并入 `0002_glamorous_bruce_banner.sql`）。
> Org：`org_shop_dev_demo`。

## 1. marketplace `drizzle-orm` 解析

**根因（develop）：** `@workspace/marketplace` 的 `src/db/credential-store.ts` 直接 `import … from "drizzle-orm"`，但 `packages/marketplace/package.json` 在 develop 上未声明该依赖（#13 从 auth 包拷贝时去掉了）。shop typecheck 会跟随 marketplace 源码入口解析，于是报 `TS2307 Cannot find module 'drizzle-orm'`。

**本栈修复：** 海运/WMS 前置提交 `058d152` 已把 `drizzle-orm` 写回 marketplace dependencies；本分支验证 `pnpm install` 后：

```bash
pnpm --filter @workspace/db typecheck
pnpm --filter shop typecheck
```

均通过。若本机 marketplace/node_modules 缺链路，再跑一次 `pnpm install`（lockfile 已含该依赖）。

## 2. 库区改真实表

`commerce_warehouse_zones` 新建（历史 `0009_careless_tyrannus.sql`，现于 `0002_glamorous_bruce_banner.sql`），后续读写全部走真实表；**迁移不回填** `raw.zones`。

| 数据 | 存放 |
| --- | --- |
| 库区元数据（名称/用途/状态/备注） | `commerce_warehouse_zones` |
| 库位归属 | `commerce_bins.warehouse_id` + `commerce_bins.zone_code` |
| 稳定 ID | `commerce_warehouse_zones.id` |

唯一键 `(organization_id, warehouse_id, code)`；编码创建后不可改。`wms.getZone` 仍兼容旧合成 id `{warehouseCode}:{zoneCode}` 便于旧链接跳转。

## 3. tRPC

新增（仍在 `wms` router）：

- `listZones` / `zoneStats` / `getZone`
- `createZone` / `updateZone`

页面：`/console/warehouse-zones`、详情；去掉 localStorage `createDemoStore` 与「库区（原型）」文案。侧栏不动。

## 4. 种子 / 验证

```bash
pnpm --filter @workspace/db db:migrate                    # 0000/0001/0002（历史 0009 并入 0002）
pnpm --filter @workspace/db db:seed:commerce-products
pnpm --filter @workspace/db db:seed:commerce-wms   # 含新库区表 A/B/C + 绑定履历 + inventory_pools
pnpm --filter @workspace/db typecheck
pnpm --filter shop typecheck
```

## 5. 仍缺口 / 未做

| 项 | 说明 |
| --- | --- |
| related-info 子表 | 详情主路径已是 `trpc.wms.*`；ERP demo 行已随 demo 清理移除（2026-11-08） |
| 左侧菜单 | 不改 |
