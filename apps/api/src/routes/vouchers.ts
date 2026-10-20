/**
 * 算力券接口 — 设计 §3.6
 *
 *   GET  /api/v1/vouchers            scope=balance:read   商户名下已发放券列表
 *   GET  /api/v1/vouchers/recovered  scope=balance:read   券回收（过期/作废）流水
 *   POST /api/v1/vouchers/purchase   scope=voucher:purchase  🔴幂等
 *   POST /api/v1/vouchers/grant      scope=voucher:grant     🔴幂等
 *
 * 硬性约束：
 *   1. `merchantId` **只**来自 API-Key 凭证，绝不接受入参（P0-6）。
 *   2. 两个写接口必须带 `Idempotency-Key`：网关/商户两侧都会重试，
 *      重复采购等于重复扣钱，重复发放等于凭空多发券。
 *   3. `grant` 的 `tenant_id` 必须是**本商户名下的租户** —— 发到别人的租户
 *      等于把券池额度白送出去，所以这里先做归属断言再调 billing。
 *
 * 三个 scope 各不相同，因此不挂 `/*` 通配中间件，而是逐路径挂载。
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  IdempotencyConflictError,
  InsufficientMerchantBalanceError,
  VoucherInsufficientError,
  grantMerchantCoupon,
  listMerchantCoupons,
  listMerchantPoolBalances,
  purchaseMerchantVoucher,
} from "@workspace/billing"
import { billingTenant } from "@workspace/db/schema"
import { eq } from "drizzle-orm"
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

const IdempotencyHeaderSchema = z.object({
  "Idempotency-Key": z
    .string()
    .max(128)
    .optional()
    .openapi({ description: "必填：调用方生成的唯一键；同键重复请求只执行一次" }),
})

const PurchaseBodySchema = z
  .object({
    /** 采购金额（元，最多 4 位小数） */
    amount: z
      .number()
      .positive()
      .multipleOf(0.0001, { message: "amount 最多 4 位小数" })
      .openapi({ example: 1000 }),
    /** 来源池：cash（默认）或 credit；不能是 voucher（不能拿券池买券） */
    from_pool: z.enum(["cash", "credit"]).optional().default("cash"),
    /** 商户侧单据号，仅用于日志/追账，不参与幂等判定 */
    request_id: z.string().min(1).max(128).optional(),
    remark: z.string().max(255).optional(),
  })
  .openapi("VoucherPurchaseBody")

const GrantBodySchema = z
  .object({
    /** 券发给哪个租户（终端用户）；必须是本商户名下租户 */
    tenant_id: z.string().min(1).max(64),
    /** 券面额（元） */
    amount: z
      .number()
      .positive()
      .multipleOf(0.0001, { message: "amount 最多 4 位小数" }),
    name: z.string().min(1).max(64),
    /** 券码，不传则自动生成；同码重复会由 DB 唯一索引兜底 */
    code: z.string().min(4).max(32).optional(),
    type: z.string().max(32).optional(),
    /** 最低消费门槛（元） */
    min_amount: z.number().positive().optional(),
    /** 有效天数（与 expired_at 二选一，expired_at 优先） */
    validity_day: z.number().int().min(1).max(3650).optional(),
    /** 绝对到期时间 */
    expired_at: z.coerce.date().optional(),
    remark: z.string().max(255).optional(),
    request_id: z.string().min(1).max(128).optional(),
  })
  .openapi("VoucherGrantBody")

const PurchaseResponseSchema = z
  .object({
    request_id: z.string(),
    pool: z.string(),
    amount: z.number(),
    /** 采购后券池可用额 */
    balance_after: z.number(),
    /** 采购后来源池可用额 */
    from_balance_after: z.number(),
    replay: z.boolean(),
  })
  .openapi("VoucherPurchaseResponse")

const GrantResponseSchema = z
  .object({
    request_id: z.string(),
    pool: z.string(),
    amount: z.number(),
    balance_after: z.number(),
    voucher: z.object({
      coupon_id: z.string(),
      code: z.string(),
      expired_at: z.coerce.date(),
      issued_at: z.coerce.date(),
    }),
    replay: z.boolean(),
  })
  .openapi("VoucherGrantResponse")

const CouponItemSchema = z
  .object({
    id: z.string(),
    tenant_id: z.string(),
    name: z.string(),
    code: z.string().nullable(),
    type: z.string(),
    amount: z.number(),
    surplus_amount: z.number(),
    min_amount: z.number().nullable(),
    status: z.string(),
    issued_at: z.coerce.date().nullable(),
    expired_at: z.coerce.date().nullable(),
  })
  .openapi("VoucherItem")

