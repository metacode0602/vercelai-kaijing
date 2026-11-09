import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as csInboxDa from '@/lib/server/dataaccess/cs-inbox'
import type { MarketplaceImCapability } from '@workspace/db/schema'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  platform: z.string().optional(),
  shopId: z.string().optional(),
  sku: z.string().optional(),
  status: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

/**
 * 平台 IM 能力静态表（与 packages/marketplace adapters imCapability 对齐）。
 * 见 docs/design/platform-apis/{lazada/lazada-promotion-im-review-api.md, daraz, tiktok-shop.md}。
 */
const PLATFORM_IM_CAPABILITIES: Array<{
  platform: string
  capability: MarketplaceImCapability
  docRef: string
  note: string
}> = [
  {
    platform: 'lazada',
    capability: 'known_unimplemented',
    docRef:
      'docs/design/platform-apis/lazada/lazada-promotion-im-review-api.md §3 Instant Messaging',
    note: 'Lazada IM API 已确认（/im/session/list、/im/message/list 等 7 个接口），adapter 未实现拉取。',
  },
  {
    platform: 'daraz',
    capability: 'unknown',
    docRef: 'docs/design/platform-apis/daraz',
    note: 'Daraz 复用 Lazop 体系，IM API 未在 daraz 文档独立确认。',
  },
  {
    platform: 'tiktok_shop',
    capability: 'unknown',
    docRef: 'docs/design/platform-apis/tiktok-shop.md',
    note: 'TikTok Shop 文档树有 Customer Service / Send Message 页，正文未抓到，IM API 未确认。',
  },
]

export const csInboxRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return csInboxDa.listMessages(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return csInboxDa.messageStats(ctx.db, ctx.organizationId)
  }),

  filterOptions: tenantProcedure.query(async ({ ctx }) => {
    return csInboxDa.listFilterOptions(ctx.db, ctx.organizationId)
  }),

  /** 平台 IM 能力清单，供页面展示"未接线"banner。 */
  capabilities: tenantProcedure.query(async () => ({
    platforms: PLATFORM_IM_CAPABILITIES,
    /** 是否有任何平台 IM adapter 已就绪可拉取。 */
    anyReady: PLATFORM_IM_CAPABILITIES.some((p) => p.capability === 'ready'),
  })),

  markRead: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        csInboxDa.markRead(ctx.db, ctx.organizationId, input.id, ctx.user?.id ?? undefined),
      ),
    ),

  markAllRead: tenantProcedure.mutation(async ({ ctx }) =>
    wrap(() =>
      csInboxDa.markAllRead(ctx.db, ctx.organizationId, ctx.user?.id ?? undefined),
    ),
  ),

  /**
   * 从平台同步消息。当前所有平台 IM adapter 未实现 listMessages，
   * 调用会诚实失败，不写演示消息。
   */
  syncFromPlatform: tenantProcedure
    .input(
      z
        .object({
          shopId: z.string().optional(),
          platform: z.string().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        csInboxDa.syncMessagesFromPlatform(ctx.db, ctx.organizationId, input ?? {}),
      ),
    ),
})
