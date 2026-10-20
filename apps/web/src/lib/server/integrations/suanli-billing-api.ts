import { z } from 'zod'
import { crmError, crmLog, crmWarn } from '@/lib/server/dataaccess/crm/logger'
import {
  type ApiQueryTimes,
  toBillDetailQueryTimes,
  toDailyUsageBillQueryTimes,
  toMetalOrderQueryTimes,
  toMonthlyBillQueryTimes,
  toRechargeQueryTimes,
  toSlidingWindowQueryTimes,
  PLATFORM_DAILY_USAGE_TASK_TYPES,
} from '@/lib/crm/tenant-billing-import-utils'

import {
  hasPricingDimensions,
  mapDailyTaskSummaryRow,
  readNumber,
  readString,
  type PlatformDailyTaskSummaryRecord,
} from './billing-usage-dimensions'

export {
  hasPricingDimensions,
  mapDailyTaskSummaryRow,
  type PlatformDailyTaskSummaryRecord,
} from './billing-usage-dimensions'

import adminInstance from './request'
import {
  BILLING_API_DETAIL_DELAY_MS,
  BILLING_API_PAGE_DELAY_MS,
  delayBillingApi,
  throttleBillingApiRequest,
} from './suanli-billing-api-throttle'

const PAGE_SIZE = 100

async function throttledGet<T>(
  label: string,
  url: string,
  config?: { params?: Record<string, unknown> },
): Promise<T> {
  await throttleBillingApiRequest(label)
  return adminInstance.get<T>(url, config)
}

async function throttledPost<T>(
  label: string,
  url: string,
  data?: Record<string, unknown> | object,
): Promise<T> {
  await throttleBillingApiRequest(label)
  return adminInstance.post<T>(url, data)
}

export class SuanliBillingApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'SuanliBillingApiError'
  }
}

function parseApiError(e: unknown): never {
  if (e instanceof SuanliBillingApiError) throw e
  const err = e as { message?: string; code?: string }
  throw new SuanliBillingApiError(err.message ?? '连接算算力平台失败', err.code)
}

const paginatedSchema = z.object({
  /** 平台常返回 count: null，需兼容 */
  count: z.number().nullish(),
  results: z.array(z.record(z.string(), z.unknown())).optional(),
})

const billDetailAmountsSchema = z.record(
  z.string(),
  z.object({
    billing_value: z.number().optional(),
    discount_value: z.number().optional(),
  }),
)

const billDetailItemSchema = z.object({
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  amounts: billDetailAmountsSchema.optional(),
  total_amount: z
    .object({
      billing_value: z.number().optional(),
      discount_value: z.number().optional(),
    })
    .optional(),
})

function mapBillDetailItem(
  item: z.infer<typeof billDetailItemSchema>,
  fallbackPeriod: { start_time: string; end_time: string },
): PlatformBillDetailRecord | null {
  const start_time = String(item.start_time ?? fallbackPeriod.start_time)
  const end_time = String(item.end_time ?? fallbackPeriod.end_time)
  if (!start_time || !end_time) return null
  return {
    start_time,
    end_time,
    amounts: item.amounts ?? {},
    total_amount: item.total_amount,
  }
}

/**
 * 归一化 billing_record_detail_list 响应。
 * 兼容：{ results, count: null }、单条 { amounts, ... }、顶层数组。
 */
export function normalizeBillDetailRecords(
  data: unknown,
  fallbackPeriod: { start_time: string; end_time: string },
): PlatformBillDetailRecord[] {
  if (data == null) {
    throw new SuanliBillingApiError('账单明细返回格式异常')
  }

  if (Array.isArray(data)) {
    const records: PlatformBillDetailRecord[] = []
    for (const raw of data) {
      const parsed = billDetailItemSchema.safeParse(raw)
      if (!parsed.success) {
        throw new SuanliBillingApiError('账单明细返回格式异常')
      }
      const record = mapBillDetailItem(parsed.data, fallbackPeriod)
      if (record) records.push(record)
    }
    return records
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>

    if ('results' in obj) {
      const results = obj.results
      if (!Array.isArray(results)) {
        throw new SuanliBillingApiError('账单明细返回格式异常')
      }
      const records: PlatformBillDetailRecord[] = []
      for (const raw of results) {
        const parsed = billDetailItemSchema.safeParse(raw)
        if (!parsed.success) {
          throw new SuanliBillingApiError('账单明细返回格式异常')
        }
        const record = mapBillDetailItem(parsed.data, fallbackPeriod)
        if (record) records.push(record)
      }
      return records
    }

    if ('amounts' in obj) {
      const parsed = billDetailItemSchema.safeParse(obj)
      if (!parsed.success) {
        throw new SuanliBillingApiError('账单明细返回格式异常')
      }
      const record = mapBillDetailItem(parsed.data, fallbackPeriod)
      return record ? [record] : []
    }
  }

  throw new SuanliBillingApiError('账单明细返回格式异常')
}

