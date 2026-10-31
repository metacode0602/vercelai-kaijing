# apps/docs — 文档站

面向用户与开发者的**文档站点**，基于 Fumadocs + Next.js 16，与业务应用解耦，仅共享 `@workspace/ui`。

## 定位

| 项 | 说明 |
| --- | --- |
| 使用者 | 租户、平台运营、第三方开发者 |
| 作用 | 承载产品说明、接入指南与 API 文档，独立发布 |
| 技术栈 | Next.js 16 App Router + Turbopack、Fumadocs（MDX）、AI SDK（检索/搜索） |

## 内容

- 只有 `content/docs/` 会被发布；当前为 Open Shop 文档入口。
- 产品文档整理中；仓库内设计与操作手册见 [`docs/README.md`](../../docs/README.md)。
- 新增页面后同步维护 `content/docs/meta.json`。

## 运行

```bash
pnpm install                  # postinstall 会执行 fumadocs-mdx 生成内容索引
pnpm --filter doc dev
```

访问 `http://localhost:6969`。

## 脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器（6969，Turbopack） |
| `pnpm build` / `pnpm start` | 生产构建 / 运行 |
| `pnpm typecheck` | 生成 Fumadocs 类型后执行 tsc |
| `pnpm lint` | ESLint |

## 相关文档

- 文档总入口：[docs/README.md](../../docs/README.md)
- 站点源约定：[content/README.md](content/README.md)
