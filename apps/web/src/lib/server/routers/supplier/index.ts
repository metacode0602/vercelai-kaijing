import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { unitCostsDataAccess } from '@/lib/server/dataaccess/unit-costs'
import { unitCostsError, unitCostsLog } from '@/lib/server/dataaccess/unit-costs/logger'
import { platformPricingDataAccess } from '@/lib/server/dataaccess/platform-pricing'
import { platformPricingError } from '@/lib/server/dataaccess/platform-pricing/logger'
import { gpuCardTypesDataAccess } from '@/lib/server/dataaccess/supplier/gpu-card-types'
import { datacenterImportDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-import'
import { datacenterCreateDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-create'
import { datacenterUpdateDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-update'
import { deviceRetireDataAccess } from '@/lib/server/dataaccess/supplier/device-retire'
import {
  approveRetireBatch,
  rejectRetireBatch,
} from '@/lib/server/dataaccess/supplier/retire-batch-review'
import { onboardingBatchDataAccess } from '@/lib/server/dataaccess/supplier/onboarding-batch'
import { supplierOverviewDataAccess } from '@/lib/server/dataaccess/supplier/overview'
import { supplierActivityDataAccess } from '@/lib/server/dataaccess/supplier/supplier-activity'
import { platformDatacenterImportDataAccess } from '@/lib/server/dataaccess/supplier/platform-datacenter-import'
import { platformDatacenterBindDataAccess } from '@/lib/server/dataaccess/supplier/platform-datacenter-bind'
import { platformSupplierImportDataAccess } from '@/lib/server/dataaccess/supplier/platform-supplier-import'
import { platformSupplierBindDataAccess } from '@/lib/server/dataaccess/supplier/platform-supplier-bind'
import { physicalDevicesDataAccess } from '@/lib/server/dataaccess/supplier/physical-devices'
import { supplierImportDataAccess } from '@/lib/server/dataaccess/supplier/supplier-import'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import { suppliersDataAccess } from '@/lib/server/dataaccess/supplier/suppliers'
import { supplierReconciliationDataAccess } from '@/lib/server/dataaccess/supplier/supplier-reconciliation'
import { supplierReviewDataAccess } from '@/lib/server/dataaccess/supplier/supplier-review'
import { supplierOpsEngineersDataAccess } from '@/lib/server/dataaccess/supplier/supplier-ops-engineers'
import { supplierError } from '@/lib/server/dataaccess/supplier/logger'
import { SuanliSupplyOpenApiError } from '@/lib/server/integrations/suanli-supply-api'
import { PLATFORM_DATACENTER_IMPORT_MAX_TENANT_IDS } from '@/lib/supplier/platform-datacenter-import-utils'
import { PLATFORM_SUPPLIER_TYPES } from '@/lib/supplier/platform-supplier-import-utils'
import {
  datacenterRetireContextSchema,
  datacenterRetireListSampleSchema,
  datacenterRetireRequestSchema,
} from '@/lib/server/routers/supplier/datacenter-device-retire-schemas'
import { datacenterDeviceRetireDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-device-retire'
import { faultIncidentDataAccess } from '@/lib/server/dataaccess/supplier/fault-incident'
import { deviceReviewDataAccess } from '@/lib/server/dataaccess/supplier/device-review'
import {
  onboardingBatchAdjustHistorySchema,
  onboardingBatchAdjustPlanSchema,
  onboardingBatchCompleteSchema,
  onboardingBatchCommitListSchema,
  onboardingBatchCreateSchema,
  onboardingBatchListBySupplierSchema,
  onboardingBatchListSchema,
  onboardingBatchParseListSchema,
  onboardingBatchProgressEventsSchema,
  onboardingBatchDatacenterDevicesSchema,
  onboardingBatchVoidSchema,
} from '@/lib/server/routers/supplier/onboarding-batch-schemas'
import { supplierActivityListSchema, supplierActivityCreateSchema } from '@/lib/server/routers/supplier/supplier-activity-schemas'
import { deviceOnboardingRouter } from './device-onboarding'
import {
  gpuCardTypeListSchema,
  gpuCardTypeUpdateSchema,
  gpuCardTypeUpsertSchema,
} from '@/lib/server/routers/supplier/gpu-card-types-schemas'
import {
  datacenterCardTypeSpecGetSchema,
  datacenterCardTypeSpecUpsertSchema,
} from '@/lib/server/routers/supplier/datacenter-card-type-specs-schemas'
import { datacenterCardTypeSpecsDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-card-type-specs'
import {
  datacenterInfrastructureGetSchema,
  datacenterInfrastructureUpsertSchema,
} from '@/lib/server/routers/supplier/datacenter-infrastructure-schemas'
import { datacenterInfrastructureDataAccess } from '@/lib/server/dataaccess/supplier/datacenter-infrastructure'
import {
  datacenterSellPriceHistorySchema,
  datacenterSellPriceUpdateSchema,
  datacenterSellPriceUpsertSchema,
  platformPricePeriodCreateSchema,
  platformPricePeriodUpdateSchema,
  platformPriceUpdateSchema,
  platformPriceUpsertSchema,
} from '@/lib/server/routers/supplier/platform-pricing-schemas'
import {
  faultIncidentCloseSchema,
  faultIncidentCreateSchema,
  faultIncidentListSchema,
} from '@/lib/server/routers/supplier/fault-incident-schemas'
import { overviewFiltersSchema, gpuResourceTrendSchema } from '@/lib/server/routers/supplier/overview-schemas'
import { gpuResourceStatisticsDataAccess } from '@/lib/server/dataaccess/supplier/gpu-resource-statistics'
import { supplierListSchema, supplierCreateSchema, supplierUpdateSchema, dataCenterListSchema, gpuInventoryListSchema, physicalDeviceListSchema, supplierReviewListSchema, supplierReviewIdSchema, supplierReviewApproveSchema, supplierReviewRejectSchema } from '@/lib/server/routers/supplier/supplier-schemas'
import {
  supplierOpsEngineerCreateSchema,
  supplierOpsEngineerDeleteSchema,
  supplierOpsEngineerListSchema,
  supplierOpsEngineerUpdateSchema,
} from '@/lib/server/routers/supplier/supplier-ops-engineer-schemas'
import { datacenterCreateSchema } from '@/lib/server/routers/supplier/datacenter-create-schemas'
import {
  datacenterUpdateSchema,
  datacenterUpdateStatusSchema,
  datacenterUpdateCooperationStatusSchema,
} from '@/lib/server/routers/supplier/datacenter-update-schemas'
import {
  unitCostListSchema,
  unitCostUpdateSchema,
  unitCostUpsertSchema,
} from '@/lib/server/routers/supplier/unit-costs-schemas'
import { supplierDataCleanupDataAccess } from '@/lib/server/dataaccess/supplier/data-cleanup'
import {
  supplierDataCleanupExecuteSchema,
  supplierDataCleanupPreviewSchema,
} from '@/lib/server/routers/supplier/data-cleanup-schemas'
import { gatewayNodeOpsDataAccess, invoiceOpsDataAccess } from '@/lib/server/dataaccess/supplier/gateway-invoice-ops'
import {
  gatewayNodeReviewSchema,
  invoiceRequestReviewSchema,
  invoiceIssueSchema,
  invoiceVoidSchema,
} from './gateway-invoice-schemas'
import { bareMetalOrderDataAccess } from '@/lib/server/dataaccess/supplier/bare-metal-order'
import { bareMetalOrderSyncErrorsDataAccess } from '@/lib/server/dataaccess/supplier/bare-metal-order-sync-errors'
import {
  bareMetalSyncFailedItemIdSchema,
  bareMetalSyncFailedItemsListSchema,
  bareMetalSyncJobRunIdSchema,
} from '@/lib/server/routers/supplier/bare-metal-order-sync-schemas'
import { deviceReviewRouter } from '@/lib/server/routers/supplier/device-review'
import { contractDataAccess } from '@/lib/server/dataaccess/supplier/contract'
import {
  contractCreateSchema,
  contractUpdateSchema,
  contractSendToSupplierSchema,
  contractTerminateSchema,
  contractLinkDevicesSchema,
  contractListSchema,
  capacityLineUpsertSchema,
} from '@/lib/server/routers/supplier/contract-schemas'
import { db } from '@/lib/db'
import { supplierContract, supplierContractCapacityLine } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

import {
  bareMetalOrderListSchema,
} from '@/lib/server/routers/supplier/bare-metal-order-schemas'
import { slaRouter } from '@/lib/server/routers/supplier/sla'
import { adminProcedure, createTRPCRouter, sharedReadProcedure, supplyProcedure } from '../trpc'

const importFileSchema = z.object({
  fileName: z.string().min(1),
  fileBase64: z.string().min(1),
})

const platformSupplierSearchSchema = z.object({
  types: z.enum(PLATFORM_SUPPLIER_TYPES),
  name: z.string(),
  defaultBusinessManagerStaffId: z.string().min(1),
})

const platformSupplierBindSearchSchema = z.object({
  supplierId: z.string().min(1),
  query: z.string().trim().min(1, '请输入平台租户 ID 或名称'),
})

const platformSupplierBindCommitSchema = z.object({
  supplierId: z.string().min(1),
  applicationId: z.string().min(1),
})

const platformDatacenterSearchSchema = z.object({
  tenantIds: z
    .array(z.string().regex(/^\d+$/))
    .max(PLATFORM_DATACENTER_IMPORT_MAX_TENANT_IDS),
  name: z.string(),
})

const platformDatacenterBindSearchSchema = z.object({
  dataCenterId: z.string().min(1),
  query: z.string().trim().min(1, '请输入平台租户 ID、机房 ID 或名称'),
})

const platformDatacenterBindCommitSchema = z.object({
  dataCenterId: z.string().min(1),
  idcId: z.string().min(1),
})

function mapImportError(error: unknown): never {
  if (error instanceof TRPCError) {
    throw error
  }
  if (error instanceof SuanliSupplyOpenApiError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  }
  if (error instanceof Error) {
    const message = error.message
    if (
      message.includes('不能超过') ||
      message.includes('仅支持') ||
      message.includes('至少需要') ||
      message.includes('请至少输入') ||
      message.includes('单次最多') ||
      message.includes('无效') ||
      message.includes('不存在') ||
      message.includes('无法解析') ||
      message.includes('请先') ||
      message.includes('没有可入库') ||
      message.includes('没有可导入') ||
      message.includes('没有通过校验') ||
      message.includes('外网IP') ||
      message.includes('期望完成日期') ||
      message.includes('已在线') ||
      message.includes('不属于') ||
      message.includes('拉取') ||
      message.includes('OpenAPI') ||
      message.includes('算算力') ||
      message.includes('已存在') ||
      message.includes('无法禁用') ||
      message.includes('无法配置') ||
      message.includes('不可变更') ||
      message.includes('已有平台价') ||
      message.includes('请填写') ||
      message.includes('须晚于') ||
      message.includes('重叠') ||
      message.includes('阶梯') ||
      message.includes('成本配置') ||
      message.includes('不可变更') ||
      message.includes('清单行数') ||
      message.includes('显卡型号') ||
      message.includes('无法识别') ||
      message.includes('未填写') ||
      message.includes('卡型') ||
      message.includes('上架计划') ||
      message.includes('内部占用') ||
      message.includes('IP') ||
      message.includes('合作类型') ||
      message.includes('机房不一致') ||
      message.includes('工单号指向') ||
      message.includes('SN 已存在') ||
      message.includes('资产编号已存在') ||
      message.includes('唯一性冲突') ||
      message.includes('复制源') ||
      message.includes('结束时间') ||
      message.includes('Karmada') ||
      message.includes('标签值') ||
      message.includes('线索') ||
      message.includes('资源对接人') ||
      message.includes('对接范围') ||
      message.includes('活动不存在') ||
      message.includes('评论可编辑') ||
      message.includes('已转正线索不可编辑')
    ) {
      throw new TRPCError({ code: 'BAD_REQUEST', message })
    }
    supplierError('supplier-router', 'operation failed', error)
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '操作失败，请稍后重试' })
  }
  throw error
}

export const supplierRouter = createTRPCRouter({
  sla: slaRouter,

  list: supplyProcedure.input(supplierListSchema).query(async ({ input }) => {
    try {
      return await suppliersDataAccess.list(input ?? {})
    } catch (e) {
      mapImportError(e)
    }
  }),

  getById: supplyProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      try {
        const row = await suppliersDataAccess.getById(input.id)
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '供应商不存在' })
        }
        return row
      } catch (e) {
        mapImportError(e)
      }
    }),

  listSupplierActivities: supplyProcedure
    .input(supplierActivityListSchema)
    .query(async ({ input }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await supplierActivityDataAccess.listBySupplierId(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  createSupplierActivity: supplyProcedure
    .input(supplierActivityCreateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await supplierActivityDataAccess.createComment({
          supplierId: input.supplierId,
          comment: input.comment,
          files: input.files,
          user: ctx.user,
        })
      } catch (e) {
        if (e instanceof Error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '发布动态失败' })
      }
    }),

  update: supplyProcedure.input(supplierUpdateSchema).mutation(async ({ input }) => {
    try {
      return await suppliersDataAccess.update(input)
    } catch (e) {
      mapImportError(e)
    }
  }),

  create: supplyProcedure.input(supplierCreateSchema).mutation(async ({ input }) => {
    try {
      return await suppliersDataAccess.create(input)
    } catch (e) {
      mapImportError(e)
    }
  }),

  listOpsEngineers: supplyProcedure
    .input(supplierOpsEngineerListSchema)
    .query(async ({ input }) => {
      try {
        return await supplierOpsEngineersDataAccess.list(input)
      } catch (e) {
        if (e instanceof Error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
        }
        mapImportError(e)
      }
    }),

  createOpsEngineer: supplyProcedure
    .input(supplierOpsEngineerCreateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await supplierOpsEngineersDataAccess.create({
          ...input,
          operatorStaffId: staffId,
        })
      } catch (e) {
        if (e instanceof Error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
        }
        mapImportError(e)
      }
    }),

  updateOpsEngineer: supplyProcedure
    .input(supplierOpsEngineerUpdateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await supplierOpsEngineersDataAccess.update({
          id: input.id,
          ...input.data,
          operatorStaffId: staffId,
        })
      } catch (e) {
        if (e instanceof Error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
        }
        mapImportError(e)
      }
    }),

  deleteOpsEngineer: supplyProcedure
    .input(supplierOpsEngineerDeleteSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await supplierOpsEngineersDataAccess.delete({
          id: input.id,
          operatorStaffId: staffId,
        })
      } catch (e) {
        if (e instanceof Error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
        }
        mapImportError(e)
      }
    }),

  listDataCenters: supplyProcedure
    .input(z.object({ supplierId: z.string() }))
    .query(async ({ input }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await suppliersDataAccess.listDataCentersBySupplier(input.supplierId)
      } catch (e) {
        mapImportError(e)
      }
    }),

  createDataCenter: supplyProcedure
    .input(datacenterCreateSchema)
    .mutation(async ({ input }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await datacenterCreateDataAccess.create(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  updateDataCenter: supplyProcedure
    .input(datacenterUpdateSchema)
    .mutation(async ({ input }) => {
      try {
        return await datacenterUpdateDataAccess.update(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  updateDataCenterStatus: supplyProcedure
    .input(datacenterUpdateStatusSchema)
    .mutation(async ({ input }) => {
      try {
        return await datacenterUpdateDataAccess.updateStatus(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  updateDataCenterCooperationStatus: supplyProcedure
    .input(datacenterUpdateCooperationStatusSchema)
    .mutation(async ({ input }) => {
      try {
        return await datacenterUpdateDataAccess.updateCooperationStatus(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  listAllDataCenters: supplyProcedure
    .input(dataCenterListSchema.optional())
    .query(async ({ input }) => {
      try {
        if (input?.supplierId) {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
        }
        return await suppliersDataAccess.listAllDataCenters(input ?? {})
      } catch (e) {
        mapImportError(e)
      }
    }),

  getDataCenterStats: supplyProcedure
    .input(z.object({ supplierId: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        if (input.supplierId) {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
        }
        return await suppliersDataAccess.getDataCenterStats({ supplierId: input.supplierId })
      } catch (e) {
        mapImportError(e)
      }
    }),

  getDataCenterDetail: supplyProcedure
    .input(z.object({ dataCenterId: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const detail = await suppliersDataAccess.getDataCenterDetail(input.dataCenterId)
        if (!detail) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '机房不存在' })
        }
        return detail
      } catch (e) {
        mapImportError(e)
      }
    }),

  listGpuInventory: supplyProcedure
    .input(gpuInventoryListSchema.optional())
    .query(async ({ input }) => {
      try {
        if (input?.supplierId) {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
        }
        return await suppliersDataAccess.listGpuInventory(input ?? {})
      } catch (e) {
        mapImportError(e)
      }
    }),

  getGpuInventoryDetail: supplyProcedure
    .input(
      z.object({
        inventoryId: z.string().min(1),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      try {
        const detail = await suppliersDataAccess.getGpuInventoryDetail(input.inventoryId, {
          page: input.page,
          pageSize: input.pageSize,
        })
        if (!detail) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '聚合库存不存在' })
        }
        return detail
      } catch (e) {
        mapImportError(e)
      }
    }),

  listContracts: supplyProcedure
    .input(z.object({ supplierId: z.string() }))
    .query(async ({ input }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await suppliersDataAccess.listContractsBySupplier(input.supplierId)
      } catch (e) {
        mapImportError(e)
      }
    }),

  listAllContracts: supplyProcedure.query(async () => {
    try {
      return await suppliersDataAccess.listAllContracts()
    } catch (e) {
      mapImportError(e)
    }
  }),

  listBills: supplyProcedure
    .input(z.object({ supplierId: z.string() }))
    .query(async ({ input }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await suppliersDataAccess.listBillsBySupplier(input.supplierId)
      } catch (e) {
        mapImportError(e)
      }
    }),

  markBillPaid: supplyProcedure
    .input(
      z.object({
        billId: z.string().min(1),
        /**
         * 实际付款人（自由文本，如财务姓名 / 账户名）。
         * 必填：与 `BillSettlementDialog` 的表单校验对齐。
         * 此前是 optional 且注释写「缺省用当前登录用户名」，但
         * `markBillPaid` 并没有实现该兜底，缺省时会直接把 paid_by 写成 NULL，
         * 于是付款人无从追溯，而审计表里也只有 operatorStaffId。
         */
        paidBy: z.string().trim().min(1).max(64),
        /**
         * 银行回单号 / 支付流水号，用于对账。必填：
         * 没有回单号的对账记录在财务上等于没记录（见 BillSettlementDialog 注释）。
         */
        paymentReference: z.string().trim().min(1).max(128),
        /**
         * 付款备注 / 扣罚说明，仅作审计留痕。
         *
         * 注意：本字段**不改变账单金额** —— 它只落 `supplier_bill.adjustment_reason`，
         * 而 `adjustment_amount` 目前没有任何写入路径，`final_amount` 也不会重算。
         * 金额调整属于账单异议流程（W-23），用户已明确本轮不做。
         * UI 上该字段的说明文案已同步标注「不影响金额」，避免运营误以为会改总额。
         */
        adjustmentReason: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // 必须把 better-auth 的 user id 翻译成 `user_staff.id`：
        // `entity_state_transition_log.operator_staff_id` 外键指向 user_staff，
        // 而 user_staff.id 是独立生成的 cuid（与 user.id 不同 id 空间，
        // 二者通过 user_staff.auth_user_id 关联）。直接传 ctx.user.id 会触发
        // FK 23503 并把整个付款事务回滚 —— 此前「标记已付款」因此 100% 失败。
        const operatorStaffId =
          await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await suppliersDataAccess.markBillPaid(input.billId, {
          operatorStaffId,
          paidBy: input.paidBy,
          paymentReference: input.paymentReference,
          adjustmentReason: input.adjustmentReason ?? null,
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

  listPricingRecords: supplyProcedure
    .input(z.object({ supplierId: z.string() }))
    .query(async ({ input }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await suppliersDataAccess.listPricingRecordsBySupplier(input.supplierId)
      } catch (e) {
        mapImportError(e)
      }
    }),

  listPricingHistory: supplyProcedure
    .input(z.object({ supplierId: z.string() }))
    .query(async ({ input }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        return await suppliersDataAccess.listPricingHistoryBySupplier(input.supplierId)
      } catch (e) {
        mapImportError(e)
      }
    }),

  listActiveGpuCardTypes: supplyProcedure.query(async () => {
    try {
      return await suppliersDataAccess.listActiveGpuCardTypes()
    } catch (e) {
      mapImportError(e)
    }
  }),

  listPhysicalDevices: supplyProcedure
    .input(physicalDeviceListSchema.optional())
    .query(async ({ input }) => {
      try {
        if (input?.supplierId) {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
        }
        return await physicalDevicesDataAccess.list(input ?? {})
      } catch (e) {
        mapImportError(e)
      }
    }),

  listPhysicalDeviceFilterOptions: supplyProcedure
    .input(z.object({ supplierId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        if (input?.supplierId) {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
        }
        return await physicalDevicesDataAccess.listFilterOptions(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

  getPhysicalDeviceStats: supplyProcedure
    .input(z.object({ supplierId: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        if (input.supplierId) {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
        }
        return await physicalDevicesDataAccess.getStats({ supplierId: input.supplierId })
      } catch (e) {
        mapImportError(e)
      }
    }),

  getPhysicalDeviceDetail: supplyProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const detail = await physicalDevicesDataAccess.getDetail(input.deviceId)
        if (!detail) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '设备不存在' })
        }
        return detail
      } catch (e) {
        mapImportError(e)
      }
    }),

  markPhysicalDeviceOnline: supplyProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await physicalDevicesDataAccess.markOnline({
          deviceId: input.deviceId,
          operatorName: ctx.user.name ?? ctx.user.email ?? '运营',
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

  listPhysicalDevice: supplyProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await physicalDevicesDataAccess.listDevice({
          deviceId: input.deviceId,
          operatorName: ctx.user.name ?? ctx.user.email ?? '运营',
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

  unlistPhysicalDevice: supplyProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await physicalDevicesDataAccess.unlistDevice({
          deviceId: input.deviceId,
          operatorName: ctx.user.name ?? ctx.user.email ?? '运营',
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

  setPhysicalDeviceListingDisabled: supplyProcedure
    .input(z.object({
      deviceId: z.string().min(1),
      listingDisabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await physicalDevicesDataAccess.setListingDisabled({
          deviceId: input.deviceId,
          listingDisabled: input.listingDisabled,
          operatorName: ctx.user.name ?? ctx.user.email ?? '运营',
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

  deviceRetire: createTRPCRouter({
    listBatches: supplyProcedure
      .input(
        z
          .object({
            supplierId: z.string().optional(),
            dataCenterId: z.string().optional(),
            importStatus: z.string().optional(),
            search: z.string().optional(),
          })
          .optional(),
      )
      .query(async ({ input }) => {
        try {
          return await deviceRetireDataAccess.listBatches(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    getBatchById: supplyProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const batch = await deviceRetireDataAccess.getBatchById(input.id)
          if (!batch) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '下架批次不存在' })
          }
          return batch
        } catch (e) {
          mapImportError(e)
        }
      }),

    getDatacenterContext: supplyProcedure
      .input(datacenterRetireContextSchema)
      .query(async ({ input }) => {
        try {
          return await datacenterDeviceRetireDataAccess.getContext(input.dataCenterId)
        } catch (e) {
          mapImportError(e)
        }
      }),

    getDatacenterRetireListSample: supplyProcedure
      .input(datacenterRetireListSampleSchema)
      .query(async ({ input }) => {
        try {
          return await datacenterDeviceRetireDataAccess.listRetireListSampleRows(
            input.dataCenterId,
            input.planLines,
          )
        } catch (e) {
          mapImportError(e)
        }
      }),

    previewDatacenter: supplyProcedure
      .input(datacenterRetireRequestSchema)
      .mutation(async ({ input }) => {
        try {
          return await datacenterDeviceRetireDataAccess.preview(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    commitDatacenter: supplyProcedure
      .input(datacenterRetireRequestSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await datacenterDeviceRetireDataAccess.commit({
            ...input,
            operatorStaffId: staffId,
            operatorName: ctx.user.name ?? ctx.user.email ?? '运营',
          })
        } catch (e) {
          mapImportError(e)
        }
      }),

    approveBatch: adminProcedure
      .input(z.object({ batchId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          await approveRetireBatch(input.batchId, staffId ?? undefined)
          return { success: true }
        } catch (e) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: e instanceof Error ? e.message : '审批失败',
          })
        }
      }),

    rejectBatch: adminProcedure
      .input(
        z.object({
          batchId: z.string().min(1),
          reason: z.string().min(1, '请填写驳回原因'),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          await rejectRetireBatch(input.batchId, input.reason, staffId ?? undefined)
          return { success: true }
        } catch (e) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: e instanceof Error ? e.message : '审批失败',
          })
        }
      }),
  }),

  onboardingBatch: createTRPCRouter({
    list: supplyProcedure.input(onboardingBatchListSchema).query(async ({ input }) => {
      try {
        return await onboardingBatchDataAccess.list(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

    listBySupplier: supplyProcedure
      .input(onboardingBatchListBySupplierSchema)
      .query(async ({ input }) => {
        try {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
          return await onboardingBatchDataAccess.listBySupplierId(input.supplierId)
        } catch (e) {
          mapImportError(e)
        }
      }),

    getById: supplyProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const batch = await onboardingBatchDataAccess.getById(input.id)
          if (!batch) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '接入批次不存在' })
          }
          return batch
        } catch (e) {
          mapImportError(e)
        }
      }),

    getProgress: supplyProcedure
      .input(z.object({ batchId: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          return await onboardingBatchDataAccess.getProgress(input.batchId)
        } catch (e) {
          mapImportError(e)
        }
      }),

    getDetailPage: supplyProcedure
      .input(z.object({ batchId: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const detail = await onboardingBatchDataAccess.getDetailPage(input.batchId)
          if (!detail) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '接入批次不存在' })
          }
          return detail
        } catch (e) {
          mapImportError(e)
        }
      }),

    listDatacenterUploadedDevices: supplyProcedure
      .input(onboardingBatchDatacenterDevicesSchema)
      .query(async ({ input }) => {
        try {
          const result = await onboardingBatchDataAccess.listDatacenterUploadedDevices(
            input.batchId,
          )
          if (!result) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '接入批次不存在' })
          }
          return result
        } catch (e) {
          mapImportError(e)
        }
      }),

    create: supplyProcedure.input(onboardingBatchCreateSchema).mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await onboardingBatchDataAccess.create({
          ...input,
          operatorStaffId: staffId,
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

    parseList: supplyProcedure.input(onboardingBatchParseListSchema).mutation(async ({ input }) => {
      try {
        return await onboardingBatchDataAccess.parseList(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

    commitList: supplyProcedure.input(onboardingBatchCommitListSchema).mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await onboardingBatchDataAccess.commitList({
          ...input,
          operatorStaffId: staffId,
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

    adjustPlan: supplyProcedure
      .input(onboardingBatchAdjustPlanSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          const staff = staffId
            ? await staffDataAccess.getById(staffId).catch(() => null)
            : null
          return await onboardingBatchDataAccess.adjustPlan({
            ...input,
            operatorStaffId: staffId,
            operatorName: staff?.display_name ?? ctx.user.name ?? '运营',
          })
        } catch (e) {
          mapImportError(e)
        }
      }),

    listProgressEvents: supplyProcedure
      .input(onboardingBatchProgressEventsSchema)
      .query(async ({ input }) => {
        try {
          return await onboardingBatchDataAccess.listProgressEvents(input.batchId)
        } catch (e) {
          mapImportError(e)
        }
      }),

    listAdjustHistory: supplyProcedure
      .input(onboardingBatchAdjustHistorySchema)
      .query(async ({ input }) => {
        try {
          return await onboardingBatchDataAccess.listAdjustHistory(input.batchId)
        } catch (e) {
          mapImportError(e)
        }
      }),

    completeBatch: supplyProcedure
      .input(onboardingBatchCompleteSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          const staff = staffId
            ? await staffDataAccess.getById(staffId).catch(() => null)
            : null
          return await onboardingBatchDataAccess.completeBatch({
            ...input,
            operatorStaffId: staffId,
            operatorName: staff?.display_name ?? ctx.user.name ?? '运营',
          })
        } catch (e) {
          mapImportError(e)
        }
      }),

    voidBatch: supplyProcedure
      .input(onboardingBatchVoidSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          const staff = staffId
            ? await staffDataAccess.getById(staffId).catch(() => null)
            : null
          return await onboardingBatchDataAccess.voidBatch({
            ...input,
            operatorStaffId: staffId,
            operatorName: staff?.display_name ?? ctx.user.name ?? '运营',
          })
        } catch (e) {
          mapImportError(e)
        }
      }),

    getContractCapacityInfo: supplyProcedure
      .input(z.object({ contractId: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          return await onboardingBatchDataAccess.getContractCapacityInfo(input.contractId)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  faultIncident: createTRPCRouter({
    list: supplyProcedure.input(faultIncidentListSchema).query(async ({ input }) => {
      try {
        if (input?.supplierId) {
          await suppliersDataAccess.assertSupplierExists(input.supplierId)
        }
        return await faultIncidentDataAccess.list(input ?? {})
      } catch (e) {
        mapImportError(e)
      }
    }),

    create: supplyProcedure.input(faultIncidentCreateSchema).mutation(async ({ input, ctx }) => {
      try {
        await suppliersDataAccess.assertSupplierExists(input.supplierId)
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await faultIncidentDataAccess.create({
          ...input,
          operatorStaffId: staffId,
          operatorName: ctx.user.name ?? ctx.user.email ?? '运营',
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

    close: supplyProcedure.input(faultIncidentCloseSchema).mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await faultIncidentDataAccess.close({
          incidentId: input.incidentId,
          resolution: input.resolution,
          operatorStaffId: staffId,
          operatorName: ctx.user.name ?? ctx.user.email ?? '运营',
        })
      } catch (e) {
        mapImportError(e)
      }
    }),
  }),


  import: createTRPCRouter({
    preview: supplyProcedure
      .input(
        importFileSchema.extend({
          defaultBusinessManagerStaffId: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await supplierImportDataAccess.preview(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    commit: supplyProcedure
      .input(
        importFileSchema.extend({
          defaultBusinessManagerStaffId: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          return await supplierImportDataAccess.commit(input)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  datacenterImport: createTRPCRouter({
    preview: supplyProcedure
      .input(importFileSchema.extend({ supplierId: z.string().min(1).optional() }))
      .mutation(async ({ input }) => {
        try {
          return await datacenterImportDataAccess.preview(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    commit: supplyProcedure
      .input(importFileSchema.extend({ supplierId: z.string().min(1).optional() }))
      .mutation(async ({ input }) => {
        try {
          return await datacenterImportDataAccess.commit(input)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  platformImport: createTRPCRouter({
    preview: supplyProcedure
      .input(platformSupplierSearchSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformSupplierImportDataAccess.preview(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    commit: supplyProcedure
      .input(platformSupplierSearchSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformSupplierImportDataAccess.commit(input)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  platformBind: createTRPCRouter({
    search: supplyProcedure
      .input(platformSupplierBindSearchSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformSupplierBindDataAccess.search(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    bind: supplyProcedure
      .input(platformSupplierBindCommitSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformSupplierBindDataAccess.bind(input)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  platformDatacenterImport: createTRPCRouter({
    preview: supplyProcedure
      .input(platformDatacenterSearchSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformDatacenterImportDataAccess.preview(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    commit: supplyProcedure
      .input(platformDatacenterSearchSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformDatacenterImportDataAccess.commit(input)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  platformDatacenterBind: createTRPCRouter({
    search: supplyProcedure
      .input(platformDatacenterBindSearchSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformDatacenterBindDataAccess.search(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    bind: supplyProcedure
      .input(platformDatacenterBindCommitSchema)
      .mutation(async ({ input }) => {
        try {
          return await platformDatacenterBindDataAccess.bind(input)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  gpuCardTypes: createTRPCRouter({
    list: sharedReadProcedure.input(gpuCardTypeListSchema).query(async ({ input }) => {
      try {
        return await gpuCardTypesDataAccess.list(input ?? {})
      } catch (e) {
        mapImportError(e)
      }
    }),

    listActive: sharedReadProcedure.query(async () => {
      try {
        return await gpuCardTypesDataAccess.listActive()
      } catch (e) {
        mapImportError(e)
      }
    }),

    getById: sharedReadProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        try {
          const row = await gpuCardTypesDataAccess.getById(input.id)
          if (!row) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '卡型不存在' })
          }
          return row
        } catch (e) {
          mapImportError(e)
        }
      }),

    getDetailPage: sharedReadProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const detail = await gpuCardTypesDataAccess.getDetailPage(input.id)
          if (!detail) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '卡型不存在' })
          }
          return detail
        } catch (e) {
          mapImportError(e)
        }
      }),

    getDatacenterDetail: sharedReadProcedure
      .input(
        z.object({
          cardTypeId: z.string().min(1),
          dataCenterId: z.string().min(1),
        }),
      )
      .query(async ({ input }) => {
        try {
          const detail = await gpuCardTypesDataAccess.getDatacenterDetail(input)
          if (!detail) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '卡型或机房不存在' })
          }
          return detail
        } catch (e) {
          mapImportError(e)
        }
      }),

    create: supplyProcedure.input(gpuCardTypeUpsertSchema).mutation(async ({ input }) => {
      try {
        return await gpuCardTypesDataAccess.create(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

    update: supplyProcedure
      .input(z.object({ id: z.string(), data: gpuCardTypeUpdateSchema }))
      .mutation(async ({ input }) => {
        try {
          return await gpuCardTypesDataAccess.update(input.id, input.data)
        } catch (e) {
          mapImportError(e)
        }
      }),

    setStatus: supplyProcedure
      .input(z.object({ id: z.string(), status: z.enum(['active', 'disabled']) }))
      .mutation(async ({ input }) => {
        try {
          return await gpuCardTypesDataAccess.setStatus(input.id, input.status)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  datacenterCardSpecs: createTRPCRouter({
    get: supplyProcedure.input(datacenterCardTypeSpecGetSchema).query(async ({ input }) => {
      try {
        return await datacenterCardTypeSpecsDataAccess.get(input.dataCenterId, input.gpuCardTypeId)
      } catch (e) {
        mapImportError(e)
      }
    }),

    upsert: supplyProcedure
      .input(datacenterCardTypeSpecUpsertSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await datacenterCardTypeSpecsDataAccess.upsert({
            ...input,
            changedByStaffId: staffId,
          })
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  datacenterInfrastructure: createTRPCRouter({
    get: supplyProcedure.input(datacenterInfrastructureGetSchema).query(async ({ input }) => {
      try {
        return await datacenterInfrastructureDataAccess.get(input.dataCenterId)
      } catch (e) {
        mapImportError(e)
      }
    }),

    upsert: supplyProcedure
      .input(datacenterInfrastructureUpsertSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await datacenterInfrastructureDataAccess.upsert({
            ...input,
            changedByStaffId: staffId,
          })
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  unitCosts: createTRPCRouter({
    listRecords: adminProcedure.input(unitCostListSchema).query(async ({ input }) => {
      try {
        return await unitCostsDataAccess.listRecords(input?.supplierId)
      } catch (e) {
        mapImportError(e)
      }
    }),

    listHistory: adminProcedure.input(unitCostListSchema).query(async ({ input }) => {
      try {
        return await unitCostsDataAccess.listHistory(input?.supplierId)
      } catch (e) {
        mapImportError(e)
      }
    }),

    create: adminProcedure.input(unitCostUpsertSchema).mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await unitCostsDataAccess.createRecord({
          ...input,
          pricingMode: input.pricingMode,
          updatedByStaffId: staffId,
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

    update: adminProcedure.input(unitCostUpdateSchema).mutation(async ({ input, ctx }) => {
      try {
        const row = await unitCostsDataAccess.getRecordById(input.recordId)
        if (!row) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '成本配置不存在' })
        }
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        unitCostsLog('router.update', 'unit cost update requested', {
          recordId: input.recordId,
          pricingMode: input.pricingMode,
          userId: ctx.user.id,
        })
        const updated = await unitCostsDataAccess.updateRecord({
          supplierId: row.supplierId,
          dataCenterId: row.dataCenterId,
          gpuCardTypeId: row.cardTypeId,
          pricingMode: input.pricingMode,
          billingUnit: input.billingUnit,
          unitPrice: input.unitPrice,
          unitPricePerHour: input.unitPricePerHour,
          cardsPerMachine: input.cardsPerMachine,
          revenueSharePercent: input.revenueSharePercent,
          pricingTiers: input.pricingTiers,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo,
          recordId: input.recordId,
          reason: input.reason,
          changedByStaffId: staffId,
        })
        return updated
      } catch (e) {
        unitCostsError('router.update', 'unit cost update failed', e, {
          recordId: input.recordId,
        })
        mapImportError(e)
      }
    }),
  }),

  overview: createTRPCRouter({
    getFilterOptions: supplyProcedure.query(async () => {
      try {
        return await supplierOverviewDataAccess.getFilterOptions()
      } catch (e) {
        supplierError('router.overview.getFilterOptions', 'failed', e)
        mapImportError(e)
      }
    }),

    getStats: supplyProcedure.input(overviewFiltersSchema).query(async ({ input }) => {
      try {
        return await supplierOverviewDataAccess.getStats(input)
      } catch (e) {
        supplierError('router.overview.getStats', 'failed', e, input)
        mapImportError(e)
      }
    }),

    getGpuResourceTrend: supplyProcedure
      .input(gpuResourceTrendSchema)
      .query(async ({ input }) => {
        try {
          return await gpuResourceStatisticsDataAccess.getTrend(input.range)
        } catch (e) {
          supplierError('router.overview.getGpuResourceTrend', 'failed', e, input)
          mapImportError(e)
        }
      }),

    getGpuRegionOverview: supplyProcedure.query(async () => {
      try {
        return await gpuResourceStatisticsDataAccess.getRegionOverview()
      } catch (e) {
        supplierError('router.overview.getGpuRegionOverview', 'failed', e)
        mapImportError(e)
      }
    }),

    getAdminStatisticsDataCount: supplyProcedure
      .input(overviewFiltersSchema.pick({ region: true }))
      .query(async ({ input }) => {
        try {
          return await gpuResourceStatisticsDataAccess.getAdminStatisticsDataCount(input.region)
        } catch (e) {
          supplierError('router.overview.getAdminStatisticsDataCount', 'failed', e, input)
          mapImportError(e)
        }
      }),
  }),

  platformPricing: createTRPCRouter({
    listPage: supplyProcedure.query(async () => {
      try {
        return await platformPricingDataAccess.getListPage()
      } catch (e) {
        platformPricingError('router.listPage', 'failed', e)
        mapImportError(e)
      }
    }),

    listRecords: supplyProcedure.query(async () => {
      try {
        return await platformPricingDataAccess.listRecords()
      } catch (e) {
        platformPricingError('router.listRecords', 'failed', e)
        mapImportError(e)
      }
    }),

    listRecordsForCardType: supplyProcedure
      .input(z.object({ cardTypeId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await platformPricingDataAccess.listRecordsForCardType(input.cardTypeId)
        } catch (e) {
          platformPricingError('router.listRecordsForCardType', 'failed', e, input)
          mapImportError(e)
        }
      }),

    getDetailPage: supplyProcedure
      .input(z.object({ cardTypeId: z.string() }))
      .query(async ({ input }) => {
        try {
          const detail = await platformPricingDataAccess.getDetailPage(input.cardTypeId)
          if (!detail) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '卡型不存在' })
          }
          return detail
        } catch (e) {
          platformPricingError('router.getDetailPage', 'failed', e, input)
          mapImportError(e)
        }
      }),

    listHistory: supplyProcedure
      .input(z.object({ cardTypeId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await platformPricingDataAccess.listHistory(input.cardTypeId)
        } catch (e) {
          platformPricingError('router.listHistory', 'failed', e, input)
          mapImportError(e)
        }
      }),

    listSellPricesForCardType: supplyProcedure
      .input(z.object({ cardTypeId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await platformPricingDataAccess.listSellPricesForCardType(input.cardTypeId)
        } catch (e) {
          platformPricingError('router.listSellPricesForCardType', 'failed', e, input)
          mapImportError(e)
        }
      }),

    listSellPriceHistory: supplyProcedure
      .input(datacenterSellPriceHistorySchema)
      .query(async ({ input }) => {
        try {
          return await platformPricingDataAccess.listSellPriceHistory(
            input.cardTypeId,
            input.dataCenterId,
          )
        } catch (e) {
          platformPricingError('router.listSellPriceHistory', 'failed', e, input)
          mapImportError(e)
        }
      }),

    create: adminProcedure.input(platformPriceUpsertSchema).mutation(async ({ ctx, input }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await platformPricingDataAccess.createPrice({
          ...input,
          changedByStaffId: staffId,
        })
      } catch (e) {
        platformPricingError('router.create', 'failed', e, { gpuCardTypeId: input.gpuCardTypeId })
        mapImportError(e)
      }
    }),

    update: adminProcedure.input(platformPriceUpdateSchema).mutation(async ({ ctx, input }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await platformPricingDataAccess.updatePrice({
          ...input,
          changedByStaffId: staffId,
        })
      } catch (e) {
        platformPricingError('router.update', 'failed', e, { recordId: input.recordId })
        mapImportError(e)
      }
    }),

    createPeriod: adminProcedure
      .input(platformPricePeriodCreateSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await platformPricingDataAccess.createPeriod({
            gpuCardTypeId: input.gpuCardTypeId,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            copyFromPeriodId: input.copyFromPeriodId,
            autoClosePreviousCurrent: input.autoClosePreviousCurrent,
            manualPrices: input.manualPrices,
            changedByStaffId: staffId,
          })
        } catch (e) {
          platformPricingError('router.createPeriod', 'failed', e, {
            gpuCardTypeId: input.gpuCardTypeId,
          })
          mapImportError(e)
        }
      }),

    updatePeriod: adminProcedure
      .input(platformPricePeriodUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await platformPricingDataAccess.updatePeriod({
            gpuCardTypeId: input.gpuCardTypeId,
            periodId: input.periodId,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo ?? null,
            changedByStaffId: staffId,
          })
        } catch (e) {
          platformPricingError('router.updatePeriod', 'failed', e, {
            gpuCardTypeId: input.gpuCardTypeId,
            periodId: input.periodId,
          })
          mapImportError(e)
        }
      }),

    createDatacenterSellPrice: supplyProcedure
      .input(datacenterSellPriceUpsertSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await platformPricingDataAccess.createDatacenterSellPrice({
            ...input,
            changedByStaffId: staffId,
          })
        } catch (e) {
          platformPricingError('router.createDatacenterSellPrice', 'failed', e, {
            dataCenterId: input.dataCenterId,
            gpuCardTypeId: input.gpuCardTypeId,
          })
          mapImportError(e)
        }
      }),

    updateDatacenterSellPrice: supplyProcedure
      .input(datacenterSellPriceUpdateSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await platformPricingDataAccess.updateDatacenterSellPrice({
            ...input,
            changedByStaffId: staffId,
          })
        } catch (e) {
          platformPricingError('router.updateDatacenterSellPrice', 'failed', e, {
            recordId: input.recordId,
          })
          mapImportError(e)
        }
      }),
  }),


  bareMetalOrder: createTRPCRouter({
    list: supplyProcedure.input(bareMetalOrderListSchema).query(async ({ input }) => {
      try {
        return await bareMetalOrderDataAccess.list(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

    getById: supplyProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const row = await bareMetalOrderDataAccess.getById(input.id)
          if (!row) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '裸金属订单不存在' })
          }
          return row
        } catch (e) {
          mapImportError(e)
        }
      }),

    sync: createTRPCRouter({
      listFailedItems: adminProcedure
        .input(bareMetalSyncFailedItemsListSchema)
        .query(async ({ input }) => bareMetalOrderSyncErrorsDataAccess.listFailedItems(input)),

      listJobRunOptions: adminProcedure.query(async () =>
        bareMetalOrderSyncErrorsDataAccess.listJobRunOptions(),
      ),

      getJobRun: adminProcedure
        .input(bareMetalSyncJobRunIdSchema)
        .query(async ({ input }) => {
          const run = await bareMetalOrderSyncErrorsDataAccess.getJobRun(input.jobRunId)
          if (!run) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '同步批次不存在' })
          }
          return run
        }),

      resolveFailedItem: adminProcedure
        .input(bareMetalSyncFailedItemIdSchema)
        .mutation(async ({ input, ctx }) => {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          if (!staffId) {
            throw new TRPCError({ code: 'FORBIDDEN', message: '未绑定员工账号' })
          }
          try {
            return await bareMetalOrderSyncErrorsDataAccess.resolveFailedItem({
              itemId: input.itemId,
              staffId,
            })
          } catch (e) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: e instanceof Error ? e.message : '标记失败',
            })
          }
        }),

      retryOrder: adminProcedure
        .input(bareMetalSyncFailedItemIdSchema)
        .mutation(async ({ input }) => {
          return bareMetalOrderSyncErrorsDataAccess.retryOrder({ itemId: input.itemId })
        }),
    }),
  }),


  dataCleanup: createTRPCRouter({
    getCapabilities: adminProcedure.query(() => {
      return supplierDataCleanupDataAccess.getCapabilities()
    }),

    preview: adminProcedure.input(supplierDataCleanupPreviewSchema).query(async ({ input }) => {
      try {
        return await supplierDataCleanupDataAccess.preview(input)
      } catch (e) {
        if (e instanceof Error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
        }
        mapImportError(e)
      }
    }),

    execute: adminProcedure
      .input(supplierDataCleanupExecuteSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await supplierDataCleanupDataAccess.execute(input, ctx.user.id)
        } catch (e) {
          if (e instanceof Error) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
          }
          mapImportError(e)
        }
      }),
  }),

  review: createTRPCRouter({
    list: adminProcedure.input(supplierReviewListSchema).query(async ({ input }) => {
      return supplierReviewDataAccess.list(input)
    }),

    getById: adminProcedure.input(supplierReviewIdSchema).query(async ({ input }) => {
      const detail = await supplierReviewDataAccess.getDetail(input.id)
      if (!detail) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '入驻申请不存在' })
      }
      return detail
    }),

    approve: adminProcedure.input(supplierReviewApproveSchema).mutation(async ({ input }) => {
      try {
        return await supplierReviewDataAccess.approve(input.id)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '审核通过失败',
        })
      }
    }),

    reject: adminProcedure.input(supplierReviewRejectSchema).mutation(async ({ input }) => {
      try {
        await supplierReviewDataAccess.reject(input.id, input.reason)
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : '驳回失败',
        })
      }
    }),
  }),

  deviceReview: deviceReviewRouter,

  deviceOnboarding: deviceOnboardingRouter,

  contract: createTRPCRouter({
    list: supplyProcedure.input(contractListSchema).query(async ({ input }) => {
      try {
        return await contractDataAccess.list(input)
      } catch (e) {
        mapImportError(e)
      }
    }),

    getById: supplyProcedure
      .input(z.object({ contractId: z.string().min(1) }))
      .query(async ({ input }) => {
        try {
          const detail = await contractDataAccess.getById(input.contractId)
          if (!detail) {
            throw new TRPCError({ code: 'NOT_FOUND', message: '合同不存在' })
          }
          return detail
        } catch (e) {
          mapImportError(e)
        }
      }),

    create: supplyProcedure.input(contractCreateSchema).mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await contractDataAccess.create({ ...input, createdByStaffId: staffId })
      } catch (e) {
        mapImportError(e)
      }
    }),

    update: supplyProcedure.input(contractUpdateSchema).mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await contractDataAccess.update({ ...input, updatedByStaffId: staffId })
      } catch (e) {
        mapImportError(e)
      }
    }),

    sendToSupplier: supplyProcedure
      .input(contractSendToSupplierSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
          return await contractDataAccess.sendToSupplier({
            ...input,
            sentByStaffId: staffId,
          })
        } catch (e) {
          mapImportError(e)
        }
      }),

    terminate: supplyProcedure.input(contractTerminateSchema).mutation(async ({ input, ctx }) => {
      try {
        const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
        return await contractDataAccess.terminate({
          ...input,
          terminatedByStaffId: staffId,
        })
      } catch (e) {
        mapImportError(e)
      }
    }),

    linkDevices: supplyProcedure
      .input(contractLinkDevicesSchema)
      .mutation(async ({ input }) => {
        try {
          return await contractDataAccess.linkDevices(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    upsertCapacityLines: supplyProcedure
      .input(capacityLineUpsertSchema)
      .mutation(async ({ input }) => {
        try {
          const [existing] = await db
            .select()
            .from(supplierContract)
            .where(eq(supplierContract.id, input.contractId))
            .limit(1)
          if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: '合同不存在' })
          if (!['draft', 'rejected'].includes(existing.status)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: '仅草稿或被拒绝的合同可编辑产能行' })
          }
          await db
            .delete(supplierContractCapacityLine)
            .where(eq(supplierContractCapacityLine.contractId, input.contractId))
          await db.insert(supplierContractCapacityLine).values(
            input.lines.map((line) => ({
              id: line.id ?? crypto.randomUUID(),
              contractId: input.contractId,
              dataCenterId: line.dataCenterId,
              gpuCardTypeId: line.gpuCardTypeId,
              cooperationType: line.cooperationType,
              deviceQuantity: line.deviceQuantity,
              gpuQuantity: line.gpuQuantity,
              gpuCountPerDevice: line.gpuCountPerDevice,
              startDate: line.startDate,
              endDate: line.endDate,
              lineStatus: line.lineStatus ?? 'active',
            })),
          )
          return { ok: true }
        } catch (e) {
          mapImportError(e)
        }
      }),

    listLinkedDevices: supplyProcedure
      .input(
        z.object({
          contractId: z.string().min(1),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await contractDataAccess.listLinkedDevices(input)
        } catch (e) {
          mapImportError(e)
        }
      }),

    listUnlinkedDevices: supplyProcedure
      .input(
        z.object({
          contractId: z.string().min(1),
          search: z.string().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await contractDataAccess.listUnlinkedDevices(input)
        } catch (e) {
          mapImportError(e)
        }
      }),
  }),

  gatewayNodeList: supplyProcedure
    .input(
      z.object({
        supplierId: z.string().optional(),
        auditStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return gatewayNodeOpsDataAccess.listAll(input)
    }),

  gatewayNodeReview: supplyProcedure
    .input(gatewayNodeReviewSchema)
    .mutation(async ({ input, ctx }) => {
      await gatewayNodeOpsDataAccess.reviewGatewayNode(
        input.id,
        ctx.user.id,
        input.auditStatus,
        input.auditRemark,
      )
      return { success: true }
    }),

  invoiceRequestList: supplyProcedure
    .input(
      z.object({
        supplierId: z.string().optional(),
        status: z
          .enum(['pending', 'approved', 'rejected', 'issued', 'completed', 'cancelled'])
          .optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return invoiceOpsDataAccess.listRequests(input)
    }),

  invoiceRequestReview: supplyProcedure
    .input(invoiceRequestReviewSchema)
    .mutation(async ({ input, ctx }) => {
      // 同 markBillPaid：`invoice_request.reviewed_by` 外键指向 user_staff.id，
      // 不能直接用 better-auth 的 ctx.user.id。
      const staffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
      await invoiceOpsDataAccess.reviewInvoiceRequest(
        input.id,
        staffId,
        input.action,
        input.rejectionReason,
      )
      return { success: true }
    }),

  invoiceIssue: supplyProcedure
    .input(invoiceIssueSchema)
    .mutation(async ({ input }) => {
      return invoiceOpsDataAccess.issueInvoice(input)
    }),

  /** 作废已开具的发票（W-22①）。不回写账单状态，见 dataaccess 注释。 */
  invoiceVoid: supplyProcedure
    .input(invoiceVoidSchema)
    .mutation(async ({ input, ctx }) => {
      const operatorStaffId = await staffDataAccess.resolveStaffIdForAuthUser(ctx.user)
      return invoiceOpsDataAccess.voidInvoice(input.id, input.reason, {
        operatorStaffId,
      })
    }),

  /** 平台侧供应商对账（W-25）：按账期列出各供应商应付/已付/已开票并重算一致性。 */
  reconciliationMonths: supplyProcedure.query(async () => {
    return supplierReconciliationDataAccess.listBillMonths()
  }),

  reconciliationReport: supplyProcedure
    .input(
      z.object({
        billMonth: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])$/, '账期格式须为 YYYY-MM'),
      }),
    )
    .query(async ({ input }) => {
      return supplierReconciliationDataAccess.report(input.billMonth)
    }),
})
