/**
 * 外部用户绑定 — 设计 §3.6 / §4.5（形态 B/C 的阻塞项）
 *
 *   POST /api/v1/subjects/bind   scope=subject:sync
 *
 * 平台**不为 B/C 的终端用户提供登录/注册/充值/退款**，只做消费计量、账本与
 * 对账。要让后续的消费上报能落到正确的账上，必须先把「商户系统里的用户」
 * 映射到平台侧的一个影子租户。
 *
 * 硬性约束：
 *   1. `merchantId` **只**来自 API-Key 凭证（P0-6）。
 *   2. **天然幂等**：`UNIQUE(merchant_id, external_user_ref)`。重复调用返回同一个
 *      `platform_tenant_id`，绝不重复建租户 —— 否则每调一次就多一个影子租户，
 *      商户的账目会直接发散。
 *   3. 并发首次绑定靠事务 + 唯一索引兜底：后到的一路插入冲突后**整笔回滚**
 *      （连同它刚建的影子租户一起回滚），由外层重读已有映射返回，
 *      不会留下一个没被任何 subject 引用的孤儿租户。
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { billingTenant, merchant, merchantExternalSubject } from "@workspace/db/schema"
import { and, eq } from "drizzle-orm"
import { requireMerchantApiKey, requireMerchantAuth } from "../lib/api-key-auth"
import { db } from "../lib/db"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const BindBodySchema = z
  .object({
    /** 🔴 商户系统内的用户唯一标识 */
    external_user_ref: z.string().min(1).max(128),
    /** 商户系统内的组织标识，可空 */
    external_tenant_ref: z.string().max(128).optional(),
    /**
     * 外部用户的展示信息。**平台侧仅用于展示与对账，绝不作为登录凭据。**
     */
    metadata: z
      .object({
        name: z.string().max(255).optional(),
        phone: z.string().max(64).optional(),
        email: z.string().max(255).optional(),
      })
      .passthrough()
      .optional(),
  })
  .openapi("SubjectBindBody")

const BindResponseSchema = z
  .object({
    platform_tenant_id: z.string(),
    external_user_ref: z.string(),
    bind_status: z.string(),
    /** true = 本次新建了影子租户；false = 命中已有映射（幂等重放） */
    created: z.boolean(),
  })
  .openapi("SubjectBindResponse")

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

/**
 * 并发首次绑定时的信号：另一路已经插入了同 (merchantId, externalUserRef) 的映射。
 * 抛出它会连同本事务里刚建的影子租户一起回滚，调用方捕获后改为重读。
 */
