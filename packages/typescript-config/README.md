# @workspace/typescript-config — 共享 TypeScript 预设

全仓统一的 **tsconfig 预设**，按「Node 应用 / Next.js 应用 / React 库」三类场景提供可直接 `extends` 的配置。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 集中管理编译选项，保证各包的 `strict`、模块解析与 JSX 行为一致 |
| 消费方 | `apps/*` 与 `packages/*` 的 `tsconfig.json` |

## 预设

| 文件 | 适用 |
| --- | --- |
| `base.json` | 基础配置，其余预设都继承它 |
| `node.json` | Node.js 应用与包（`api`、`db`、`auth`、`billing`…） |
| `nextjs.json` | Next.js 应用（`web`、`merchant`、`supplier`、`gpus`、`docs`） |
| `react-library.json` | React 组件库（`ui`） |

## 使用

```json
{
  "extends": "@workspace/typescript-config/node.json",
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

## 运行 / 部署

本包无脚本、无服务，**不独立部署**。修改预设会影响全仓类型检查结果，改完请跑一次：

```bash
pnpm typecheck
```

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
