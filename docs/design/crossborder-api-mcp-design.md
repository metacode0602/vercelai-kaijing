# apps/api：OpenAPI + MCP 设计（确认后再实现）

## OpenAPI（延续现有）

- 前缀 `/api/v1`
- Scalar `/docs`
- 鉴权：API Key（绑定 organization_id + scopes）+ 现有 better-auth 会话路径

MVP 资源（P1）：shops、products、listings、orders、inventory、pending-actions、candidates。

## MCP

- Transport：Streamable HTTP（供 OpenWork / Cursor）
- 与 OpenAPI **共用 domain 服务**（禁止两套写路径）
- Tools（初版）：

| Tool | Scope |
|------|-------|
| `cb.list_shops` | read |
| `cb.upsert_product_candidate` | write → 默认可创建 pending |
| `cb.list_product_candidates` | read |
| `cb.list_pending_actions` | read |
| `cb.confirm_pending_action` | confirm |
| `cb.reject_pending_action` | confirm |
| `cb.create_listing_draft` | write |
| `cb.list_orders` | read |
| `cb.get_inventory` | read |
| `cb.request_sync` | write |

P0 只落设计；实现与 tRPC 同批。
