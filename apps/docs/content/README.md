# `apps/docs/content/` 目录

**本目录下只有 `docs/` 会被发布**，其余子目录是文档站模块自身的仓库文档。

| 目录 | 性质 | 是否发布 | 说明 |
| --- | --- | --- | --- |
| `docs/` | fumadocs 站点源 | ✅ 发布 | 由 `source.config.ts` 的 `dir: "content/docs"` 指定 |

## 重要约定

- **不要改 `source.config.ts` 的 `dir`**：改动会同时影响 `meta.json`、站内链接、OG 与搜索索引。
- 新增**面向用户**的文档 → 放 `docs/`（会发布），需同步维护 `docs/meta.json`。
- 新增**面向开发者**的运维/设计手册 → 放 `docs/design/` 或 `<app>/content/`，不要放进 `content/docs/`。

## 相关索引

- 全仓文档总入口：[`docs/README.md`](../../../docs/README.md)
- 设计文档清单：[`docs/design/INDEX.md`](../../../docs/design/INDEX.md)
