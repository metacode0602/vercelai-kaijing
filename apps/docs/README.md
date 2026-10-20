# apps/docs — 文档站

面向用户与开发者的**文档站点**，基于 Fumadocs + Next.js 16，与业务应用完全解耦，仅共享 `@workspace/ui`。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 最终用户、商户、开发者（API / 产品文档） |
| 作用 | 承载产品说明、接入指南与 OpenAPI 相关文档，独立于业务应用发布 |
| 技术栈 | Next.js 16 App Router + Turbopack、[Fumadocs](https://fumadocs.vercel.app)（MDX）、AI SDK（检索/搜索） |

## 主要功能

- MDX 文档渲染与侧边栏导航（Fumadocs 内容目录）
- 文档搜索（AI SDK）
- 构建期生成 Fumadocs 类型（`postinstall` / `typecheck` 中执行 `fumadocs-mdx`）

## 运行

```bash
pnpm install                  # postinstall 会执行 fumadocs-mdx 生成内容索引
pnpm --filter doc dev         # 或 pnpm --filter docs dev
```

访问 `http://localhost:6969`。

> 文档内容与业务代码分离：新增文档只需在内容目录添加 MDX，不涉及数据库与认证。

## 部署

```bash
pnpm docker:build:docs       # docker/Dockerfile --target docs → gongji-crm-docs:latest
```

```bash
pnpm --filter doc build      # next build
pnpm --filter doc start      # next start --port 6969
```

文档站无数据库依赖，可独立于应用发布；若需与应用同域部署，由反代按路径分流即可。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（6969，Turbopack） |
| `pnpm build` / `pnpm start` | 生产构建 / 运行 |
| `pnpm typecheck` | 生成 Fumadocs 类型后执行 tsc |
| `pnpm lint` | ESLint |

## 相关文档

- 模块协作关系：[根 README](../../README.md#模块协作关系)
