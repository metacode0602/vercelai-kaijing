# @workspace/eslint-config — 共享 ESLint 预设

全仓统一的 **ESLint 9 flat config** 预设，各应用/包只需一行 import 即可获得一致的规则集。

## 定位

| 项 | 说明 |
| --- | --- |
| 作用 | 集中管理 lint 规则，避免每个包各写一份配置 |
| 消费方 | `apps/*` 与 `packages/*` 的 `eslint.config.js` |

## 预设

| 导出 | 适用 |
| --- | --- |
| `@workspace/eslint-config/base` | 任意 TypeScript 包 |
| `@workspace/eslint-config/node` | Node.js 应用与包（`api`、`db`、`auth`…） |
| `@workspace/eslint-config/next-js` | Next.js 应用 |
| `@workspace/eslint-config/react-internal` | React 组件库（`ui`） |

## 使用

```js
// eslint.config.js
import config from "@workspace/eslint-config/node"

export default [...config]
```

## 包含的插件

- `@typescript-eslint`（parser + plugin）
- `eslint-config-prettier`（关闭与格式化冲突的规则）
- `eslint-plugin-turbo`（Turborepo 环境变量规则）
- `eslint-plugin-react` + `react-hooks`（React 预设）
- `@next/eslint-plugin-next`（Next.js 预设）
- `eslint-plugin-only-warn`（全部规则降级为 warning）

## 运行 / 部署

本包无可运行服务，也**不独立部署**。修改规则会影响全仓 lint 结果，改完请跑一次：

```bash
pnpm lint
```

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
- lint / typecheck 基线与已知问题：[AGENTS.md](../../AGENTS.md)
