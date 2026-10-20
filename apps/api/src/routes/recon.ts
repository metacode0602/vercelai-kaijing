/**
 * 对账单只读接口 — 设计 §3.6 / merchant-module-review-and-design.md §5.6
 *
 *   GET /api/v1/recon/statements       scope=recon:read  对账单分页列表
 *   GET /api/v1/recon/statements/:id   scope=recon:read  单张对账单 + 差异分页
 *
 * 硬性约束：
 *   1. `merchantId` **只**来自 API-Key 凭证，绝不接受入参（P0-6）。
 *   2. 只读：确认/申诉/调账不开放给 OpenAPI，商户必须走控制台（§5.6 规则）。
 *   3. 分页一律走数据库级 count + limit/offset。
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { and, count, desc, eq, type SQL } from "drizzle-orm"
import {
  MERCHANT_RECON_DIFF_STATUSES,
  MERCHANT_RECON_DIFF_TYPES,
  MERCHANT_RECON_STATEMENT_STATUSES,
  merchantReconDiff,
  merchantReconStatement,
} from "@workspace/db/schema"
import { requireMerchantApiKey, requireMerchantAuth } from "../lib/api-key-auth"
import { db } from "../lib/db"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    message: z.string().optional(),
    requiredScope: z.string().optional(),
  })
  .openapi("ErrorResponse")

const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
})

const StatementItemSchema = z
  .object({
    id: z.string(),
    period_type: z.string(),
    period_start: z.string(),
    period_end: z.string(),
    platform_amount: z.number(),
    merchant_amount: z.number(),
    resource_amount: z.number(),
    diff_amount: z.number(),
    match_rate: z.number(),
    matched_count: z.number().int(),
    total_count: z.number().int(),
    uncomparable_count: z.number().int(),
    status: z.enum(MERCHANT_RECON_STATEMENT_STATUSES),
    generated_at: z.string().nullable(),
    confirmed_at: z.string().nullable(),
    dispute_reason: z.string().nullable(),
  })
  .openapi("ReconStatement")

const StatementsResponseSchema = z
  .object({
    merchant_id: z.string(),
    items: z.array(StatementItemSchema),
    total: z.number().int(),
    page: z.number().int(),
    page_size: z.number().int(),
  })
  .openapi("ReconStatementsResponse")

const DiffItemSchema = z
  .object({
    id: z.string(),
    recon_date: z.string(),
    request_id: z.string().nullable(),
    diff_type: z.enum(MERCHANT_RECON_DIFF_TYPES),
    platform_amount: z.number(),
    resource_amount: z.number(),
    resource_qty: z.number(),
    status: z.enum(MERCHANT_RECON_DIFF_STATUSES),
    resolution: z.string().nullable(),
    note: z.string().nullable(),
  })
  .openapi("ReconDiff")

const StatementDetailSchema = z
  .object({
    statement: StatementItemSchema,
    diffs: z.array(DiffItemSchema),
    diff_total: z.number().int(),
    diff_page: z.number().int(),
    diff_page_size: z.number().int(),
  })
  .openapi("ReconStatementDetail")

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

type StatementRow = typeof merchantReconStatement.$inferSelect

function toStatementItem(row: StatementRow) {
  return {
    id: row.id,
    period_type: row.periodType,
    period_start: row.periodStart,
    period_end: row.periodEnd,
    platform_amount: num(row.platformAmount),
    merchant_amount: num(row.merchantAmount),
    resource_amount: num(row.resourceAmount),
    diff_amount: num(row.diffAmount),
    match_rate: num(row.matchRate),
    matched_count: row.matchedCount,
    total_count: row.totalCount,
    uncomparable_count: row.uncomparableCount,
    status: row.status as (typeof MERCHANT_RECON_STATEMENT_STATUSES)[number],
    generated_at: row.generatedAt ? row.generatedAt.toISOString() : null,
    confirmed_at: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    dispute_reason: row.disputeReason,
  }
}

type DiffRow = typeof merchantReconDiff.$inferSelect

function toDiffItem(row: DiffRow) {
  return {
    id: row.id,
    recon_date: row.reconDate,
    request_id: row.requestId,
    diff_type: row.diffType as (typeof MERCHANT_RECON_DIFF_TYPES)[number],
    platform_amount: num(row.platformAmount),
    resource_amount: num(row.resourceAmount),
    resource_qty: num(row.resourceQty),
    status: row.status as (typeof MERCHANT_RECON_DIFF_STATUSES)[number],
    resolution: row.resolution,
    note: row.note,
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const recon = new OpenAPIHono()

recon.use("/*", requireMerchantApiKey("recon:read"))

recon.openapi(
  createRoute({
    method: "get",
    path: "/statements",
    summary: "List merchant reconciliation statements",
    description:
      "对账单分页列表（数据库级分页）。merchantId 由 API-Key 凭证派生，不接受入参。",
    tags: ["Recon"],
    request: { query: PageQuerySchema },
    responses: {
      200: {
        description: "对账单分页结果",
        content: { "application/json": { schema: StatementsResponseSchema } },
      },
      401: {
        description: "凭证缺失/无效/过期",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: { description: "scope 不足", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
  }),
  async (c) => {
    const auth = requireMerchantAuth(c)
    const { page, page_size } = c.req.valid("query")
    const where = eq(merchantReconStatement.merchantId, auth.merchantId)

    const [totalRow, rows] = await Promise.all([
      db.select({ total: count() }).from(merchantReconStatement).where(where),
      db
        .select()
        .from(merchantReconStatement)
        .where(where)
        .orderBy(desc(merchantReconStatement.periodStart))
        .limit(page_size)
        .offset((page - 1) * page_size),
    ])

    return c.json(
      {
        merchant_id: auth.merchantId,
        items: rows.map(toStatementItem),
        total: Number(totalRow[0]?.total ?? 0),
        page,
        page_size,
      },
      200,
    )
  },
)

recon.openapi(
  createRoute({
    method: "get",
    path: "/statements/{id}",
    summary: "Get one reconciliation statement with diffs",
    description:
      "单张对账单 + 差异明细分页。merchantId 由 API-Key 凭证派生，越权返回 404。",
    tags: ["Recon"],
    request: {
      params: z.object({ id: z.string().min(1) }),
      query: PageQuerySchema,
    },
    responses: {
      200: {
        description: "对账单与差异明细",
        content: { "application/json": { schema: StatementDetailSchema } },
      },
      401: {
        description: "凭证缺失/无效/过期",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: { description: "scope 不足", content: { "application/json": { schema: ErrorResponseSchema } } },
      404: {
        description: "对账单不存在（或不属于本商户）",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const auth = requireMerchantAuth(c)
    const { id } = c.req.valid("param")
    const { page, page_size } = c.req.valid("query")

    const [statement] = await db
      .select()
      .from(merchantReconStatement)
      .where(
        and(
          eq(merchantReconStatement.id, id),
          eq(merchantReconStatement.merchantId, auth.merchantId),
        ),
      )
      .limit(1)

    if (!statement) {
      return c.json({ error: "not_found", code: "RECON_STATEMENT_NOT_FOUND" }, 404)
    }

    const diffWhere: SQL = and(
      eq(merchantReconDiff.statementId, statement.id),
      eq(merchantReconDiff.merchantId, auth.merchantId),
    ) as SQL

    const [totalRow, rows] = await Promise.all([
      db.select({ total: count() }).from(merchantReconDiff).where(diffWhere),
      db
        .select()
        .from(merchantReconDiff)
        .where(diffWhere)
        .orderBy(merchantReconDiff.reconDate)
        .limit(page_size)
        .offset((page - 1) * page_size),
    ])

    return c.json(
      {
        statement: toStatementItem(statement),
        diffs: rows.map(toDiffItem),
        diff_total: Number(totalRow[0]?.total ?? 0),
        diff_page: page,
        diff_page_size: page_size,
      },
      200,
    )
  },
)

export default recon
