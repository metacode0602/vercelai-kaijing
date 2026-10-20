import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { syncPurchasePricesToBrandSites } from "@workspace/db/merchant-purchase-price-sync"
import { db } from "../lib/db"
import { requireInternalSyncKey } from "../lib/api-key-auth"

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error")

const SyncResultSchema = z
  .object({
    merchantId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  })
  .openapi("SyncResult")

const SyncResponseSchema = z
  .object({
    total: z.number(),
    success: z.number(),
    failed: z.number(),
    results: z.array(SyncResultSchema),
  })
  .openapi("SyncPurchasePricesResponse")

const sync = new OpenAPIHono()

// 内部同步是平台级动作：用独立共享密钥鉴权，与商户 API-Key 体系隔离（P0-6）。
// 之前这段鉴权被整段注释掉，/api/v1/sync/purchase-prices 对外完全裸奔。
sync.use("/*", requireInternalSyncKey())

// POST /sync/purchase-prices - 触发进货价同步 (仅平台内部调用)
sync.openapi(
  createRoute({
    method: "post",
    path: "/purchase-prices",
    summary: "Sync purchase prices to brand sites",
    description: "平台内部触发进货价同步到所有 OEM 品牌站（Q15=B）",
    tags: ["Sync"],
    request: {
      query: z.object({
        dryRun: z.coerce.boolean().optional().default(false),
        apiKey: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Sync completed",
        content: {
          "application/json": {
            schema: SyncResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid("query")

    const result = await syncPurchasePricesToBrandSites(db, query.dryRun)

    return c.json(result, 200)
  },
)

export default sync
