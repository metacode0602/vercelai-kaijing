/**
 * 账户只读接口 — 设计 §3.6
 *
 *   GET /api/v1/account          scope=balance:read
 *   GET /api/v1/account/ledger   scope=balance:read
 *
 * 硬性约束同 consumption：**merchantId 只来自 API-Key 凭证**，不接受入参。
 * 两个端点都是只读，因此不需要 Idempotency-Key；但流水查询必须走数据库分页
 * （count + limit/offset），禁止把全量流水拉给调用方。
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  getMerchantAvailableTotal,
  getOrCreateMerchantAccount,
  listMerchantLedger,
  listMerchantPoolBalances,
} from "@workspace/billing"
import {
  MERCHANT_ACCOUNT_LEDGER_DIRECTIONS,
  MERCHANT_ACCOUNT_LEDGER_REF_TYPES,
  MERCHANT_ACCOUNT_POOLS,
} from "@workspace/db/schema"
import { requireMerchantApiKey, requireMerchantAuth } from "../lib/api-key-auth"
import { db } from "../lib/db"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PoolSchema = z
  .object({
    pool: z.enum(MERCHANT_ACCOUNT_POOLS),
    available: z.number(),
    reserved: z.number(),
    total: z.number(),
  })
  .openapi("AccountPool")

const AccountResponseSchema = z
  .object({
    merchant_id: z.string(),
    currency: z.string(),
    /** 逐池实时值（券 / 现金 / 授信） */
    pools: z.array(PoolSchema),
    /** 三池 available 合计 */
    available_total: z.number(),
    credit_limit: z.number(),
    credit_used: z.number(),
    frozen: z.number(),
    auto_recharge_enabled: z.boolean(),
    auto_recharge_amount: z.number(),
  })
  .openapi("AccountResponse")

const LedgerItemSchema = z
  .object({
    id: z.string(),
    pool: z.string(),
    direction: z.string(),
    effect: z.string().optional(),
    amount: z.number(),
    balance_before: z.number(),
    balance_after: z.number(),
    ref_type: z.string(),
    ref_id: z.string().nullable(),
    idempotency_key: z.string(),
    trace_id: z.string().nullable(),
    external_user_ref: z.string().nullable(),
    description: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    occurred_at: z.coerce.date(),
  })
  .openapi("AccountLedgerItem")

const LedgerQuerySchema = z
  .object({
    pool: z.enum(MERCHANT_ACCOUNT_POOLS).optional(),
    direction: z.enum(MERCHANT_ACCOUNT_LEDGER_DIRECTIONS).optional(),
    ref_type: z.enum(MERCHANT_ACCOUNT_LEDGER_REF_TYPES).optional(),
    external_user_ref: z.string().max(128).optional(),
    trace_id: z.string().max(128).optional(),
    occurred_from: z.coerce.date().optional(),
    occurred_to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .openapi("AccountLedgerQuery")

const LedgerResponseSchema = z
  .object({
    items: z.array(LedgerItemSchema),
    total: z.number(),
    page: z.number(),
    page_size: z.number(),
  })
  .openapi("AccountLedgerResponse")

const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    message: z.string().optional(),
    requiredScope: z.string().optional(),
  })
  .openapi("ErrorResponse")

function errorBody(error: string, code: string, message: string, requiredScope?: string) {
  return { error, code, message, requiredScope }
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const account = new OpenAPIHono()

account.use("/*", requireMerchantApiKey("balance:read"))

account.openapi(
  createRoute({
    method: "get",
    path: "/",
    summary: "Get merchant account balances",
    description:
      "返回商户账户三池（券/现金/授信）实时值。merchantId 由 API-Key 凭证派生，不接受入参。",
    tags: ["Account"],
    responses: {
      200: {
        description: "账户余额",
        content: { "application/json": { schema: AccountResponseSchema } },
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

    // 新商户首次调用会补建账户行（幂等），与 debit/prepay 的自举路径一致
    const accountRow = await getOrCreateMerchantAccount(db, auth.merchantId)
    const pools = await listMerchantPoolBalances(db, auth.merchantId)
    const availableTotal = await getMerchantAvailableTotal(db, auth.merchantId)

    return c.json({
      merchant_id: auth.merchantId,
      currency: accountRow.currency,
      pools: MERCHANT_ACCOUNT_POOLS.map((pool) => {
        const row = pools.find((p) => p.pool === pool)
        return {
          pool,
          available: num(row?.available),
          reserved: num(row?.reserved),
          total: num(row?.total),
        }
      }),
      available_total: availableTotal,
      credit_limit: num(accountRow.creditLimit),
      credit_used: num(accountRow.creditUsed),
      frozen: num(accountRow.frozen),
      auto_recharge_enabled: accountRow.autoRechargeEnabled,
      auto_recharge_amount: num(accountRow.autoRechargeAmount),
    }, 200)
  },
)

account.openapi(
  createRoute({
    method: "get",
    path: "/ledger",
    summary: "List merchant account ledger entries",
    description:
      "商户账户流水分页查询（数据库级分页，page ≤ 1 / page_size ≤ 100）。merchantId 由凭证派生。",
    tags: ["Account"],
    request: { query: LedgerQuerySchema },
    responses: {
      200: {
        description: "流水分页结果",
        content: { "application/json": { schema: LedgerResponseSchema } },
      },
      400: {
        description: "参数错误",
        content: { "application/json": { schema: ErrorResponseSchema } },
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
    const q = c.req.valid("query")

    if (q.occurred_from && q.occurred_to && q.occurred_from > q.occurred_to) {
      return c.json(
        errorBody("bad_request", "INVALID_TIME_RANGE", "occurred_from 不能晚于 occurred_to"),
        400,
      )
    }

    const result = await listMerchantLedger(db, {
      merchantId: auth.merchantId,
      pool: q.pool,
      direction: q.direction,
      refType: q.ref_type,
      externalUserRef: q.external_user_ref,
      traceId: q.trace_id,
      occurredFrom: q.occurred_from,
      occurredTo: q.occurred_to,
      page: q.page,
      pageSize: q.page_size,
    })

    return c.json({
      items: result.items.map((row) => ({
        id: row.id,
        pool: row.pool,
        direction: row.direction,
        amount: num(row.amount),
        balance_before: num(row.balanceBefore),
        balance_after: num(row.balanceAfter),
        ref_type: row.refType,
        ref_id: row.refId,
        idempotency_key: row.idempotencyKey,
        trace_id: row.traceId,
        external_user_ref: row.externalUserRef,
        description: row.description,
        metadata: row.metadata,
        occurred_at: row.occurredAt,
      })),
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
    }, 200)
  },
)

export default account