const gpuModelSchema = z.object({
  gpu_model: z.string().optional(),
  gpu_count: z.number().optional(),
  order_details_id: z.number().optional(),
  order_detail_status: z.string().optional(),
  total_price: z.number().optional(),
  is_paid: z.boolean().optional(),
})

export type PlatformMetalOrderRecord = {
  order_id: number
  order_no: string
  status: string
  order_detail_status?: string
  tenant_id: number
  buy_count?: number
  device_count?: number
  total_price: number
  old_total_price?: number
  discount_price?: number
  cancel_total_price?: number
  create_time: string
  billing_type?: string
  idc_name?: string
  zone_name?: string
  zone_id?: string | number
  gpu_models?: Array<z.infer<typeof gpuModelSchema>>
  is_paid?: boolean
  create_channel?: string
  can_renew_or_free?: boolean
  can_delete_auto_renew?: boolean
}

const metalOrderDetailItemSchema = z
  .object({
    order_detail_id: z.coerce.number(),
    order_detail_status: z.string().nullish(),
    status: z.string().nullish(),
    total_price: z.coerce.number().nullish(),
    old_total_price: z.coerce.number().nullish(),
    discount_price: z.coerce.number().nullish(),
    actually_total_price: z.coerce.number().nullish(),
    cancel_actually_total_price: z.coerce.number().nullish(),
    cancel_discount_total_price: z.coerce.number().nullish(),
    is_paid: z.boolean().nullish(),
    start_time: z.string().nullish(),
    end_time: z.string().nullish(),
    gpu_model: z.string().nullish(),
    gpu_count: z.coerce.number().nullish(),
    device_id: z.coerce.number().nullish(),
    operating_system: z.string().nullish(),
    gpu_driver_version: z.string().nullish(),
    cuda_version: z.string().nullish(),
    memory_size: z.coerce.number().nullish(),
    cpu_model: z.string().nullish(),
    system_disk_size: z.coerce.number().nullish(),
  })
  .passthrough()

const metalOrderDetailsSchema = z
  .object({
    order_id: z.number().optional(),
    order_no: z.string().optional(),
    order_details: z.array(metalOrderDetailItemSchema).optional(),
  })
  .passthrough()

export type PlatformMetalOrderDetailItem = z.infer<typeof metalOrderDetailItemSchema>

export type PlatformMetalOrderDetailsRecord = z.infer<typeof metalOrderDetailsSchema>

export type PlatformMonthlyBillRecord = {
  start_time: string
  end_time: string
  total_billing_value: number
  total_discount_value: number
}

export type PlatformDailyUsageBillRecord = PlatformMonthlyBillRecord & {
  task_type: string
}

export type PlatformRechargeRecord = {
  id: number
  tenant_id: number
  order_id: string
  total_amount: number
  pay_channel?: string | null
  status: string
  create_time: string
  last_update_time?: string
  remark?: string | null
}

export type PlatformBillDetailAmounts = Record<
  string,
  { billing_value?: number; discount_value?: number }
>

export type PlatformBillDetailRecord = {
  start_time: string
  end_time: string
  amounts: PlatformBillDetailAmounts
  total_amount?: { billing_value?: number; discount_value?: number }
}

