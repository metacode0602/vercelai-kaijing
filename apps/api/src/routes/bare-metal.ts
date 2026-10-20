import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { db } from "../lib/db"
import { bareMetalOrder } from "@workspace/db"
import { eq, and, desc, count } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MetalOrderSchema = z
  .object({
    id: z.string(),
    orderNo: z.string().nullable(),
    description: z.string().nullable(),
    status: z.string(),
    payStatus: z.string(),
    billingUnit: z.string(),
    deviceCount: z.number(),
    gpuCount: z.number(),
    orderAmount: z.string().nullable(),
    finalAmount: z.string(),
    orderedAt: z.string().nullable(),
    rentStartsAt: z.string().nullable(),
    rentEndsAt: z.string().nullable(),
  })
  .openapi("MetalOrder")

const ErrorSchema = z
  .object({ error: z.string() })
  .openapi("Error")

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const listOrdersRoute = createRoute({
  method: "get",
  path: "/orders/{tenantId}",
  tags: ["BareMetal"],
  summary: "List bare metal orders for a tenant",
  request: {
    params: z.object({ tenantId: z.string() }),
    query: z.object({
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
            items: z.array(MetalOrderSchema),
            total: z.number(),
            page: z.number(),
            pageSize: z.number(),
          }),
        },
      },
      description: "List of bare metal orders",
    },
  },
})

const getOrderRoute = createRoute({
  method: "get",
  path: "/orders/{tenantId}/{orderId}",
  tags: ["BareMetal"],
  summary: "Get bare metal order by ID",
  request: {
    params: z.object({
      tenantId: z.string(),
      orderId: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: MetalOrderSchema } },
      description: "Bare metal order",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Order not found",
    },
  },
})

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new OpenAPIHono()

  .openapi(listOrdersRoute, async (c) => {
    const { tenantId } = c.req.valid("param")
    const query = c.req.valid("query")
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const conditions = [eq(bareMetalOrder.tenantId, tenantId)]
    if (query.status) {
      conditions.push(eq(bareMetalOrder.status, query.status))
    }
    const where = and(...conditions)

    const [totalRow] = await db
      .select({ total: count() })
      .from(bareMetalOrder)
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db
      .select()
      .from(bareMetalOrder)
      .where(where)
      .orderBy(desc(bareMetalOrder.orderedAt))
      .limit(pageSize)
      .offset(offset)

    return c.json({ items: rows, total, page, pageSize }, 200)
  })

  .openapi(getOrderRoute, async (c) => {
    const { tenantId, orderId } = c.req.valid("param")

    const [row] = await db
      .select()
      .from(bareMetalOrder)
      .where(
        and(
          eq(bareMetalOrder.id, orderId),
          eq(bareMetalOrder.tenantId, tenantId),
        ),
      )
      .limit(1)

    if (!row) {
      return c.json({ error: "Order not found" }, 404)
    }

    return c.json(row as any, 200)
  })

export default app
