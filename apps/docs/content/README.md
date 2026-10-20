# `apps/docs/content/` 目录

**本目录下只有 `docs/` 会被发布**，其余子目录是文档站模块自身的仓库文档。

| 目录 | 性质 | 是否发布 | 说明 |
| --- | --- | --- | --- |
| `docs/` | fumadocs 站点源 | ✅ 发布 | 由 `source.config.ts` 的 `dir: "content/docs"` 指定，92 份，含 `guides/`（用户 quickstart）、`api-reference/`、`meta.json` |
| `guide/` | 内部运维手册 | ❌ 不发布 | 13 份平台部署运维手册（中心集群 / IDC 边缘 / Karmada / Capsule / Volcano / SkyPilot / 监控 …） |
| `business/` | 内部文档 | ❌ 不发布 | 空（商业化类已上提 `docs/business/`） |
| `design/` | — | — | 已清空：架构类上提 [`docs/design/{cloud,gpus,k8s}`](../../../docs/design/INDEX.md) §3 |

## 重要约定

- **不要改 `source.config.ts` 的 `dir`**：改动会同时影响 `meta.json`、站内链接、OG 与搜索索引，收益小于风险
- 新增**面向用户**的文档 → 放 `docs/`（会发布），需同步维护 `docs/meta.json`
- 新增**面向开发者**的运维/设计手册 → 放 `content/guide/` 或按分类上提 `docs/{design,guide}/`

## 相关索引

- 运维手册清单：[`docs/guide/INDEX.md`](../../../docs/guide/INDEX.md) §4
- 平台架构设计：[`docs/design/INDEX.md`](../../../docs/design/INDEX.md) §3
- 全仓文档总入口：[`docs/README.md`](../../../docs/README.md)