async function fetchAllPages<T>(
  label: string,
  traceId: string,
  fetchPage: (page: number) => Promise<{ count?: number; results: T[] }>,
): Promise<T[]> {
  const all: T[] = []
  let page = 1

  while (true) {
    crmLog('suanli-billing-api', `${label} page`, { traceId, page })
    let batch: { count?: number; results: T[] }
    try {
      batch = await fetchPage(page)
    } catch (e) {
      crmError('suanli-billing-api', `${label} page failed`, e, { traceId, page })
      parseApiError(e)
    }

    const results = batch.results ?? []
    all.push(...results)

    if (results.length < PAGE_SIZE) break
    if (batch.count != null && all.length >= batch.count) break
    page += 1
    if (page > 500) {
      crmWarn('suanli-billing-api', `${label} page limit`, { traceId, pages: page })
      break
    }
    await delayBillingApi(BILLING_API_PAGE_DELAY_MS, `${label}:page-${page}`)
  }

  crmLog('suanli-billing-api', `${label} done`, { traceId, total: all.length })
  return all
}

function mapMetalOrderListRow(row: Record<string, unknown>): PlatformMetalOrderRecord {
  const gpu = z.array(gpuModelSchema).optional().parse(row.gpu_models)
  return {
    order_id: Number(row.order_id),
    order_no: String(row.order_no ?? ''),
    status: String(row.status ?? ''),
    order_detail_status:
      row.order_detail_status != null ? String(row.order_detail_status) : undefined,
    tenant_id: Number(row.tenant_id),
    buy_count: row.buy_count != null ? Number(row.buy_count) : undefined,
    device_count: row.device_count != null ? Number(row.device_count) : undefined,
    total_price: Number(row.total_price ?? 0),
    old_total_price:
      row.old_total_price != null ? Number(row.old_total_price) : undefined,
    discount_price:
      row.discount_price != null ? Number(row.discount_price) : undefined,
    cancel_total_price:
      row.cancel_total_price != null ? Number(row.cancel_total_price) : undefined,
    create_time: String(row.create_time ?? ''),
    billing_type: row.billing_type != null ? String(row.billing_type) : undefined,
    idc_name: row.idc_name != null ? String(row.idc_name) : undefined,
    zone_name: row.zone_name != null ? String(row.zone_name) : undefined,
    zone_id: row.zone_id != null ? (typeof row.zone_id === 'number' ? row.zone_id : String(row.zone_id)) : undefined,
    gpu_models: gpu,
    is_paid: row.is_paid === true,
    create_channel: row.create_channel != null ? String(row.create_channel) : undefined,
    can_renew_or_free: row.can_renew_or_free === true ? true : row.can_renew_or_free === false ? false : undefined,
    can_delete_auto_renew:
      row.can_delete_auto_renew === true
        ? true
        : row.can_delete_auto_renew === false
          ? false
          : undefined,
  }
}

export async function fetchPlatformMetalOrders(input: {
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
}): Promise<PlatformMetalOrderRecord[]> {
  const { start_time, end_time } = toMetalOrderQueryTimes(input.startDate, input.endDate)
  const tenantTid = Number(input.platformTenantId)

  const rows = await fetchAllPages<PlatformMetalOrderRecord>(
    'metal_orders',
    input.traceId,
    async (page) => {
      const data = await throttledPost<unknown>('metal_orders', '/admin/metal_order/list', {
        page,
        page_size: PAGE_SIZE,
        conditional: {
          tenant_tid: tenantTid,
          condition: '',
          idc_ids: '',
          status: '',
          is_paid: true,
          start_time,
          end_time,
        },
      })
      const parsed = paginatedSchema.safeParse(data)
      if (!parsed.success) {
        throw new SuanliBillingApiError('裸金属订单返回格式异常')
      }
      const results = (parsed.data.results ?? []).map((row) => mapMetalOrderListRow(row))
      return { count: parsed.data.count ?? undefined, results }
    },
  )

  return rows.filter((r) => r.order_no)
}

/** 全平台裸金属订单列表（不按租户过滤；按 create_time 精确时间窗口过滤） */
export async function fetchPlatformMetalOrdersGlobal(input: {
  traceId: string
  startAt: Date
  endAt: Date
}): Promise<PlatformMetalOrderRecord[]> {
  const { start_time, end_time } = toSlidingWindowQueryTimes(input.startAt, input.endAt)
  const rows = await fetchAllPages<PlatformMetalOrderRecord>(
    'metal_orders_global',
    input.traceId,
    async (page) => {
      const data = await throttledPost<unknown>('metal_orders_global', '/admin/metal_order/list', {
        page,
        page_size: PAGE_SIZE,
        conditional: {
          condition: '',
          idc_ids: '',
          status: '',
          is_paid: true,
          start_time,
          end_time,
        },
      })
      const parsed = paginatedSchema.safeParse(data)
      if (!parsed.success) {
        throw new SuanliBillingApiError('裸金属订单全量列表返回格式异常')
      }
      const results = (parsed.data.results ?? []).map((row) => mapMetalOrderListRow(row))
      return { count: parsed.data.count ?? undefined, results }
    },
  )

  return rows.filter((r) => r.order_no && Number.isFinite(r.tenant_id))
}

