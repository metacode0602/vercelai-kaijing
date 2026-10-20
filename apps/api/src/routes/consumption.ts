/**
 * POST /api/v1/consumption/debit — 设计 §3.6
 *
 * 商户（B/C 形态）上报一笔已发生的算力消费，平台实时从商户账户扣减额度。
 *
 * 硬性约束：
 *   1. `merchantId` **只**来自 API-Key 凭证。放进 body 就会重演 P0-6：
 *      商户 A 改个参数即可扣商户 B 的额度。
 *   2. 必须带 `Idempotency-Key`。网关/商户两侧都会重试，重复扣减等于直接烧钱。
 *      命中幂等时回放首次结果，并置 `X-Idempotent-Replay: true`。
 *   3. 额度不足返回 402（设计 §3.6 统一错误码），不做「扣到能扣为止」的部分扣减
 *      —— 半笔账会让商户无法判断这笔消费到底算不算成立。
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  IdempotencyConflictError,
  InsufficientMerchantTotalError,
  debitMerchantBalance,
  type MerchantAccountPool,
} from "@workspace/billing"
import { requireMerchantApiKey, requireMerchantAuth } from "../lib/api-key-auth"
import { db } from "../lib/db"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const DebitBodySchema = z
  .object({
    /** 扣减金额（元，最多 4 位小数，与 numeric(15,4) 对齐） */
    amount: z
      .number()
      .positive()
      .multipleOf(0.0001, { message: "amount 最多 4 位小数" })
      .openapi({ example: 128.5 }),
    /**
     * 商户侧消费单号（可选，仅用于日志/追账）。幂等一律以 Idempotency-Key 为准，
     * 缺省时 traceId 也用该键。
     */
    request_id: z.string().min(1).max(128).optional().openapi({ example: "consume-2026-04-10-0001" }),
    /** 关联的业务单据（任务 id 等） */
    ref_id: z.string().max(128).optional(),
    /** 商户侧用户标识（B/C 形态），用于按用户聚合扣减 */
    external_user_ref: z.string().max(128).optional(),
    /** 允许动用授信池，默认 true（授信是垫付缓冲） */
    allow_credit: z.boolean().optional().default(true),
    description: z.string().max(255).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("ConsumptionDebitBody")

const PoolDebitSchema = z
  .object({
    pool: z.enum(["voucher", "cash", "credit"]),
    amount: z.number(),
    balance_before: z.number(),
    balance_after: z.number(),
    ledger_id: z.string(),
  })
  .openapi("ConsumptionPoolDebit")

const DebitResponseSchema = z
  .object({
    /** 首条流水 id（跨池时取第一池，便于日志定位） */
    ledger_id: z.string(),
    request_id: z.string(),
    /** 实际扣减总额 */
    amount: z.number(),
    /** 扣减后三池合计可用额度 */
    balance_after: z.number(),
    /** 逐池扣减明细 */
    pools: z.array(PoolDebitSchema),
    /** true = 幂等重放（本次未重复扣减） */
    replay: z.boolean(),
  })
  .openapi("ConsumptionDebitResponse")

const ErrorResponseSchema = z
  .object({
    error: z.string(),
    code: z.string().optional(),
    message: z.string().optional(),
    requiredScope: z.string().optional(),
  })
  .openapi("ErrorResponse")

/** 设计 §3.6 统一错误体 */
function errorBody(error: string, code: string, message: string, requiredScope?: string) {
  return { error, code, message, requiredScope }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const consumption = new OpenAPIHono()

consumption.use("/*", requireMerchantApiKey("consumption:write"))

consumption.openapi(
  createRoute({
    method: "post",
    path: "/debit",
    summary: "Debit merchant balance for a consumption record",
    description:
      "上报一笔算力消费并实时扣减商户额度（跨池：券 → 现金 → 授信）。" +
      "必须携带 Idempotency-Key 请求头；重复提交只扣一次并回放首次结果。",
    tags: ["Consumption"],
    request: {
      headers: z.object({
        "Idempotency-Key": z
          .string()
          .max(128)
          .optional()
          .openapi({ description: "必填：调用方生成的唯一键；同键重复请求只扣一次" }),
      }),
      body: {
        content: {
          "application/json": { schema: DebitBodySchema },
        },
      },
    },
    responses: {
      200: {
        description: "扣减成功；replay=true 表示命中幂等键、本次未重复扣减",
        content: { "application/json": { schema: DebitResponseSchema } },
      },
      400: {
        description: "参数错误",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      401: {
        description: "凭证缺失/无效/过期",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      402: {
        description: "账户额度不足（含授信）",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "scope 不足",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      409: {
        description: "同 Idempotency-Key 但请求内容不一致",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const auth = requireMerchantAuth(c)
    const idempotencyKey = c.req.header("Idempotency-Key")
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      return c.json(
        errorBody("bad_request", "IDEMPOTENCY_KEY_REQUIRED", "缺少 Idempotency-Key 请求头"),
        400,
      )
    }

    const body = c.req.valid("json")
    // 幂等键只有 Idempotency-Key 一个来源；body 的 request_id 仅作业务单号，
    // 不参与幂等判定（两个来源并存时商户很容易只填 body 就以为幂等生效了）。
    const requestId = idempotencyKey.trim()

    try {
      const result = await debitMerchantBalance(db, {
        merchantId: auth.merchantId,
        amount: body.amount,
        requestId,
        refId: body.ref_id ?? body.request_id ?? null,
        externalUserRef: body.external_user_ref ?? null,
        traceId: body.request_id ?? requestId,
        allowCredit: body.allow_credit,
        description: body.description ?? null,
        metadata: body.metadata ?? null,
      })

      // 重放标记同时体现在 body.replay 与响应头上，客户端两种取法都能用
      c.header("X-Idempotent-Replay", result.replay ? "true" : "false")

      return c.json(
        {
          ledger_id: result.pools[0]?.ledgerId ?? "",
          request_id: requestId,
          amount: result.amount,
          balance_after: result.availableAfter,
          pools: result.pools.map((p: { pool: MerchantAccountPool; amount: number; balanceBefore: number; balanceAfter: number; ledgerId: string }) => ({
            pool: p.pool,
            amount: p.amount,
            balance_before: p.balanceBefore,
            balance_after: p.balanceAfter,
            ledger_id: p.ledgerId,
          })),
          replay: result.replay,
        },
        200,
      )
    } catch (error) {
      if (error instanceof InsufficientMerchantTotalError) {
        // 402：额度不足。这里绝不部分扣减，让商户能明确判定消费是否成立
        c.header("X-Idempotent-Replay", "false")
        return c.json(
          errorBody("payment_required", error.code, error.message),
          402,
        )
      }
      if (error instanceof IdempotencyConflictError) {
        c.header("X-Idempotent-Replay", "false")
        return c.json(
          errorBody("conflict", error.code, error.message),
          409,
        )
      }
      throw error
    }
  },
)

export default consumption