const CouponListQuerySchema = z
  .object({
    tenant_id: z.string().max(64).optional(),
    status: z.string().max(32).optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .openapi("VoucherListQuery")

const CouponListResponseSchema = z
  .object({
    items: z.array(CouponItemSchema),
    total: z.number(),
    page: z.number(),
    page_size: z.number(),
  })
  .openapi("VoucherListResponse")

/** listMerchantCoupons 返回的行（billing 层标了 any，这里收敛成明确形状） */
interface CouponRow {
  id: string
  tenantId: string
  name: string
  code: string | null
  type: string
  value: number
  surplusAmount: number
  minAmount: number | null
  status: string
  issuedAt: Date | null
  expiredAt: Date | null
}

const RecoveredQuerySchema = z
  .object({
    /**
     * 回收态。`expired` = 过期回收，`void` = 作废回收。
     * 券池额度回到商户可用额的那一刻，券就进入其中一种状态。
     */
    status: z.enum(["expired", "void"]).default("expired"),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .openapi("VoucherRecoveredQuery")

const RecoveredResponseSchema = z
  .object({
    items: z.array(CouponItemSchema),
    total: z.number(),
    page: z.number(),
    page_size: z.number(),
    /** 设计 §3.6 的 batch_id 过滤暂不支持：批次表未建（P0-9 / P1-11 挂起） */
    note: z.string().optional(),
  })
  .openapi("VoucherRecoveredResponse")

function errorBody(error: string, code: string, message: string, requiredScope?: string) {
  return { error, code, message, requiredScope }
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** 取某个池的可用额（写操作完成后回给调用方做落账核对） */
async function poolAvailable(merchantId: string, pool: string): Promise<number> {
  const pools = await listMerchantPoolBalances(db, merchantId)
  return num(pools.find((p) => p.pool === pool)?.available)
}

/**
 * 必填 Idempotency-Key。
 * 缺失时返回 400 而不是「退化成不幂等」—— 重试一次就是重复扣钱/重复发券。
 */
function requireIdempotencyKey(headerValue: string | undefined): string | null {
  const key = headerValue?.trim()
  return key && key.length > 0 ? key : null
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const vouchers = new OpenAPIHono()

// 逐路径挂载：purchase / grant / 只读 的 scope 各不相同，不能用 "/*" 一刀切
vouchers.use("/", requireMerchantApiKey("balance:read"))
vouchers.use("/recovered", requireMerchantApiKey("balance:read"))
vouchers.use("/purchase", requireMerchantApiKey("voucher:purchase"))
vouchers.use("/grant", requireMerchantApiKey("voucher:grant"))

vouchers.openapi(
  createRoute({
    method: "get",
    path: "/",
    summary: "List merchant vouchers",
    description: "商户名下已发放的算力券（数据库级分页）。merchantId 由 API-Key 凭证派生。",
    tags: ["Voucher"],
    request: { query: CouponListQuerySchema },
    responses: {
      200: {
        description: "券分页结果",
        content: { "application/json": { schema: CouponListResponseSchema } },
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

    const result = await listMerchantCoupons(db, {
      merchantId: auth.merchantId,
      tenantId: q.tenant_id,
      status: q.status,
      page: q.page,
      pageSize: q.page_size,
    })

    return c.json({
      items: result.items.map((row: CouponRow) => ({
        id: row.id,
        tenant_id: row.tenantId,
        name: row.name,
        code: row.code,
        type: row.type,
        amount: num(row.value),
        surplus_amount: num(row.surplusAmount),
        min_amount: row.minAmount,
        status: row.status,
        issued_at: row.issuedAt,
        expired_at: row.expiredAt,
      })),
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
    }, 200)
  },
)

vouchers.openapi(
  createRoute({
    method: "get",
    path: "/recovered",
    summary: "List recovered vouchers",
    description:
      "已回收（过期/作废）的算力券 —— 这些券的剩余额度已退回商户券池。" +
      "支持按状态与分页过滤。设计 §3.6 的 batch_id 过滤暂不支持：批次表未建（P0-9 / P1-11 挂起）。",
    tags: ["Voucher"],
    request: { query: RecoveredQuerySchema },
    responses: {
      200: {
        description: "已回收券分页结果",
        content: { "application/json": { schema: RecoveredResponseSchema } },
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

    const result = await listMerchantCoupons(db, {
      merchantId: auth.merchantId,
      status: q.status,
      page: q.page,
      pageSize: q.page_size,
    })

    return c.json({
      items: result.items.map((row: CouponRow) => ({
        id: row.id,
        tenant_id: row.tenantId,
        name: row.name,
        code: row.code,
        type: row.type,
        amount: num(row.value),
        surplus_amount: num(row.surplusAmount),
        min_amount: row.minAmount,
        status: row.status,
        issued_at: row.issuedAt,
        expired_at: row.expiredAt,
      })),
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      note: "batch_id 过滤未实现：券批次表尚未建表",
    }, 200)
  },
)

vouchers.openapi(
  createRoute({
    method: "post",
    path: "/purchase",
    summary: "Purchase voucher balance",
    description:
      "把现金/授信池额度搬进券池（采购算力券额度）。必须携带 Idempotency-Key；" +
      "重复提交只扣一次并回放首次结果。",
    tags: ["Voucher"],
    request: {
      headers: IdempotencyHeaderSchema,
      body: { content: { "application/json": { schema: PurchaseBodySchema } } },
    },
    responses: {
      200: {
        description: "采购成功；replay=true 表示命中幂等键、本次未重复扣减",
        content: { "application/json": { schema: PurchaseResponseSchema } },
      },
      400: {
        description: "参数错误（含缺少 Idempotency-Key）",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      401: {
        description: "凭证缺失/无效/过期",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      402: {
        description: "额度不足",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: { description: "scope 不足", content: { "application/json": { schema: ErrorResponseSchema } } },
      409: {
        description: "同 Idempotency-Key 但请求内容不一致",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const auth = requireMerchantAuth(c)
    const requestId = requireIdempotencyKey(c.req.header("Idempotency-Key"))
    if (!requestId) {
      return c.json(
        errorBody("bad_request", "IDEMPOTENCY_KEY_REQUIRED", "缺少 Idempotency-Key 请求头"),
        400,
      )
    }

    const body = c.req.valid("json")

    try {
      const result = await purchaseMerchantVoucher(db, {
        merchantId: auth.merchantId,
        amount: body.amount,
        fromPool: body.from_pool,
        requestId,
        remark: body.remark,
      })

      c.header("X-Idempotent-Replay", result.replay ? "true" : "false")
      return c.json({
        request_id: requestId,
        pool: result.fromPool,
        amount: result.amount,
        balance_after: result.voucherAvailableAfter,
        from_balance_after: result.fromAvailableAfter,
        replay: result.replay,
      }, 200)
    } catch (error) {
      c.header("X-Idempotent-Replay", "false")
      if (error instanceof InsufficientMerchantBalanceError) {
        return c.json(errorBody("payment_required", "INSUFFICIENT_BALANCE", error.message), 402)
      }
      if (error instanceof IdempotencyConflictError) {
        return c.json(errorBody("conflict", "IDEMPOTENCY_CONFLICT", error.message), 409)
      }
      throw error
    }
  },
)

vouchers.openapi(
  createRoute({
    method: "post",
    path: "/grant",
    summary: "Grant a voucher to a tenant",
    description:
      "从券池冻结并发放一张算力券给本商户名下租户。必须携带 Idempotency-Key；" +
      "重复提交只发一张并回放首次结果。",
    tags: ["Voucher"],
    request: {
      headers: IdempotencyHeaderSchema,
      body: { content: { "application/json": { schema: GrantBodySchema } } },
    },
    responses: {
      200: {
        description: "发放成功；replay=true 表示命中幂等键、本次未重复发放",
        content: { "application/json": { schema: GrantResponseSchema } },
      },
      400: {
        description: "参数错误（含缺少 Idempotency-Key）",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      401: {
        description: "凭证缺失/无效/过期",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      402: {
        description: "券池额度不足",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "scope 不足，或租户不属于本商户",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      404: {
        description: "租户不存在",
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
    const requestId = requireIdempotencyKey(c.req.header("Idempotency-Key"))
    if (!requestId) {
      return c.json(
        errorBody("bad_request", "IDEMPOTENCY_KEY_REQUIRED", "缺少 Idempotency-Key 请求头"),
        400,
      )
    }

    const body = c.req.valid("json")

    // 归属断言：券池额度只能发给本商户名下的租户。
    // 漏了这步，商户 A 就能把券发到商户 B 的租户上（自己花钱、别人受益），
    // 而且 B 的报表里会凭空多出一笔来源不明的券。
    const [tenant] = await db
      .select({ merchantId: billingTenant.merchantId })
      .from(billingTenant)
      .where(eq(billingTenant.id, body.tenant_id))
      .limit(1)
    if (!tenant) {
      return c.json(errorBody("not_found", "TENANT_NOT_FOUND", "租户不存在"), 404)
    }
    if (tenant.merchantId !== auth.merchantId) {
      return c.json(
        errorBody("forbidden", "TENANT_NOT_OWNED", "该租户不属于当前凭证所属商户"),
        403,
      )
    }

    try {
      const result = await grantMerchantCoupon(db, {
        merchantId: auth.merchantId,
        tenantId: body.tenant_id,
        amount: body.amount,
        name: body.name,
        code: body.code,
        type: body.type,
        minAmount: body.min_amount,
        validityDay: body.validity_day,
        expiredAt: body.expired_at,
        remark: body.remark,
        requestId,
      })

      const balanceAfter = await poolAvailable(auth.merchantId, "voucher")

      c.header("X-Idempotent-Replay", result.replay ? "true" : "false")
      return c.json({
        request_id: requestId,
        pool: "voucher",
        amount: result.amount,
        balance_after: balanceAfter,
        voucher: {
          coupon_id: result.couponId,
          code: result.code,
          expired_at: result.expiredAt,
          issued_at: result.issuedAt,
        },
        replay: result.replay,
      }, 200)
    } catch (error) {
      c.header("X-Idempotent-Replay", "false")
      if (
        error instanceof InsufficientMerchantBalanceError ||
        error instanceof VoucherInsufficientError
      ) {
        return c.json(errorBody("payment_required", "INSUFFICIENT_BALANCE", error.message), 402)
      }
      if (error instanceof IdempotencyConflictError) {
        return c.json(errorBody("conflict", "IDEMPOTENCY_CONFLICT", error.message), 409)
      }
      throw error
    }
  },
)

export default vouchers