export async function fetchPlatformMetalOrderDetails(input: {
  orderId: number
  traceId?: string
}): Promise<PlatformMetalOrderDetailsRecord> {
  await delayBillingApi(BILLING_API_DETAIL_DELAY_MS, `metal_order_details:${input.orderId}`)
  try {
    const data = await throttledPost<unknown>('metal_order_details', '/admin/metal_order/details', {
      order_id: input.orderId,
    })
    const parsed = metalOrderDetailsSchema.safeParse(data)
    if (!parsed.success) {
      throw new SuanliBillingApiError('裸金属订单详情返回格式异常')
    }
    crmLog('suanli-billing-api', 'metal_order_details ok', {
      traceId: input.traceId,
      orderId: input.orderId,
      detailCount: parsed.data.order_details?.length ?? 0,
    })
    return parsed.data
  } catch (e) {
    crmWarn('suanli-billing-api', 'metal_order_details failed', {
      traceId: input.traceId,
      orderId: input.orderId,
      error: e instanceof Error ? e.message : String(e),
    })
    parseApiError(e)
  }
}

const metalOrderDeviceSchema = z
  .object({
    order_details_id: z.coerce.number().nullish(),
    start_time: z.string().nullish(),
    end_time: z.string().nullish(),
    estimated_time: z.string().nullish(),
    pub_ip: z.string().nullish(),
    inner_ip: z.string().nullish(),
    gpu_count: z.coerce.number().nullish(),
    gpu_model: z.string().nullish(),
    billing_type: z.string().nullish(),
  })
  .passthrough()

export type PlatformMetalOrderDeviceRecord = z.infer<typeof metalOrderDeviceSchema>

export async function fetchPlatformMetalOrderDevice(input: {
  orderDetailId: number
  traceId?: string
}): Promise<PlatformMetalOrderDeviceRecord> {
  await delayBillingApi(BILLING_API_DETAIL_DELAY_MS, `metal_order_device:${input.orderDetailId}`)
  try {
    const data = await throttledPost<unknown>('metal_order_device', '/admin/metal_order/device', {
      order_detail_id: input.orderDetailId,
    })
    const parsed = metalOrderDeviceSchema.safeParse(data)
    if (!parsed.success) {
      crmWarn('suanli-billing-api', 'metal_order_device parse failed', {
        traceId: input.traceId,
        orderDetailId: input.orderDetailId,
        issues: parsed.error.issues.slice(0, 5),
      })
      throw new SuanliBillingApiError('裸金属订单设备返回格式异常')
    }
    crmLog('suanli-billing-api', 'metal_order_device ok', {
      traceId: input.traceId,
      orderDetailId: input.orderDetailId,
      orderDetailsId: parsed.data.order_details_id,
    })
    return parsed.data
  } catch (e) {
    crmWarn('suanli-billing-api', 'metal_order_device failed', {
      traceId: input.traceId,
      orderDetailId: input.orderDetailId,
      error: e instanceof Error ? e.message : String(e),
    })
    parseApiError(e)
  }
}

