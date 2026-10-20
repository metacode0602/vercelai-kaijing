/**
 * 设备审核 dataaccess
 * Phase 2 - 运营审核设备清单
 */

import { db } from '@/lib/db'
import {
  supplierDevice,
  onboardingBatch,
  gpuCardType,
  dataCenter,
  supplierContractCapacityLine,
} from '@workspace/db/schema'
import { and, eq, inArray, sql, count } from 'drizzle-orm'

export interface PendingDeviceFilters {
  batchId?: string
  reviewStatus?: 'pending' | 'approved' | 'rejected'
  page?: number
  pageSize?: number
}

export const deviceReviewDataAccess = {
  /**
   * 获取待审核/已审核设备列表
   */
  async getPendingDevices(filters: PendingDeviceFilters) {
    const page = Math.max(1, filters.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const conditions: any[] = []
    if (filters.batchId) {
      conditions.push(eq(supplierDevice.onboardingBatchId, filters.batchId))
    }
    if (filters.reviewStatus) {
      conditions.push(eq(supplierDevice.reviewStatus, filters.reviewStatus))
    }

    const where = conditions.length ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(supplierDevice)
      .where(where)

    const total = Number(totalRow?.total ?? 0)

    const rows = await db
      .select({
        device: supplierDevice,
        gpuCardTypeName: gpuCardType.name,
        dataCenterName: dataCenter.name,
      })
      .from(supplierDevice)
      .leftJoin(gpuCardType, eq(supplierDevice.gpuCardTypeId, gpuCardType.id))
      .leftJoin(dataCenter, eq(supplierDevice.dataCenterId, dataCenter.id))
      .where(where)
      .orderBy(sql`${supplierDevice.createdAt} DESC`)
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map((r) => ({
        ...r.device,
        gpuCardTypeName: r.gpuCardTypeName ?? 'Unknown',
        dataCenterName: r.dataCenterName ?? 'Unknown',
      })),
      total,
      page,
      pageSize,
    }
  },

  /**
   * 批量审核设备
   */
  async batchReview(input: {
    deviceIds: string[]
    action: 'approve' | 'reject'
    remark?: string
    staffId: string
  }) {
    const { deviceIds, action, remark, staffId } = input

    if (deviceIds.length === 0) {
      throw new Error('设备ID列表不能为空')
    }

    const reviewStatus = action === 'approve' ? 'approved' : 'rejected'

    await db
      .update(supplierDevice)
      .set({
        reviewStatus,
        reviewRemark: remark,
        reviewedBy: staffId,
        reviewedAt: new Date(),
      })
      .where(inArray(supplierDevice.id, deviceIds))

    return { ok: true, affected: deviceIds.length }
  },

  /**
   * 自动校验设备
   * 规则:
   * 1. SN全局唯一性
   * 2. GPU卡型存在性
   * 3. 规格与合同产能匹配
   * 4. IP格式校验
   */
  async validateDevice(device: {
    id?: string
    sn: string
    gpuCardTypeId: string
    onboardingBatchId?: string
    internalIp?: string | null
    externalIp?: string | null
  }): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    // 1. SN全局唯一性
    const conditions = [eq(supplierDevice.sn, device.sn)]
    if (device.id) {
      conditions.push(sql`${supplierDevice.id} != ${device.id}`)
    }
    const existingSn = await db
      .select()
      .from(supplierDevice)
      .where(and(...conditions))
      .limit(1)

    if (existingSn.length > 0) {
      errors.push(`设备 SN ${device.sn} 已存在`)
    }

    // 2. GPU卡型存在性
    const [cardType] = await db
      .select()
      .from(gpuCardType)
      .where(eq(gpuCardType.id, device.gpuCardTypeId))
      .limit(1)

    if (!cardType) {
      errors.push(`GPU 卡型 ${device.gpuCardTypeId} 不存在`)
    }

    // 3. 规格与合同产能匹配
    if (device.onboardingBatchId) {
      const [batch] = await db
        .select()
        .from(onboardingBatch)
        .where(eq(onboardingBatch.id, device.onboardingBatchId))
        .limit(1)

      if (batch?.contractId) {
        const [capacityLine] = await db
          .select()
          .from(supplierContractCapacityLine)
          .where(
            and(
              eq(supplierContractCapacityLine.contractId, batch.contractId),
              eq(supplierContractCapacityLine.gpuCardTypeId, device.gpuCardTypeId),
            ),
          )
          .limit(1)

        if (!capacityLine) {
          errors.push(`设备卡型 ${device.gpuCardTypeId} 不在合同产能范围内`)
        }
      }
    }

    // 4. IP格式校验
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (device.internalIp && !ipv4Regex.test(device.internalIp)) {
      errors.push(`内网 IP ${device.internalIp} 格式错误`)
    }
    if (device.externalIp && !ipv4Regex.test(device.externalIp)) {
      errors.push(`外网 IP ${device.externalIp} 格式错误`)
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },

  /**
   * 获取批次审核统计
   */
  async getBatchReviewStats(batchId: string) {
    const stats = await db
      .select({
        reviewStatus: supplierDevice.reviewStatus,
        total: count(),
      })
      .from(supplierDevice)
      .where(eq(supplierDevice.onboardingBatchId, batchId))
      .groupBy(supplierDevice.reviewStatus)

    const result = {
      pending: 0,
      approved: 0,
      rejected: 0,
    }

    for (const stat of stats) {
      const status = stat.reviewStatus as 'pending' | 'approved' | 'rejected'
      result[status] = Number(stat.total)
    }

    return result
  },
}
