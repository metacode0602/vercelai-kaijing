import { TRPCError } from '@trpc/server'
import { assertMerchantInScope } from '@/lib/server/auth/merchant-data-scope'
import { merchantActivityDataAccess } from '@/lib/server/dataaccess/merchant/merchant-activity'
import { merchantAccountManagerDataAccess } from '@/lib/server/dataaccess/merchant/merchant-account-manager'
import { merchantBillDataAccess } from '@/lib/server/dataaccess/merchant/merchant-bill'
import { merchantContactsDataAccess } from '@/lib/server/dataaccess/merchant/merchant-contacts'
import { merchantDataAccess } from '@/lib/server/dataaccess/merchant/merchant'
import { payoutAccountRouter } from './merchant-payout-account'
import { financeConfigRouter } from './finance-config'
import { receivingAccountRouter } from './receiving-account'
import { transferProofRouter } from './transfer-proof'
import { voucherRouter } from './voucher'
import { merchantConsumptionDataAccess } from '@/lib/server/dataaccess/merchant/merchant-consumption'
import { merchantPlatformSyncDataAccess } from '@/lib/server/dataaccess/merchant/merchant-platform-sync'
import { merchantTenantSyncDataAccess } from '@/lib/server/dataaccess/merchant/merchant-tenant-sync'
import { merchantPaymentNodeDataAccess, resolveMerchantIdForPaymentNode } from '@/lib/server/dataaccess/merchant/merchant-payment-node'
import { merchantPricingDataAccess } from '@/lib/server/dataaccess/merchant/merchant-pricing'
import { merchantRechargeDataAccess } from '@/lib/server/dataaccess/merchant/merchant-recharge'
import { merchantRegionDataAccess } from '@/lib/server/dataaccess/merchant/merchant-region'
import {
  resolveMerchantIdForContact,
  resolveMerchantIdForRecharge,
} from '@/lib/server/dataaccess/merchant/merchant-scope-helpers'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import { SuanliMerchantOpenApiError } from '@/lib/server/integrations/suanli-merchant-api'
import { SuanliOpenApiError } from '@/lib/server/integrations/suanli-tenant-api'
import {
  adminProcedure,
  createTRPCRouter,
  merchantScopedProcedure,
  merchantWriteProcedure,
} from '../trpc'
import {
  merchantActivityCreateSchema,
  merchantActivityListSchema,
  merchantActivityUpdateSchema,
  merchantBillDailySchema,
  merchantBillMonthlyDetailsSchema,
  merchantBillMonthlySchema,
  merchantBillRollupSchema,
  merchantChangeAccountManagerSchema,
  merchantConsumptionDailySchema,
  merchantConsumptionQuerySchema,
  merchantIdSchema,
  merchantListSchema,
  merchantRechargeAuditSchema,
  merchantRechargeCreateSchema,
  merchantRechargeListSchema,
  merchantRechargeUpdateSchema,
  merchantPaymentNodeAuditSchema,
  merchantPaymentNodeCancelSchema,
  merchantPaymentNodeCreateSchema,
  merchantPaymentNodeListSchema,
  merchantPaymentNodeUpdateSchema,
  merchantRegionBatchCreateSchema,
  merchantRegionCreateSchema,
  merchantRegionDeleteSchema,
  merchantRegionListSchema,
  merchantRegionUpdateSchema,
  merchantRegionUpdateCardTypesSchema,
  merchantRegionPricingBatchUpsertSchema,
  merchantRegionPricingFormSchema,
  merchantPricingListSchema,
  merchantProductPriceArchiveSchema,
  merchantProductPriceListSchema,
  merchantProductPriceUpsertSchema,
  merchantSyncCommitSchema,
  merchantSyncPreviewSchema,
  merchantTenantListSchema,
  merchantTenantSyncCommitSchema,
  merchantTenantSyncPreviewSchema,
  merchantUpdateSchema,
} from './schemas'
import {
  entityContactDeleteSchema,
  entityContactSetPrimarySchema,
  entityContactUpdateSchema,
  merchantContactCreateSchema,
  merchantContactListSchema,
} from '../shared/entity-contact-schemas'

import {
  merchantReviewApproveSchema,
  merchantReviewIdSchema,
  merchantReviewListSchema,
  merchantReviewRejectSchema,
} from './schemas'
import { merchantReviewDataAccess } from '@/lib/server/dataaccess/merchant/merchant-review'