export async function fetchPlatformMonthlyBills(input: {
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<PlatformMonthlyBillRecord[]> {
  return fetchPlatformBillingRecords({
    ...input,
    range: 'month',
    label: 'monthly_bills',
    toQueryTimes: toMonthlyBillQueryTimes,
  })
}

export async function fetchPlatformDailyBillingRecords(input: {
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<PlatformMonthlyBillRecord[]> {
  return fetchPlatformBillingRecords({
    ...input,
    range: 'day',
    label: 'daily_bills',
    toQueryTimes: toDailyUsageBillQueryTimes,
  })
}

async function fetchPlatformBillingRecords(input: {
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
  range: 'month' | 'day'
  label: string
  queryTimes?: ApiQueryTimes
  toQueryTimes: (startDate?: string, endDate?: string) => ApiQueryTimes
}): Promise<PlatformMonthlyBillRecord[]> {
  const { start_time, end_time } =
    input.queryTimes ?? input.toQueryTimes(input.startDate, input.endDate)
  const params: Record<string, string | number> = {
    tenant_tid: input.platformTenantId,
    range: input.range,
    start_time,
    end_time,
    page: 1,
    page_size: PAGE_SIZE,
  }

  return fetchAllPages<PlatformMonthlyBillRecord>(
    input.label,
    input.traceId,
    async (page) => {
      const data = await throttledGet<unknown>(
        input.label,
        '/admin/tenant/billing_record_list',
        {
          params: { ...params, page },
        },
      )
      const parsed = paginatedSchema.safeParse(data)
      if (!parsed.success) {
        throw new SuanliBillingApiError(
          input.range === 'day' ? '日账单返回格式异常' : '月度账单返回格式异常',
        )
      }
      const results = (parsed.data.results ?? []).map((row) => ({
        start_time: String(row.start_time ?? ''),
        end_time: String(row.end_time ?? ''),
        total_billing_value: Number(row.total_billing_value ?? 0),
        total_discount_value: Number(row.total_discount_value ?? 0),
      }))
      return { count: parsed.data.count ?? undefined, results }
    },
  )
}

export async function fetchPlatformDailyUsageBills(input: {
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<PlatformDailyUsageBillRecord[]> {
  const { start_time, end_time } =
    input.queryTimes ?? toDailyUsageBillQueryTimes(input.startDate, input.endDate)
  const all: PlatformDailyUsageBillRecord[] = []

  for (let i = 0; i < PLATFORM_DAILY_USAGE_TASK_TYPES.length; i++) {
    const taskType = PLATFORM_DAILY_USAGE_TASK_TYPES[i]!
    if (i > 0) {
      await delayBillingApi(BILLING_API_PAGE_DELAY_MS, `daily_usage:${taskType}`)
    }

    const params: Record<string, string | number> = {
      tenant_tid: input.platformTenantId,
      range: 'day',
      task_type: taskType,
      start_time,
      end_time,
      page: 1,
      page_size: PAGE_SIZE,
    }

    const rows = await fetchAllPages<Omit<PlatformDailyUsageBillRecord, 'task_type'>>(
      `daily_usage:${taskType}`,
      input.traceId,
      async (page) => {
        const data = await throttledGet<unknown>(
          `daily_usage:${taskType}`,
          '/admin/tenant/billing_pod_record_list',
          { params: { ...params, page } },
        )
        const parsed = paginatedSchema.safeParse(data)
        if (!parsed.success) {
          throw new SuanliBillingApiError(`每日用量账单（${taskType}）返回格式异常`)
        }
        const results = (parsed.data.results ?? []).map((row) => ({
          start_time: String(row.start_time ?? ''),
          end_time: String(row.end_time ?? ''),
          total_billing_value: Number(row.total_billing_value ?? 0),
          total_discount_value: Number(row.total_discount_value ?? 0),
        }))
        return { count: parsed.data.count ?? undefined, results }
      },
    )

    for (const row of rows) {
      if (!row.start_time || !row.end_time) continue
      all.push({ ...row, task_type: taskType })
    }
  }

  return all
}

/** 单日 × 任务类型下的任务消费明细（billing_pod_record_task_summary_list） */
export async function fetchPlatformDailyTaskSummaries(input: {
  platformTenantId: string
  taskType: string
  startTime: string
  endTime: string
  traceId: string
}): Promise<PlatformDailyTaskSummaryRecord[]> {
  if (!input.startTime?.trim() || !input.endTime?.trim()) return []

  const params: Record<string, string | number> = {
    tenant_tid: input.platformTenantId,
    range: 'day',
    task_type: input.taskType,
    start_time: input.startTime,
    end_time: input.endTime,
    page: 1,
    page_size: PAGE_SIZE,
  }

  return fetchAllPages<PlatformDailyTaskSummaryRecord>(
    `daily_task_summary:${input.taskType}`,
    input.traceId,
    async (page) => {
      const data = await throttledGet<unknown>(
        `daily_task_summary:${input.taskType}`,
        '/admin/tenant/billing_pod_record_task_summary_list',
        { params: { ...params, page } },
      )
      const parsed = paginatedSchema.safeParse(data)
      if (!parsed.success) {
        throw new SuanliBillingApiError(
          `每日任务消费明细（${input.taskType}）返回格式异常`,
        )
      }
      const results = (parsed.data.results ?? []).map((row) =>
        mapDailyTaskSummaryRow(row, input.taskType),
      )
      return { count: parsed.data.count ?? undefined, results }
    },
  )
}

export async function fetchPlatformRecharges(input: {
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<PlatformRechargeRecord[]> {
  const { start_time, end_time } =
    input.queryTimes ?? toRechargeQueryTimes(input.startDate, input.endDate)

  return fetchAllPages<PlatformRechargeRecord>(
    'recharges',
    input.traceId,
    async (page) => {
      const data = await throttledGet<unknown>('recharges', '/admin/tenant/coin_order_list', {
        params: {
          tenant_ids: input.platformTenantId,
          status: 'Completed',
          types: '',
          start_time,
          end_time,
          page,
          page_size: PAGE_SIZE,
          order_type: 'Recharge',
        },
      })
      const parsed = paginatedSchema.safeParse(data)
      if (!parsed.success) {
        throw new SuanliBillingApiError('充值列表返回格式异常')
      }
      const results = (parsed.data.results ?? []).map((row) => ({
        id: Number(row.id),
        tenant_id: Number(row.tenant_id),
        order_id: String(row.order_id ?? ''),
        total_amount: Number(row.total_amount ?? 0),
        pay_channel: row.pay_channel != null ? String(row.pay_channel) : null,
        status: String(row.status ?? ''),
        create_time: String(row.create_time ?? ''),
        last_update_time:
          row.last_update_time != null ? String(row.last_update_time) : undefined,
        remark: row.remark != null ? String(row.remark) : null,
      }))
      return { count: parsed.data.count ?? undefined, results }
    },
  )
}

export type PlatformDiscountRelationRecord = {
  id: number
  template_id: number
  correlation_id?: string
  count: number
  surplus_count: number
  status: string
  remark?: string | null
  template_title: string
  validity_day?: number | null
  end_date: string
  create_time: string
  last_update_time?: string | null
  admin_id?: number | null
  admin_phone?: string | null
  admin_nickname?: string | null
  tenant_name?: string | null
  merchant_id?: number | null
  template_status?: string | null
  template_validity_day?: number | null
}

export type PlatformDiscountTemplateRecord = {
  id: number
  title: string
  support_products?: string | null
  total?: number | null
  count: number
  rule?: string | null
  status: string
  validity_day?: number | null
  start_date?: string | null
  end_date?: string | null
  create_time?: string | null
  last_update_time?: string | null
  remark?: string | null
  mark?: string | null
}

function mapDiscountRelationRow(row: Record<string, unknown>): PlatformDiscountRelationRecord {
  return {
    id: Number(row.id),
    template_id: Number(row.template_id),
    correlation_id: row.correlation_id != null ? String(row.correlation_id) : undefined,
    count: Number(row.count ?? 0),
    surplus_count: Number(row.surplus_count ?? 0),
    status: String(row.status ?? ''),
    remark: row.remark != null ? String(row.remark) : null,
    template_title: String(row.template_title ?? ''),
    validity_day: row.validity_day != null ? Number(row.validity_day) : null,
    end_date: String(row.end_date ?? ''),
    create_time: String(row.create_time ?? ''),
    last_update_time: row.last_update_time != null ? String(row.last_update_time) : null,
    admin_id: row.admin_id != null ? Number(row.admin_id) : null,
    admin_phone: row.admin_phone != null ? String(row.admin_phone) : null,
    admin_nickname: row.admin_nickname != null ? String(row.admin_nickname) : null,
    tenant_name: row.tenant_name != null ? String(row.tenant_name) : null,
    merchant_id: row.merchant_id != null ? Number(row.merchant_id) : null,
    template_status: row.template_status != null ? String(row.template_status) : null,
    template_validity_day:
      row.template_validity_day != null ? Number(row.template_validity_day) : null,
  }
}

function mapDiscountTemplateRow(row: Record<string, unknown>): PlatformDiscountTemplateRecord {
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    support_products: row.support_products != null ? String(row.support_products) : null,
    total: row.total != null ? Number(row.total) : null,
    count: Number(row.count ?? 0),
    rule: row.rule != null ? String(row.rule) : null,
    status: String(row.status ?? ''),
    validity_day: row.validity_day != null ? Number(row.validity_day) : null,
    start_date: row.start_date != null ? String(row.start_date) : null,
    end_date: row.end_date != null ? String(row.end_date) : null,
    create_time: row.create_time != null ? String(row.create_time) : null,
    last_update_time: row.last_update_time != null ? String(row.last_update_time) : null,
    remark: row.remark != null ? String(row.remark) : null,
    mark: row.mark != null ? String(row.mark) : null,
  }
}

/** 租户算力券发放记录（discount_relation_list） */
export async function fetchPlatformDiscountRelations(input: {
  platformTenantId: string
  startDate?: string
  endDate?: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<PlatformDiscountRelationRecord[]> {
  const { start_time, end_time } =
    input.queryTimes ?? toRechargeQueryTimes(input.startDate, input.endDate)

  return fetchAllPages<PlatformDiscountRelationRecord>(
    'discount_relations',
    input.traceId,
    async (page) => {
      const data = await throttledGet<unknown>(
        'discount_relations',
        '/admin/tenant/discount_relation_list',
        {
          params: {
            tenant_ids: input.platformTenantId,
            template_ids: '',
            start_time,
            end_time,
            page,
            page_size: PAGE_SIZE,
          },
        },
      )
      const parsed = paginatedSchema.safeParse(data)
      if (!parsed.success) {
        throw new SuanliBillingApiError('算力券列表返回格式异常')
      }
      const results = (parsed.data.results ?? [])
        .map(mapDiscountRelationRow)
        .filter((r) => Number.isFinite(r.id) && r.id > 0)
      return { count: parsed.data.count ?? undefined, results }
    },
  )
}

/** 算力券模板全量列表（discount_template/list） */
export async function fetchPlatformDiscountTemplates(input: {
  traceId: string
  status?: string
}): Promise<PlatformDiscountTemplateRecord[]> {
  return fetchAllPages<PlatformDiscountTemplateRecord>(
    'discount_templates',
    input.traceId,
    async (page) => {
      const data = await throttledGet<unknown>(
        'discount_templates',
        '/admin/discount_template/list',
        {
          params: {
            status: input.status ?? '',
            start_time: '',
            end_time: '',
            page,
            page_size: PAGE_SIZE,
          },
        },
      )
      const parsed = paginatedSchema.safeParse(data)
      if (!parsed.success) {
        throw new SuanliBillingApiError('算力券模板列表返回格式异常')
      }
      const results = (parsed.data.results ?? [])
        .map(mapDiscountTemplateRow)
        .filter((r) => Number.isFinite(r.id) && r.id > 0)
      return { count: parsed.data.count ?? undefined, results }
    },
  )
}

export async function fetchPlatformBillDetailsForOverview(input: {
  platformTenantId: string
  overviewRows: PlatformMonthlyBillRecord[]
  traceId: string
  range?: 'month' | 'day'
}): Promise<PlatformBillDetailRecord[]> {
  const range = input.range ?? 'month'
  const details: PlatformBillDetailRecord[] = []

  for (let i = 0; i < input.overviewRows.length; i++) {
    const row = input.overviewRows[i]!
    if (!row.start_time || !row.end_time) continue

    if (i > 0) {
      await delayBillingApi(BILLING_API_DETAIL_DELAY_MS, `bill_detail:${range}:interval`)
    }

    crmLog('suanli-billing-api', 'bill_detail', {
      traceId: input.traceId,
      range,
      index: i + 1,
      total: input.overviewRows.length,
      start: row.start_time,
      end: row.end_time,
    })
    const { start_time, end_time } = toBillDetailQueryTimes(row.start_time, row.end_time)

    try {
      const data = await throttledGet<unknown>(
        `bill_detail:${range}`,
        '/admin/tenant/billing_record_detail_list',
        {
          params: {
            tenant_tid: input.platformTenantId,
            start_time,
            end_time,
            range,
          },
        },
      )
      const period = { start_time: row.start_time, end_time: row.end_time }
      const batch = normalizeBillDetailRecords(data, period)
      details.push(...batch)
    } catch (e) {
      crmError('suanli-billing-api', 'bill_detail fetch failed', e, {
        traceId: input.traceId,
        range,
        start: row.start_time,
      })
      parseApiError(e)
    }
  }

  return details
}
