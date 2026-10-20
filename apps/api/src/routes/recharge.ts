import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { db } from "../lib/db"
import {
  MerchantRechargeBlockedError,
  createRechargeOrder,
  handlePaymentCallback,
  getTenantBalance,
  listPaymentOrders,
} from "@workspace/billing"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PaymentOrderSchema = z
  .object({
    id: z.string(),
    orderNo: z.string(),
    scene: z.string(),
    amount: z.string(),
    currency: z.string(),
    paymentMethod: z.string(),
    status: z.string(),
    paidAt: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
  })
  .openapi("PaymentOrder")

const BalanceSchema = z
  .object({
    tenantId: z.string(),
    organizationId: z.string(),
    availableBalance: z.string(),
    reservedBalance: z.string(),
    currency: z.string(),
  })
  .openapi("TenantBalance")

const CreateOrderBodySchema = z
  .object({
    tenantId: z.string().openapi({ example: "org_abc123" }),
    organizationId: z.string().openapi({ example: "org_abc123" }),
    amount: z.number().positive().openapi({ example: 100 }),
    paymentMethod: z.enum(["wechat", "alipay", "bank_transfer"]),
    sceneOrderId: z.string().optional(),
  })
  .openapi("CreateRechargeOrderBody")

const CreateOrderResponseSchema = z
  .object({
    order: PaymentOrderSchema,
  })
  .openapi("CreateRechargeOrderResponse")

const CallbackBodySchema = z
  .object({
    orderNo: z.string(),
    organizationId: z.string(),
    channelOrderNo: z.string().optional(),
    channelStatus: z.string().optional(),
    channelResponse: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("PaymentCallbackBody")

const CallbackResponseSchema = z
  .object({
    order: PaymentOrderSchema,
    balance: BalanceSchema,
  })
  .openapi("PaymentCallbackResponse")

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error")

/**
 * 商户充值准入被拒（DEC-F4）。
 * 保留 thresholdSource 让调用方能分辨是商户自定义阈值还是平台全局默认。
 */
const MerchantRechargeBlockedSchema = z
  .object({
    error: z.literal("merchant_recharge_blocked"),
    message: z.string(),
    merchantId: z.string(),
    availableTotal: z.number(),
    threshold: z.number(),
    thresholdSource: z.enum(["merchant", "global", "fallback"]),
  })
  .openapi("MerchantRechargeBlocked")

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const createOrderRoute = createRoute({
  method: "post",
  path: "/orders",
  tags: ["Recharge"],
  summary: "Create a recharge payment order",
  request: { body: { content: { "application/json": { schema: CreateOrderBodySchema } } } },
  responses: {
    200: {
      content: { "application/json": { schema: CreateOrderResponseSchema } },
      description: "Payment order created",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Invalid input",
    },
    402: {
      content: { "application/json": { schema: MerchantRechargeBlockedSchema } },
      description: "Merchant available balance below recharge admission threshold (DEC-F4)",
    },
  },
})

const callbackRoute = createRoute({
  method: "post",
  path: "/callback",
  tags: ["Recharge"],
  summary: "Handle payment gateway callback",
  request: { body: { content: { "application/json": { schema: CallbackBodySchema } } } },
  responses: {
    200: {
      content: { "application/json": { schema: CallbackResponseSchema } },
      description: "Payment confirmed and balance credited",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Callback processing failed",
    },
  },
})

const balanceRoute = createRoute({
  method: "get",
  path: "/balance/{tenantId}",
  tags: ["Recharge"],
  summary: "Get tenant balance",
  request: {
    params: z.object({ tenantId: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: BalanceSchema } },
      description: "Tenant balance",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Balance not found",
    },
  },
})

const listOrdersRoute = createRoute({
  method: "get",
  path: "/orders/{tenantId}",
  tags: ["Recharge"],
  summary: "List payment orders for a tenant",
  request: {
    params: z.object({ tenantId: z.string() }),
    query: z.object({
      scene: z.string().optional(),
      status: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).default(20).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(PaymentOrderSchema),
            total: z.number(),
            page: z.number(),
            pageSize: z.number(),
          }),
        },
      },
      description: "List of payment orders",
    },
  },
})

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new OpenAPIHono()

  .openapi(createOrderRoute, async (c) => {
    const body = c.req.valid("json")
    const expiredAt = new Date(Date.now() + 30 * 60 * 1000)

    // 商户准入（DEC-F4）由 billing 的 createRechargeOrder 统一收口，这里只做错误翻译。
    // 归为 402 而非 500：这是「商户背书额度不足」的业务拒绝，重试无用，
    // 但服务端没有崩；调用方据此提示用户联系商户而非重试。
    try {
      const order = await createRechargeOrder(db, {
        tenantId: body.tenantId,
        scene: "recharge",
        sceneOrderId: body.sceneOrderId,
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        expiredAt,
      })

      return c.json({ order: order.order as any }, 200)
    } catch (error) {
      if (error instanceof MerchantRechargeBlockedError) {
        return c.json(
          {
            error: "merchant_recharge_blocked" as const,
            message: "商户额度不足，暂无法为该用户开通充值",
            merchantId: error.merchantId,
            availableTotal: error.availableTotal,
            threshold: error.threshold,
            thresholdSource: error.thresholdSource,
          },
          402,
        )
      }
      throw error
    }
  })

  .openapi(callbackRoute, async (c) => {
    const body = c.req.valid("json")

    const result = await handlePaymentCallback(db, {
      orderNo: body.orderNo,
      channelOrderNo: body.channelOrderNo,
      channelStatus: body.channelStatus,
      channelResponse: body.channelResponse,
      organizationId: body.organizationId,
    })

    return c.json({ order: result.order as any, balance: result.balance as any }, 200)
  })

  .openapi(balanceRoute, async (c) => {
    const { tenantId } = c.req.valid("param")
    const balance = await getTenantBalance(db, tenantId)

    if (!balance) {
      return c.json({ error: "Balance not found" }, 404)
    }

    return c.json(balance as any, 200)
  })

  .openapi(listOrdersRoute, async (c) => {
    const { tenantId } = c.req.valid("param")
    const query = c.req.valid("query")

    const result = await listPaymentOrders(db, {
      tenantId,
      scene: query.scene,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    })

    return c.json(result as any, 200)
  })

export default app