function mapMerchantSyncError(error: unknown): TRPCError {
  if (error instanceof SuanliMerchantOpenApiError || error instanceof SuanliOpenApiError) {
    return new TRPCError({ code: 'BAD_GATEWAY', message: error.message })
  }
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: error instanceof Error ? error.message : '操作失败',
  })
}

export const merchantRouter = createTRPCRouter({
  // 收款账户审核（DEC-F3/F12）：商户端只提交，审核/停用仅运营侧
  payoutAccount: payoutAccountRouter,
  // 财务配置（DEC-F7）：全局充值阻断阈值，admin only
  financeConfig: financeConfigRouter,
  // 平台→商户 专用收款账户（商户预付/对公转账）：平台配置、商户只读
  receivingAccount: receivingAccountRouter,
  transferProof: transferProofRouter,
  // 算力券：平台发放/回收给商户租户（merchant 自助采购在 apps/merchant）
  voucher: voucherRouter,

  list: merchantScopedProcedure.input(merchantListSchema.optional()).query(async ({ input, ctx }) => {
    return merchantDataAccess.list(ctx.merchantScope, input)
  }),

  getById: merchantScopedProcedure.input(merchantIdSchema).query(async ({ input, ctx }) => {
    const row = await merchantDataAccess.getById(ctx.merchantScope, input.id)
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '商户不存在' })
    }
    return row
  }),

  listAccountManagerFilterOptions: adminProcedure.query(async ({ ctx }) => {
    const [staff, currentUserStaffId] = await Promise.all([
      merchantAccountManagerDataAccess.listAccountManagerFilterOptions(),
      staffDataAccess.resolveStaffIdForAuthUser(ctx.user),
    ])
    return { staff, currentUserStaffId }
  }),

  /** 资金相关设置：充值准入阈值（三态）+ 是否有生效默认收款账户 */
  getFundingSettings: merchantScopedProcedure
    .input(merchantIdSchema)
    .query(async ({ input, ctx }) => {
      await merchantDataAccess.getById(ctx.merchantScope, input.id)
      return merchantDataAccess.getFundingSettings(input.id)
    }),

  getAccountManagerAssignment: merchantScopedProcedure
    .input(merchantIdSchema)
    .query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.id)
      return merchantDataAccess.getAccountManager(input.id)
    }),

  getQuickStats: merchantScopedProcedure
    .input(merchantIdSchema)
    .query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.id)
      return merchantDataAccess.getQuickStats(input.id)
    }),

  changeAccountManager: adminProcedure
    .input(merchantChangeAccountManagerSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const createdByStaffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        await merchantAccountManagerDataAccess.change({
          merchantId: input.merchantId,
          staffId: input.staffId,
          effectiveFrom: input.effectiveFrom,
          remark: input.remark,
          createdByStaffId,
        })
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '设置客户经理失败',
        })
      }
    }),

  update: merchantWriteProcedure.input(merchantUpdateSchema).mutation(async ({ input, ctx }) => {
    const { id, ...data } = input
    await assertMerchantInScope(ctx.merchantScope, id)
    try {
      return await merchantDataAccess.update(id, data, ctx.user)
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: error instanceof Error ? error.message : '更新失败',
      })
    }
  }),

  tenant: createTRPCRouter({
    list: merchantScopedProcedure.input(merchantTenantListSchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.id)
      return merchantDataAccess.listTenantsByMerchantId(input.id, {
        page: input.page,
        pageSize: input.pageSize,
        platformTenantId: input.platformTenantId,
      })
    }),

    syncPreview: adminProcedure
      .input(merchantTenantSyncPreviewSchema)
      .mutation(async ({ input }) => {
        try {
          return await merchantTenantSyncDataAccess.preview(input.merchantId)
        } catch (error) {
          throw mapMerchantSyncError(error)
        }
      }),

    syncCommit: adminProcedure
      .input(merchantTenantSyncCommitSchema)
      .mutation(async ({ input }) => {
        try {
          return await merchantTenantSyncDataAccess.commit(input.previewId, input.items)
        } catch (error) {
          throw mapMerchantSyncError(error)
        }
      }),
  }),

  activity: createTRPCRouter({
    list: merchantScopedProcedure.input(merchantActivityListSchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      const [items, currentUserStaffId] = await Promise.all([
        merchantActivityDataAccess.listByMerchantId(input),
        staffDataAccess.resolveStaffIdForAuthUser(ctx.user),
      ])
      return { items, currentUserStaffId }
    }),

    createComment: merchantWriteProcedure
      .input(merchantActivityCreateSchema)
      .mutation(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          return await merchantActivityDataAccess.createComment({
            merchantId: input.merchantId,
            comment: input.comment,
            files: input.files,
            user: ctx.user,
          })
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '发送失败',
          })
        }
      }),

    updateComment: merchantWriteProcedure
      .input(merchantActivityUpdateSchema)
      .mutation(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          return await merchantActivityDataAccess.updateComment({
            merchantId: input.merchantId,
            activityId: input.activityId,
            comment: input.comment,
            user: ctx.user,
          })
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '保存失败',
          })
        }
      }),
  }),

  recharge: createTRPCRouter({
    list: merchantScopedProcedure.input(merchantRechargeListSchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      return merchantRechargeDataAccess.listByMerchantId(input.merchantId, input.paymentNodeId)
    }),

    create: merchantWriteProcedure.input(merchantRechargeCreateSchema).mutation(async ({ input, ctx }) => {
      const { merchantId, files, ...data } = input
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantRechargeDataAccess.create(merchantId, { ...data, files }, ctx.user)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '创建失败',
        })
      }
    }),

    update: merchantWriteProcedure.input(merchantRechargeUpdateSchema).mutation(async ({ input, ctx }) => {
      const { rechargeId, files, keepAttachmentIds, ...data } = input
      const merchantId = await resolveMerchantIdForRecharge(rechargeId)
      if (!merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '充值记录不存在' })
      }
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantRechargeDataAccess.update(
          rechargeId,
          { ...data, files, keepAttachmentIds },
          ctx.user,
        )
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '更新失败',
        })
      }
    }),

    auditList: merchantScopedProcedure.input(merchantRechargeAuditSchema).query(async ({ input, ctx }) => {
      if (input.rechargeId) {
        const merchantId = await resolveMerchantIdForRecharge(input.rechargeId)
        if (!merchantId) return []
        await assertMerchantInScope(ctx.merchantScope, merchantId)
        return merchantRechargeDataAccess.listAuditByRechargeId(input.rechargeId)
      }
      if (input.merchantId) {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        return merchantRechargeDataAccess.listAuditByMerchantId(input.merchantId, input.limit ?? 20)
      }
      return []
    }),
  }),

  paymentNode: createTRPCRouter({
    list: merchantScopedProcedure
      .input(merchantPaymentNodeListSchema)
      .query(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        return merchantPaymentNodeDataAccess.listByMerchantId(input.merchantId)
      }),

    create: merchantWriteProcedure
      .input(merchantPaymentNodeCreateSchema)
      .mutation(async ({ input, ctx }) => {
        const { merchantId, ...data } = input
        await assertMerchantInScope(ctx.merchantScope, merchantId)
        try {
          return await merchantPaymentNodeDataAccess.create(merchantId, data, ctx.user)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '创建失败',
          })
        }
      }),

    update: merchantWriteProcedure
      .input(merchantPaymentNodeUpdateSchema)
      .mutation(async ({ input, ctx }) => {
        const { paymentNodeId, ...data } = input
        const merchantId = await resolveMerchantIdForPaymentNode(paymentNodeId)
        if (!merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '回款节点不存在' })
        }
        await assertMerchantInScope(ctx.merchantScope, merchantId)
        try {
          return await merchantPaymentNodeDataAccess.update(paymentNodeId, data, ctx.user)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '更新失败',
          })
        }
      }),

    cancel: merchantWriteProcedure
      .input(merchantPaymentNodeCancelSchema)
      .mutation(async ({ input, ctx }) => {
        const merchantId = await resolveMerchantIdForPaymentNode(input.paymentNodeId)
        if (!merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '回款节点不存在' })
        }
        await assertMerchantInScope(ctx.merchantScope, merchantId)
        try {
          await merchantPaymentNodeDataAccess.cancel(input.paymentNodeId, ctx.user)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '作废失败',
          })
        }
      }),

    auditList: merchantScopedProcedure
      .input(merchantPaymentNodeAuditSchema)
      .query(async ({ input, ctx }) => {
        if (input.paymentNodeId) {
          const merchantId = await resolveMerchantIdForPaymentNode(input.paymentNodeId)
          if (!merchantId) return []
          await assertMerchantInScope(ctx.merchantScope, merchantId)
          return merchantPaymentNodeDataAccess.listAuditByNodeId(input.paymentNodeId)
        }
        if (input.merchantId) {
          await assertMerchantInScope(ctx.merchantScope, input.merchantId)
          return merchantPaymentNodeDataAccess.listAuditByMerchantId(
            input.merchantId,
            input.limit ?? 20,
          )
        }
        return []
      }),
  }),

  sync: createTRPCRouter({
    preview: adminProcedure.input(merchantSyncPreviewSchema).mutation(async () => {
      try {
        return await merchantPlatformSyncDataAccess.preview()
      } catch (error) {
        throw mapMerchantSyncError(error)
      }
    }),

    commit: adminProcedure.input(merchantSyncCommitSchema).mutation(async ({ input }) => {
      try {
        return await merchantPlatformSyncDataAccess.commit(input.previewId)
      } catch (error) {
        throw mapMerchantSyncError(error)
      }
    }),
  }),

  region: createTRPCRouter({
    list: merchantScopedProcedure.input(merchantRegionListSchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantRegionDataAccess.listByMerchantId(input.merchantId)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '加载区域失败',
        })
      }
    }),

    listAvailableDatacenters: merchantScopedProcedure
      .input(merchantRegionListSchema)
      .query(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          return await merchantRegionDataAccess.listAvailableDatacenters(input.merchantId)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '加载机房列表失败',
          })
        }
      }),

    create: merchantWriteProcedure.input(merchantRegionCreateSchema).mutation(async ({ input, ctx }) => {
      const { merchantId, ...data } = input
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantRegionDataAccess.create(merchantId, data, ctx.user)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '添加区域失败',
        })
      }
    }),

    batchCreate: merchantWriteProcedure
      .input(merchantRegionBatchCreateSchema)
      .mutation(async ({ input, ctx }) => {
        const { merchantId, rows } = input
        await assertMerchantInScope(ctx.merchantScope, merchantId)
        try {
          return await merchantRegionDataAccess.batchCreate(merchantId, rows, ctx.user)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '导入区域失败',
          })
        }
      }),

    update: merchantWriteProcedure.input(merchantRegionUpdateSchema).mutation(async ({ input, ctx }) => {
      const { merchantId, regionId, ...data } = input
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantRegionDataAccess.update(merchantId, regionId, data, ctx.user)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '更新区域失败',
        })
      }
    }),

    updateCardTypes: merchantWriteProcedure
      .input(merchantRegionUpdateCardTypesSchema)
      .mutation(async ({ input, ctx }) => {
        const { merchantId, regionId, enabledCardTypeIds } = input
        await assertMerchantInScope(ctx.merchantScope, merchantId)
        try {
          return await merchantRegionDataAccess.updateEnabledCardTypes(
            merchantId,
            regionId,
            enabledCardTypeIds,
            ctx.user,
          )
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '更新卡型配置失败',
          })
        }
      }),

    delete: merchantWriteProcedure.input(merchantRegionDeleteSchema).mutation(async ({ input, ctx }) => {
      const { merchantId, regionId } = input
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        await merchantRegionDataAccess.delete(merchantId, regionId, ctx.user)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '删除区域失败',
        })
      }
    }),
  }),

  pricing: createTRPCRouter({
    list: merchantScopedProcedure.input(merchantPricingListSchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantPricingDataAccess.listByMerchantId(input.merchantId)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '加载进货价失败',
        })
      }
    }),

    getRegionForm: merchantScopedProcedure
      .input(merchantRegionPricingFormSchema)
      .query(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          return await merchantPricingDataAccess.getRegionForm(input)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '加载区域进货价失败',
          })
        }
      }),

    batchUpsertForRegion: merchantWriteProcedure
      .input(merchantRegionPricingBatchUpsertSchema)
      .mutation(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          await merchantPricingDataAccess.batchUpsertForRegion(input, ctx.user)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '保存进货价失败',
          })
        }
      }),

    productList: merchantScopedProcedure
      .input(merchantProductPriceListSchema)
      .query(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          return await merchantPricingDataAccess.listProductPrices(input.merchantId)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '加载产品线进货价失败',
          })
        }
      }),

    productUpsert: merchantWriteProcedure
      .input(merchantProductPriceUpsertSchema)
      .mutation(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          await merchantPricingDataAccess.upsertProductPrice(
            {
              merchantId: input.merchantId,
              productLine: input.productLine,
              pricingModel: input.pricingModel,
              commissionRate: input.commissionRate ?? null,
              fixedUnitPrice: input.fixedUnitPrice ?? null,
              billingUnit: input.billingUnit,
              effectiveFrom: input.effectiveFrom,
              remark: input.remark ?? null,
            },
            ctx.user,
          )
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '保存产品线进货价失败',
          })
        }
      }),

    productArchive: merchantWriteProcedure
      .input(merchantProductPriceArchiveSchema)
      .mutation(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          await merchantPricingDataAccess.archiveProductPrice(input, ctx.user)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '归档产品线进货价失败',
          })
        }
      }),
  }),

  consumption: createTRPCRouter({
    daily: merchantScopedProcedure.input(merchantConsumptionDailySchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantConsumptionDataAccess.getDailyByMerchantId(input.merchantId, {
          usageMonth: input.usageMonth,
          recentDays: input.recentDays,
        })
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '加载消耗明细失败',
        })
      }
    }),

    summary: merchantScopedProcedure.input(merchantConsumptionQuerySchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantConsumptionDataAccess.getSummary(input.merchantId, input.usageMonth)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '加载消耗概览失败',
        })
      }
    }),

    tenantRank: merchantScopedProcedure.input(merchantConsumptionQuerySchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantConsumptionDataAccess.listTenantRankByMerchantId(
          input.merchantId,
          input.usageMonth,
        )
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '加载租户消耗排行失败',
        })
      }
    }),
  }),

  bill: createTRPCRouter({
    monthly: merchantScopedProcedure.input(merchantBillMonthlySchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantBillDataAccess.listMonthly(input.merchantId)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '加载月度账单失败',
        })
      }
    }),

    monthlyDetails: merchantScopedProcedure
      .input(merchantBillMonthlyDetailsSchema)
      .query(async ({ input, ctx }) => {
        await assertMerchantInScope(ctx.merchantScope, input.merchantId)
        try {
          return await merchantBillDataAccess.getMonthlyDetails(input)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : '加载月度账单明细失败',
          })
        }
      }),

    daily: merchantScopedProcedure.input(merchantBillDailySchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantBillDataAccess.listDaily(input)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '加载日账单失败',
        })
      }
    }),

    rollup: merchantWriteProcedure.input(merchantBillRollupSchema).mutation(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      try {
        return await merchantBillDataAccess.rollup(input)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '汇总商户账单失败',
        })
      }
    }),
  }),

  contacts: createTRPCRouter({
    list: merchantScopedProcedure.input(merchantContactListSchema).query(async ({ input, ctx }) => {
      await assertMerchantInScope(ctx.merchantScope, input.merchantId)
      return merchantContactsDataAccess.list(input.merchantId)
    }),
    create: merchantWriteProcedure.input(merchantContactCreateSchema).mutation(async ({ input, ctx }) => {
      const { merchantId, ...data } = input
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantContactsDataAccess.create({ merchantId, data })
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '创建失败',
        })
      }
    }),
    update: merchantWriteProcedure.input(entityContactUpdateSchema).mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantIdForContact(input.id)
      if (!merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '联系人不存在' })
      }
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantContactsDataAccess.update(input)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '更新失败',
        })
      }
    }),
    delete: merchantWriteProcedure.input(entityContactDeleteSchema).mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantIdForContact(input.id)
      if (!merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '联系人不存在' })
      }
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantContactsDataAccess.delete(input)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '删除失败',
        })
      }
    }),
    setPrimary: merchantWriteProcedure.input(entityContactSetPrimarySchema).mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantIdForContact(input.id)
      if (!merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '联系人不存在' })
      }
      await assertMerchantInScope(ctx.merchantScope, merchantId)
      try {
        return await merchantContactsDataAccess.setPrimary(input)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '设置主联系人失败',
        })
      }
    }),
  }),

  review: createTRPCRouter({
    list: adminProcedure.input(merchantReviewListSchema).query(async ({ input }) => {
      return merchantReviewDataAccess.listPending(input)
    }),

    getById: adminProcedure.input(merchantReviewIdSchema).query(async ({ input }) => {
      const detail = await merchantReviewDataAccess.getDetail(input.id)
      if (!detail) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '入驻申请不存在' })
      }
      return detail
    }),

    approve: adminProcedure.input(merchantReviewApproveSchema).mutation(async ({ input, ctx }) => {
      try {
        return await merchantReviewDataAccess.approve(input.id, {
          merchantType: input.merchantType,
        })
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '审核通过失败',
        })
      }
    }),

    reject: adminProcedure.input(merchantReviewRejectSchema).mutation(async ({ input }) => {
      try {
        await merchantReviewDataAccess.reject(input.id, input.reason)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '驳回失败',
        })
      }
    }),
  }),
})