class BindRaceSignal extends Error {
  constructor() {
    super('subject bind race')
    this.name = 'BindRaceSignal'
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const subjects = new OpenAPIHono()

subjects.use("/bind", requireMerchantApiKey("subject:sync"))

subjects.openapi(
  createRoute({
    method: "post",
    path: "/bind",
    summary: "Bind an external user to a platform shadow tenant",
    description:
      "把商户系统里的外部用户映射到平台影子租户。首次绑定创建影子租户，" +
      "重复绑定返回同一个 platform_tenant_id（天然幂等，不重复建租户）。",
    tags: ["Subject"],
    request: {
      body: { content: { "application/json": { schema: BindBodySchema } } },
    },
    responses: {
      200: {
        description: "绑定成功；created=false 表示命中已有映射",
        content: { "application/json": { schema: BindResponseSchema } },
      },
      400: {
        description: "参数错误",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      401: {
        description: "凭证缺失/无效/过期",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "scope 不足，或商户未开通该形态",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      409: {
        description: "并发绑定冲突（重试即可）",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  }),
  async (c) => {
    const auth = requireMerchantAuth(c)
    const body = c.req.valid("json")

    // 商户准入：停用中的商户不能再建影子租户（设计 §3.6 错误码 MERCHANT_DISABLED）
    const [merchantRow] = await db
      .select({ status: merchant.status })
      .from(merchant)
      .where(eq(merchant.id, auth.merchantId))
      .limit(1)
    if (merchantRow && merchantRow.status !== "active") {
      return c.json(
        errorBody("forbidden", "MERCHANT_DISABLED", "商户未开通该形态或已被停用"),
        403,
      )
    }

    const conditions = [
      eq(merchantExternalSubject.merchantId, auth.merchantId),
      eq(merchantExternalSubject.externalUserRef, body.external_user_ref),
    ]

    const [existing] = await db
      .select()
      .from(merchantExternalSubject)
      .where(and(...conditions))
      .limit(1)

    if (existing) {
      // 幂等重放：刷新最近一次出现的时间（以及后来补上的组织标识）。
      // 同时把 bind_status 归位到 active —— 商户在控制台手动解绑后，
      // 只要商户系统再次同步，映射就自动恢复（控制台解绑不删除任何数据）。
      await db
        .update(merchantExternalSubject)
        .set({
          lastSeenAt: new Date(),
          externalTenantRef: body.external_tenant_ref ?? existing.externalTenantRef,
          bindStatus: "active",
          updatedAt: new Date(),
        })
        .where(eq(merchantExternalSubject.id, existing.id))

      return c.json(
        {
          platform_tenant_id: existing.platformTenantId,
          external_user_ref: existing.externalUserRef,
          bind_status: "active",
          created: false,
        },
        200,
      )
    }

    let platformTenantId: string
    let created = true

    try {
      platformTenantId = await db.transaction(async (tx) => {
        // 事务内二次确认：上面那次读在事务外，并发下可能已经落后
        const [recheck] = await tx
          .select({ id: merchantExternalSubject.id, platformTenantId: merchantExternalSubject.platformTenantId })
          .from(merchantExternalSubject)
          .where(and(...conditions))
          .limit(1)
        if (recheck) {
          created = false
          // 同步即恢复绑定状态（见上方幂等重放注释）
          await tx
            .update(merchantExternalSubject)
            .set({ bindStatus: "active", lastSeenAt: new Date(), updatedAt: new Date() })
            .where(eq(merchantExternalSubject.id, recheck.id))
          return recheck.platformTenantId
        }

        // 影子租户：不建用户、不建登录，只提供一个可计量、可记账的 tenant.id
        const tenantId = crypto.randomUUID()
        await tx.insert(billingTenant).values({
          id: tenantId,
          customerId: null,
          name: body.metadata?.name?.trim() || body.external_user_ref,
          // 影子租户由本接口创建，没有上游平台租户；留 NULL 而不是伪装成 tenantId，
          // 免得后续把「平台侧租户」和「我们自己造的占位」当成同一类东西。
          platformTenantId: null,
          merchantId: auth.merchantId,
          isDefault: true,
          status: "active",
          balance: "0",
          type: "external",
        })

        const [row] = await tx
          .insert(merchantExternalSubject)
          .values({
            id: crypto.randomUUID(),
            merchantId: auth.merchantId,
            externalUserRef: body.external_user_ref,
            externalTenantRef: body.external_tenant_ref ?? null,
            platformTenantId: tenantId,
            bindStatus: "active",
            metadata: (body.metadata ?? {}) as Record<string, unknown>,
          })
          .onConflictDoNothing()
          .returning({ platformTenantId: merchantExternalSubject.platformTenantId })

        // 撞唯一索引 = 另一路并发先插了；抛出让整笔事务（含影子租户）回滚
        if (!row) throw new BindRaceSignal()
        return row.platformTenantId
      })
    } catch (error) {
      if (!(error instanceof BindRaceSignal)) throw error

      const [raced] = await db
        .select()
        .from(merchantExternalSubject)
        .where(and(...conditions))
        .limit(1)
      if (!raced) {
        // 理论上到不了：冲突说明对方已提交，除非对方随后又回滚了
        return c.json(
          errorBody("conflict", "BIND_CONFLICT", "并发绑定冲突，请重试"),
          409,
        )
      }
      return c.json(
        {
          platform_tenant_id: raced.platformTenantId,
          external_user_ref: raced.externalUserRef,
          bind_status: "active",
          created: false,
        },
        200,
      )
    }

    return c.json(
      {
        platform_tenant_id: platformTenantId,
        external_user_ref: body.external_user_ref,
        bind_status: "active",
        created,
      },
      200,
    )
  },
)

export default subjects
