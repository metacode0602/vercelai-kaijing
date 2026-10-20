import {
  computeSlidingSyncWindow,
  formatCstDate,
  validateBillingDateRange,
} from '@/lib/crm/tenant-billing-import-utils'
import { db } from '@/lib/db'
import { crmLog } from '@/lib/server/dataaccess/crm/logger'
import { projectsDataAccess } from '@/lib/server/dataaccess/crm/projects'
import { fetchPlatformMetalOrders } from '@/lib/server/integrations/suanli-billing-api'
import { getBareMetalOrderSyncWindowDays } from '@/lib/server/dataaccess/supplier/bare-metal-order-sync-config'
import { upsertPlatformBareMetalOrder } from '@/lib/server/dataaccess/supplier/bare-metal-order-sync'
import { billingTenant } from '@workspace/db/schema'
import { inArray } from 'drizzle-orm'

export type ProjectBareMetalOrderSyncItemResult = {
  platformTenantId: string
  tenantName: string
  success: boolean
  ordersFetchedCount: number
  orderUpsertedCount: number
  failedCount: number
  error?: string
}

export type ProjectBareMetalOrderSyncResult = {
  items: ProjectBareMetalOrderSyncItemResult[]
  ordersFetchedCount: number
  orderUpsertedCount: number
  successCount: number
  failedCount: number
  startDate: string
  endDate: string
}

function resolveSyncDateRange(input: {
  mode?: 'incremental' | 'backfill'
  startDate?: string
  endDate?: string
}): { startDate: string; endDate: string } {
  const mode = input.mode ?? 'incremental'

  if (mode === 'backfill') {
    const startDate = input.startDate?.trim()
    const endDate = input.endDate?.trim()
    if (!startDate || !endDate) {
      throw new Error('补同步须填写开始日期与结束日期')
    }
    validateBillingDateRange(startDate, endDate)
    const todayCst = formatCstDate(new Date())
    if (endDate > todayCst) {
      throw new Error('结束日期不能晚于东八区今天')
    }
    return { startDate, endDate }
  }

  const windowDays = getBareMetalOrderSyncWindowDays()
  const window = computeSlidingSyncWindow({ windowDays })
  if (window.skipped) {
    throw new Error('滑动窗口配置无效')
  }
  return { startDate: window.startDate, endDate: window.endDate }
}

export async function syncBareMetalOrdersForProject(input: {
  projectId: string
  mode?: 'incremental' | 'backfill'
  startDate?: string
  endDate?: string
}): Promise<ProjectBareMetalOrderSyncResult> {
  const traceId = crypto.randomUUID().slice(0, 8)
  const { startDate, endDate } = resolveSyncDateRange(input)

  const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(input.projectId)
  if (tenantIds.length === 0) {
    throw new Error('未找到关联计费租户')
  }

  const tenantRows = await db
    .select({
      id: billingTenant.id,
      name: billingTenant.name,
      platformTenantId: billingTenant.platformTenantId,
      customerId: billingTenant.customerId,
    })
    .from(billingTenant)
    .where(inArray(billingTenant.id, tenantIds))

  const tenantById = new Map(tenantRows.map((row) => [row.id, row]))
  const items: ProjectBareMetalOrderSyncItemResult[] = []

  crmLog('bare-metal-project-sync', 'start', {
    traceId,
    projectId: input.projectId,
    mode: input.mode ?? 'incremental',
    startDate,
    endDate,
    tenantCount: tenantIds.length,
  })

  for (const tenantId of tenantIds) {
    const tenant = tenantById.get(tenantId)
    if (!tenant) continue

    if (!tenant.platformTenantId?.trim()) {
      items.push({
        platformTenantId: '',
        tenantName: tenant.name,
        success: false,
        ordersFetchedCount: 0,
        orderUpsertedCount: 0,
        failedCount: 0,
        error: '未关联平台租户 ID',
      })
      continue
    }

    let ordersFetchedCount = 0
    let orderUpsertedCount = 0
    let failedCount = 0
    const errorParts: string[] = []

    try {
      const orders = await fetchPlatformMetalOrders({
        platformTenantId: tenant.platformTenantId,
        startDate,
        endDate,
        traceId,
      })
      ordersFetchedCount = orders.length

      for (const record of orders) {
        try {
          await upsertPlatformBareMetalOrder({
            record,
            tenant: {
              tenantId: tenant.id,
              platformTenantId: tenant.platformTenantId,
              customerId: tenant.customerId,
            },
            traceId,
            projectId: input.projectId,
          })
          orderUpsertedCount++
        } catch (e) {
          failedCount++
          const msg = e instanceof Error ? e.message : 'upsert 失败'
          errorParts.push(`订单 ${record.order_no}: ${msg}`)
        }
      }

      items.push({
        platformTenantId: tenant.platformTenantId,
        tenantName: tenant.name,
        success: failedCount === 0,
        ordersFetchedCount,
        orderUpsertedCount,
        failedCount,
        error: errorParts.length > 0 ? errorParts.slice(0, 5).join('；') : undefined,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '拉取订单失败'
      items.push({
        platformTenantId: tenant.platformTenantId,
        tenantName: tenant.name,
        success: false,
        ordersFetchedCount,
        orderUpsertedCount,
        failedCount,
        error: msg,
      })
    }
  }

  const result: ProjectBareMetalOrderSyncResult = {
    items,
    ordersFetchedCount: items.reduce((sum, item) => sum + item.ordersFetchedCount, 0),
    orderUpsertedCount: items.reduce((sum, item) => sum + item.orderUpsertedCount, 0),
    successCount: items.filter((item) => item.success).length,
    failedCount: items.filter((item) => !item.success).length,
    startDate,
    endDate,
  }

  crmLog('bare-metal-project-sync', 'done', {
    traceId,
    projectId: input.projectId,
    ...result,
  })

  return result
}
