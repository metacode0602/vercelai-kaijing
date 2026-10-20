# `apps/web/content/` 文档目录

运营平台的仓库文档（**不被代码读取**，纯 markdown 供开发者查阅）。

## 分类

| 目录 | 类别 | 数量 | 说明 |
| --- | --- | --- | --- |
| `design/` | 设计 | 74 | 系统应该怎么建。含 `sla/`、`reports/`（实施计划与指标口径）、`audit/`（设计-实现差距） |
| `guide/` | 操作手册 | 7 | 人该怎么操作：初始化、配置、运营指引、排障 |
| `business/` | 商业方案 | 3 | 怎么卖：SOP、供应商产品规划、合同管理 |
| `legal/` | 对外合规 | 6 | 隐私 / 条款 / 安全 — **原位保留，不参与三分类** |
| `pages/` | 站点内容 | 6 | `.mdx` 站点法律页与版本发布（`release/` 2 份） |

## 索引

- 顶层跨模块设计与全仓索引：[`docs/README.md`](../../../docs/README.md)
- 本模块设计清单：[`docs/design/INDEX.md`](../../../docs/design/INDEX.md) §4
- 本模块手册清单：[`docs/guide/INDEX.md`](../../../docs/guide/INDEX.md) §2
- 本模块商业方案：[`docs/business/INDEX.md`](../../../docs/business/INDEX.md) §2

## 新增文档

1. 按判定顺序分类：设计 → `design/`，操作手册 → `guide/`，商业 → `business/`
2. 跨多个模块、无单一归属的，上提到 `docs/{design,guide,business}/`
3. 流程图用 mermaid（见 `AGENTS.md` → 设计文档约定）
4. 代码里用 `@see <仓库根相对路径> §章节号` 指向设计文档
