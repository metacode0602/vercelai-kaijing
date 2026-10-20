import 'server-only'

import { db } from '@/lib/db'
import {
  buildSlaFieldIdToNameMap,
  mapSlaBitableRecordsToImportRows,
  validateSlaFieldMapping,
} from '@/lib/server/integrations/feishu/sla-bitable-field-mapper'
import {
  listFeishuBitableFields,
  type FeishuBitableRecord,
} from '@/lib/server/integrations/feishu/bitable-client'
import { loadFeishuRuntimeConfig } from '@/lib/server/integrations/feishu/config'
import { matchGpuCardType } from '@/lib/supplier-quotes/match-gpu-card-type'
import { matchSupplierName } from '@/lib/supplier-quotes/match-supplier'
import type {
  SlaBitableImportCommitResult,
  SlaBitablePreviewResult,
  SlaBitablePreviewRow,
  SlaBitableSyncConfigDto,
  SlaBitableSyncKind,
} from '@/lib/types/sla-bitable-import'
import {
  dataCenter,
  gpuCardType,
  offlineBareMetalOrder,
  slaImportBatch,
  slaPlatformInternalUsage,
  slaPlatformOfflineBaremetalIncident,
  slaPlatformOnlineIncident,
  supplier,
  supplierContract,
  supplierContractCapacityLine,
} from '@workspace/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

type MasterDataContext = {
  dataCenters: Array<{ id: string; code: string; name: string }>
  gpuCardTypes: Array<{ id: string; code: string; name: string }>
  suppliers: Array<{ id: string; code: string; name: string; shortName: string }>
}

function normKey(s: string): string {
  return s.replace(/^\ufeff/, '').trim().replace(/\s+/g, '').toLowerCase()
}

/** 宽容解析日期时间：ISO、斜杠/横杠、中文年月日 */
export function parseFlexibleDateTime(raw?: string | null): Date | null {
  if (!raw?.trim()) return null
  const s = raw.trim()

  const isoMs = Date.parse(s)
  if (!Number.isNaN(isoMs)) return new Date(isoMs)

  const cn = /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(s)
  if (cn) {
    const y = Number(cn[1])
    const m = Number(cn[2]) - 1
    const d = Number(cn[3])
    const hh = cn[4] != null ? Number(cn[4]) : 0
    const mm = cn[5] != null ? Number(cn[5]) : 0
    const ss = cn[6] != null ? Number(cn[6]) : 0
    const dt = new Date(y, m, d, hh, mm, ss)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  const slash = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(s)
  if (slash) {
    const y = Number(slash[1])
    const m = Number(slash[2]) - 1
    const d = Number(slash[3])
    const hh = slash[4] != null ? Number(slash[4]) : 0
    const mm = slash[5] != null ? Number(slash[5]) : 0
    const ss = slash[6] != null ? Number(slash[6]) : 0
    const dt = new Date(y, m, d, hh, mm, ss)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  return null
}

export function parseFlexibleDate(raw?: string | null): string | null {
  const dt = parseFlexibleDateTime(raw)
  if (!dt) return null
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseIntegerCell(raw?: string | null): number | null {
  if (raw == null || !raw.trim()) return null
  const n = Number.parseInt(raw.replace(/,/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function parseMoneyCell(raw?: string | null): string | null {
  if (raw == null || !raw.trim()) return null
  const cleaned = raw.replace(/[,，￥¥\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n.toFixed(4) : null
}

function parseBooleanCell(raw?: string | null): boolean {
  if (!raw?.trim()) return false
  const s = normKey(raw)
  return ['是', 'yes', 'true', '1', 'y', '有', '已赔付', '免责'].some((v) => s === normKey(v))
}

function parseResponsibility(raw?: string | null): string | null {
  if (!raw?.trim()) return null
  const s = normKey(raw)
  if (['datacenter', '机房', '供应商', 'idc'].includes(s)) return 'datacenter'
  if (['platform', '平台', '算力'].includes(s)) return 'platform'
  if (['customer', '客户', '用户'].includes(s)) return 'customer'
  return null
}

function parseProductLine(raw?: string | null): string | null {
  if (!raw?.trim()) return null
  const s = normKey(raw)
  const map: Record<string, string> = {
    服务部署: 'service_deploy',
    service_deploy: 'service_deploy',
    云主机: 'cloud_host',
    cloud_host: 'cloud_host',
    裸金属: 'bare_metal',
    bare_metal: 'bare_metal',
    任务: 'job',
    job: 'job',
    竞价任务: 'job_spot',
    job_spot: 'job_spot',
  }
  return map[s] ?? null
}

function parseCooperationType(raw?: string | null): string | null {
  if (!raw?.trim()) return null
  const s = normKey(raw)
  if (['whole_rent', '整租', '整租合作'].includes(s)) return 'whole_rent'
  if (['idle_time', '闲时', '闲时合作'].includes(s)) return 'idle_time'
  return null
}

function parseLineStatus(raw?: string | null): string {
  if (!raw?.trim()) return 'active'
  const s = normKey(raw)
  if (['paused', '暂停', '停用'].includes(s)) return 'paused'
  if (['terminated', '终止', '结束', '已终止'].includes(s)) return 'terminated'
  return 'active'
}

function parseAffectedNodes(raw?: string | null): string[] {
  if (!raw?.trim()) return []
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean)
      }
    } catch {
      // fall through
    }
  }
  return trimmed
    .split(/[,，;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function isRowEmpty(canonical: Record<string, string>): boolean {
  return Object.values(canonical).every((v) => !v?.trim())
}

async function loadMasterDataContext(): Promise<MasterDataContext> {
  const [dataCenters, gpuCardTypes, suppliers] = await Promise.all([
    db.select({ id: dataCenter.id, code: dataCenter.code, name: dataCenter.name }).from(dataCenter),
    db
      .select({ id: gpuCardType.id, code: gpuCardType.code, name: gpuCardType.name })
      .from(gpuCardType),
    db
      .select({
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        shortName: supplier.shortName,
      })
      .from(supplier),
  ])
  return { dataCenters, gpuCardTypes, suppliers }
}

function matchDataCenter(raw: string, ctx: MasterDataContext) {
  const trimmed = raw.trim()
  if (!trimmed) return { id: null as string | null, label: null as string | null }
  const key = normKey(trimmed)
  const byCode = ctx.dataCenters.find((dc) => normKey(dc.code) === key)
  if (byCode) return { id: byCode.id, label: byCode.code }
  const byName = ctx.dataCenters.find((dc) => normKey(dc.name) === key)
  if (byName) return { id: byName.id, label: byName.name }
  return { id: null, label: trimmed }
}

function matchGpuCard(raw: string, ctx: MasterDataContext) {
  const trimmed = raw.trim()
  if (!trimmed) return { id: null as string | null, label: null as string | null }
  const matched = matchGpuCardType(trimmed, ctx.gpuCardTypes)
  if (matched.id) return { id: matched.id, label: matched.name ?? trimmed }
  return { id: null, label: trimmed }
}

function matchSupplierByCode(raw: string, ctx: MasterDataContext) {
  const trimmed = raw.trim()
  if (!trimmed) return { id: null as string | null, label: null as string | null }
  const key = normKey(trimmed)
  const byCode = ctx.suppliers.find((s) => normKey(s.code) === key)
  if (byCode) return { id: byCode.id, label: byCode.name }
  const byName = matchSupplierName({ sourceName: trimmed, suppliers: ctx.suppliers, aliases: [] })
  if (byName.status === 'matched' && byName.supplierId) {
    const s = ctx.suppliers.find((row) => row.id === byName.supplierId)
    return { id: byName.supplierId, label: s?.name ?? trimmed }
  }
  return { id: null, label: trimmed }
}

function emptyPreview(input: {
  batchId: string
  config: SlaBitableSyncConfigDto
  recordCount: number
  parseError: string
  missingRequiredHeaders: string[]
}): SlaBitablePreviewResult {
  return {
    batchId: input.batchId,
    syncKind: input.config.syncKind,
    configId: input.config.id,
    configName: input.config.name,
    recordCount: input.recordCount,
    sourceRowCount: 0,
    okCount: 0,
    warningCount: 0,
    errorCount: 0,
    unmatchedMasterDataCount: 0,
    parseError: input.parseError,
    missingRequiredHeaders: input.missingRequiredHeaders,
    rows: [],
  }
}

async function loadExistingExternalIds(syncKind: SlaBitableSyncKind, externalIds: string[]) {
  if (externalIds.length === 0) return new Set<string>()

  if (syncKind === 'platform_offline_baremetal') {
    const rows = await db
      .select({ externalId: slaPlatformOfflineBaremetalIncident.externalIncidentId })
      .from(slaPlatformOfflineBaremetalIncident)
      .where(inArray(slaPlatformOfflineBaremetalIncident.externalIncidentId, externalIds))
    return new Set(rows.map((r) => r.externalId))
  }

  if (syncKind === 'platform_online_incident') {
    const rows = await db
      .select({ externalId: slaPlatformOnlineIncident.externalIncidentId })
      .from(slaPlatformOnlineIncident)
      .where(inArray(slaPlatformOnlineIncident.externalIncidentId, externalIds))
    return new Set(rows.map((r) => r.externalId))
  }

  if (syncKind === 'platform_internal_usage') {
    const rows = await db
      .select({ externalId: slaPlatformInternalUsage.externalRecordId })
      .from(slaPlatformInternalUsage)
      .where(inArray(slaPlatformInternalUsage.externalRecordId, externalIds))
    return new Set(rows.map((r) => r.externalId))
  }

  const rows = await db
    .select({ bitableRecordId: supplierContractCapacityLine.bitableRecordId })
    .from(supplierContractCapacityLine)
    .where(inArray(supplierContractCapacityLine.bitableRecordId, externalIds))
  return new Set(
    rows.map((r) => r.bitableRecordId).filter((id): id is string => Boolean(id)),
  )
}

function buildPreviewRow(input: {
  rowNo: number
  bitableRecordId: string
  syncKind: SlaBitableSyncKind
  canonical: Record<string, string>
  ctx: MasterDataContext
  existingExternalIds: Set<string>
}): SlaBitablePreviewRow {
  const { canonical, syncKind, ctx } = input
  const messages: string[] = []
  let parseStatus: SlaBitablePreviewRow['parseStatus'] = 'ok'

  const dcRaw = canonical.data_center ?? ''
  const cardRaw = canonical.gpu_card_type ?? ''
  const dcMatch = matchDataCenter(dcRaw, ctx)
  const cardMatch = matchGpuCard(cardRaw, ctx)

  if (dcRaw.trim() && !dcMatch.id) {
    messages.push(`未匹配到机房：${dcRaw.trim()}`)
    parseStatus = 'error'
  } else if (!dcRaw.trim()) {
    messages.push('机房不能为空')
    parseStatus = 'error'
  }
  if (cardRaw.trim() && !cardMatch.id) {
    messages.push(`未匹配到卡型：${cardRaw.trim()}`)
    parseStatus = 'error'
  } else if (!cardRaw.trim()) {
    messages.push('卡型不能为空')
    parseStatus = 'error'
  }

  let supplierId: string | null = null
  let supplierLabel: string | null = null
  if (syncKind === 'supplier_capacity_contract') {
    const supplierMatch = matchSupplierByCode(canonical.supplier_code ?? '', ctx)
    supplierId = supplierMatch.id
    supplierLabel = supplierMatch.label
    if (canonical.supplier_code?.trim() && !supplierId) {
      messages.push(`未匹配到供应商：${canonical.supplier_code.trim()}`)
      parseStatus = 'error'
    }
  }

  const reportReceivedAt = parseFlexibleDateTime(canonical.report_received_at)
  const faultStartedAt = parseFlexibleDateTime(canonical.fault_started_at)
  const faultEndedAt = parseFlexibleDateTime(canonical.fault_ended_at)
  const expectedAt = parseFlexibleDateTime(canonical.expected_at)
  const actualStartedAt = parseFlexibleDateTime(canonical.actual_started_at)
  const actualReturnedAt = parseFlexibleDateTime(canonical.actual_returned_at)
  const actualShelvedAt = parseFlexibleDateTime(canonical.actual_shelved_at)
  const startDate = parseFlexibleDate(canonical.start_date)
  const endDate = parseFlexibleDate(canonical.end_date)

  const impactMinutes = parseIntegerCell(canonical.impact_minutes)
  const deviceCount = parseIntegerCell(canonical.device_count)
  const gpuCount = parseIntegerCell(canonical.gpu_count)
  const deviceQuantity = parseIntegerCell(canonical.device_quantity)
  const gpuQuantity = parseIntegerCell(canonical.gpu_quantity)

  const responsibility = parseResponsibility(canonical.responsibility)
  const productLine = parseProductLine(canonical.product_line)
  const cooperationType = parseCooperationType(canonical.cooperation_type)
  const lineStatus = parseLineStatus(canonical.line_status)

  if (syncKind === 'platform_offline_baremetal' || syncKind === 'platform_online_incident') {
    if (!canonical.report_received_at?.trim()) {
      messages.push('收到报告时间不能为空')
      parseStatus = 'error'
    } else if (!reportReceivedAt) {
      messages.push('收到报告时间格式无法识别')
      parseStatus = 'error'
    }
    if (!canonical.fault_started_at?.trim()) {
      messages.push('故障开始时间不能为空')
      parseStatus = 'error'
    } else if (!faultStartedAt) {
      messages.push('故障开始时间格式无法识别')
      parseStatus = 'error'
    }
    if (canonical.fault_ended_at?.trim() && !faultEndedAt) {
      messages.push('故障结束时间格式无法识别，将忽略')
      if (parseStatus === 'ok') parseStatus = 'warning'
    }
    if (!canonical.impact_minutes?.trim()) {
      messages.push('影响时长不能为空')
      parseStatus = 'error'
    } else if (impactMinutes == null) {
      messages.push('影响时长须为整数（分钟）')
      parseStatus = 'error'
    }
    if (!canonical.responsibility?.trim()) {
      messages.push('责任归属不能为空')
      parseStatus = 'error'
    } else if (!responsibility) {
      messages.push('责任归属无法识别（机房/平台/客户）')
      parseStatus = 'error'
    }
  }

  if (syncKind === 'platform_online_incident') {
    if (!canonical.tenant_platform_id?.trim()) {
      messages.push('租户 ID 不能为空')
      parseStatus = 'error'
    }
    if (!canonical.product_line?.trim()) {
      messages.push('产品线不能为空')
      parseStatus = 'error'
    } else if (!productLine) {
      messages.push('产品线无法识别')
      parseStatus = 'error'
    }
  }

  if (syncKind === 'platform_offline_baremetal') {
    if (!canonical.customer_full_name?.trim()) {
      messages.push('客户全称不能为空')
      parseStatus = 'error'
    }
  }

  if (syncKind === 'platform_internal_usage') {
    if (!canonical.actual_started_at?.trim()) {
      messages.push('实际开始时间不能为空')
      parseStatus = 'error'
    } else if (!actualStartedAt) {
      messages.push('实际开始时间格式无法识别')
      parseStatus = 'error'
    }
    if (!canonical.department?.trim()) {
      messages.push('部门不能为空')
      parseStatus = 'error'
    }
    if (!canonical.user_name?.trim()) {
      messages.push('人员不能为空')
      parseStatus = 'error'
    }
    if (canonical.device_count?.trim() && deviceCount == null) {
      messages.push('台数须为非负整数')
      parseStatus = 'error'
    }
    if (canonical.gpu_count?.trim() && gpuCount == null) {
      messages.push('卡数须为非负整数')
      parseStatus = 'error'
    }
    if (canonical.unit_price?.trim() && !parseMoneyCell(canonical.unit_price)) {
      messages.push('单价格式无效')
      parseStatus = 'error'
    }
    if (canonical.total_amount?.trim() && !parseMoneyCell(canonical.total_amount)) {
      messages.push('合计金额格式无效')
      parseStatus = 'error'
    }
  }

  if (syncKind === 'supplier_capacity_contract') {
    if (!canonical.contract_no?.trim()) {
      messages.push('合同编号不能为空')
      parseStatus = 'error'
    }
    if (canonical.start_date?.trim() && !startDate) {
      messages.push('开始日期格式无法识别')
      parseStatus = 'error'
    }
    if (canonical.end_date?.trim() && !endDate) {
      messages.push('结束日期格式无法识别')
      parseStatus = 'error'
    }
    if (canonical.cooperation_type?.trim() && !cooperationType) {
      messages.push('合作模式无法识别（整租/闲时）')
      parseStatus = 'error'
    }
    if (canonical.device_quantity?.trim() && deviceQuantity == null) {
      messages.push('台数须为非负整数')
      parseStatus = 'error'
    }
    if (canonical.gpu_quantity?.trim() && gpuQuantity == null) {
      messages.push('卡数须为非负整数')
      parseStatus = 'error'
    }
  }

  const action: SlaBitablePreviewRow['action'] =
    parseStatus === 'error'
      ? 'skip'
      : input.existingExternalIds.has(input.bitableRecordId)
        ? 'update'
        : 'create'

  return {
    rowNo: input.rowNo,
    bitableRecordId: input.bitableRecordId,
    parseStatus,
    messages,
    action,
    selectable: parseStatus !== 'error',
    dataCenterId: dcMatch.id,
    dataCenterLabel: dcMatch.label,
    gpuCardTypeId: cardMatch.id,
    gpuCardTypeLabel: cardMatch.label,
    supplierId,
    supplierLabel,
    reportReceivedAt: reportReceivedAt?.toISOString() ?? null,
    customerFullName: canonical.customer_full_name?.trim() || null,
    contractNo: canonical.contract_no?.trim() || null,
    offlineOrderNo: canonical.offline_order_no?.trim() || null,
    faultStartedAt: faultStartedAt?.toISOString() ?? null,
    faultEndedAt: faultEndedAt?.toISOString() ?? null,
    impactMinutes,
    responsibility,
    faultDescription: canonical.fault_description?.trim() || null,
    remediation: canonical.remediation?.trim() || null,
    isForceMajeureExempt: parseBooleanCell(canonical.is_force_majeure_exempt),
    isCompensated: parseBooleanCell(canonical.is_compensated),
    compensationAmount: parseMoneyCell(canonical.compensation_amount),
    compensationWorkOrderId: canonical.compensation_work_order_id?.trim() || null,
    tenantPlatformId: canonical.tenant_platform_id?.trim() || null,
    productLine,
    orderId: canonical.order_id?.trim() || null,
    affectedNodes: parseAffectedNodes(canonical.affected_nodes),
    compensationVoucherAmount: parseMoneyCell(canonical.compensation_voucher_amount),
    expectedAt: expectedAt?.toISOString() ?? null,
    actualStartedAt: actualStartedAt?.toISOString() ?? null,
    actualReturnedAt: actualReturnedAt?.toISOString() ?? null,
    actualShelvedAt: actualShelvedAt?.toISOString() ?? null,
    department: canonical.department?.trim() || null,
    userName: canonical.user_name?.trim() || null,
    deviceCount,
    gpuCount,
    unitPrice: parseMoneyCell(canonical.unit_price),
    totalAmount: parseMoneyCell(canonical.total_amount),
    usageCardHours: parseMoneyCell(canonical.usage_card_hours),
    supplierCode: canonical.supplier_code?.trim() || null,
    cooperationType,
    deviceQuantity,
    gpuQuantity,
    startDate,
    endDate,
    lineStatus,
    remark: canonical.remark?.trim() || null,
    rawCanonical: canonical,
  }
}

async function upsertImportBatch(input: {
  batchId: string
  syncKind: SlaBitableSyncKind
  importStatus: 'parsed' | 'committed' | 'error'
  rowCount: number
  committedRowCount?: number
  parseError?: string | null
  createdByStaffId?: string | null
}) {
  const [existing] = await db
    .select({ id: slaImportBatch.id })
    .from(slaImportBatch)
    .where(eq(slaImportBatch.id, input.batchId))
    .limit(1)

  const values = {
    sourceSystem: 'feishu_bitable' as const,
    datasetKind: input.syncKind,
    importStatus: input.importStatus,
    rowCount: input.rowCount,
    committedRowCount: input.committedRowCount ?? 0,
    parseError: input.parseError ?? null,
    committedAt: input.importStatus === 'committed' ? new Date() : null,
    createdByStaffId: input.createdByStaffId ?? null,
  }

  if (existing) {
    await db.update(slaImportBatch).set(values).where(eq(slaImportBatch.id, input.batchId))
  } else {
    await db.insert(slaImportBatch).values({ id: input.batchId, ...values })
  }
}

async function commitOfflineRow(row: SlaBitablePreviewRow, batchId: string): Promise<'create' | 'update'> {
  const externalId = row.bitableRecordId
  let offlineOrderId: string | null = null
  if (row.offlineOrderNo) {
    const [order] = await db
      .select({ id: offlineBareMetalOrder.id })
      .from(offlineBareMetalOrder)
      .where(eq(offlineBareMetalOrder.orderNo, row.offlineOrderNo))
      .limit(1)
    offlineOrderId = order?.id ?? null
  }

  const payload = {
    externalIncidentId: externalId,
    bitableRecordId: externalId,
    importBatchId: batchId,
    offlineBareMetalOrderId: offlineOrderId,
    reportReceivedAt: new Date(row.reportReceivedAt!),
    customerFullName: row.customerFullName!,
    contractNo: row.contractNo,
    faultStartedAt: new Date(row.faultStartedAt!),
    faultEndedAt: row.faultEndedAt ? new Date(row.faultEndedAt) : null,
    impactMinutes: row.impactMinutes!,
    dataCenterId: row.dataCenterId!,
    gpuCardTypeId: row.gpuCardTypeId!,
    responsibility: row.responsibility!,
    faultDescription: row.faultDescription,
    remediation: row.remediation,
    isForceMajeureExempt: row.isForceMajeureExempt,
    isCompensated: row.isCompensated,
    compensationAmount: row.compensationAmount,
    compensationWorkOrderId: row.compensationWorkOrderId,
    rawJson: row.rawCanonical,
  }

  const [existing] = await db
    .select({ id: slaPlatformOfflineBaremetalIncident.id })
    .from(slaPlatformOfflineBaremetalIncident)
    .where(eq(slaPlatformOfflineBaremetalIncident.externalIncidentId, externalId))
    .limit(1)

  if (existing) {
    await db
      .update(slaPlatformOfflineBaremetalIncident)
      .set(payload)
      .where(eq(slaPlatformOfflineBaremetalIncident.id, existing.id))
    return 'update'
  }

  await db.insert(slaPlatformOfflineBaremetalIncident).values({ id: newId(), ...payload })
  return 'create'
}

async function commitOnlineRow(row: SlaBitablePreviewRow, batchId: string): Promise<'create' | 'update'> {
  const externalId = row.bitableRecordId
  const payload = {
    externalIncidentId: externalId,
    bitableRecordId: externalId,
    importBatchId: batchId,
    reportReceivedAt: new Date(row.reportReceivedAt!),
    tenantPlatformId: row.tenantPlatformId!,
    faultStartedAt: new Date(row.faultStartedAt!),
    faultEndedAt: row.faultEndedAt ? new Date(row.faultEndedAt) : null,
    impactMinutes: row.impactMinutes!,
    dataCenterId: row.dataCenterId!,
    gpuCardTypeId: row.gpuCardTypeId!,
    productLine: row.productLine!,
    orderId: row.orderId,
    affectedNodes: row.affectedNodes,
    responsibility: row.responsibility!,
    faultDescription: row.faultDescription,
    remediation: row.remediation,
    isForceMajeureExempt: row.isForceMajeureExempt,
    isCompensated: row.isCompensated,
    compensationVoucherAmount: row.compensationVoucherAmount,
    compensationWorkOrderId: row.compensationWorkOrderId,
    rawJson: row.rawCanonical,
  }

  const [existing] = await db
    .select({ id: slaPlatformOnlineIncident.id })
    .from(slaPlatformOnlineIncident)
    .where(eq(slaPlatformOnlineIncident.externalIncidentId, externalId))
    .limit(1)

  if (existing) {
    await db
      .update(slaPlatformOnlineIncident)
      .set(payload)
      .where(eq(slaPlatformOnlineIncident.id, existing.id))
    return 'update'
  }

  await db.insert(slaPlatformOnlineIncident).values({ id: newId(), ...payload })
  return 'create'
}

async function commitInternalRow(row: SlaBitablePreviewRow, batchId: string): Promise<'create' | 'update'> {
  const externalId = row.bitableRecordId
  const payload = {
    externalRecordId: externalId,
    bitableRecordId: externalId,
    importBatchId: batchId,
    expectedAt: row.expectedAt ? new Date(row.expectedAt) : null,
    actualStartedAt: new Date(row.actualStartedAt!),
    actualReturnedAt: row.actualReturnedAt ? new Date(row.actualReturnedAt) : null,
    actualShelvedAt: row.actualShelvedAt ? new Date(row.actualShelvedAt) : null,
    department: row.department!,
    userName: row.userName!,
    dataCenterId: row.dataCenterId!,
    gpuCardTypeId: row.gpuCardTypeId!,
    deviceCount: row.deviceCount!,
    gpuCount: row.gpuCount!,
    unitPrice: row.unitPrice!,
    totalAmount: row.totalAmount!,
    usageCardHours: row.usageCardHours,
    rawJson: row.rawCanonical,
  }

  const [existing] = await db
    .select({ id: slaPlatformInternalUsage.id })
    .from(slaPlatformInternalUsage)
    .where(eq(slaPlatformInternalUsage.externalRecordId, externalId))
    .limit(1)

  if (existing) {
    await db
      .update(slaPlatformInternalUsage)
      .set(payload)
      .where(eq(slaPlatformInternalUsage.id, existing.id))
    return 'update'
  }

  await db.insert(slaPlatformInternalUsage).values({ id: newId(), ...payload })
  return 'create'
}

async function ensureSupplierContract(input: {
  contractNo: string
  supplierId: string
  startDate: string
  endDate: string
}): Promise<{ contractId: string; created: boolean }> {
  const [existing] = await db
    .select({ id: supplierContract.id })
    .from(supplierContract)
    .where(eq(supplierContract.contractNo, input.contractNo))
    .limit(1)

  if (existing) {
    await db
      .update(supplierContract)
      .set({
        supplierId: input.supplierId,
        status: 'active',
        startDate: input.startDate,
        endDate: input.endDate,
      })
      .where(eq(supplierContract.id, existing.id))
    return { contractId: existing.id, created: false }
  }

  const contractId = newId()
  await db.insert(supplierContract).values({
    id: contractId,
    supplierId: input.supplierId,
    contractNo: input.contractNo,
    type: 'cooperation',
    status: 'active',
    pricingMode: 'card_time',
    cooperationMode: 'card_time',
    startDate: input.startDate,
    endDate: input.endDate,
  })
  return { contractId, created: true }
}

async function commitCapacityRow(row: SlaBitablePreviewRow, batchId: string): Promise<'create' | 'update'> {
  const { contractId } = await ensureSupplierContract({
    contractNo: row.contractNo!,
    supplierId: row.supplierId!,
    startDate: row.startDate!,
    endDate: row.endDate!,
  })

  const payload = {
    contractId,
    dataCenterId: row.dataCenterId!,
    gpuCardTypeId: row.gpuCardTypeId!,
    cooperationType: row.cooperationType!,
    deviceQuantity: row.deviceQuantity!,
    gpuQuantity: row.gpuQuantity!,
    startDate: row.startDate!,
    endDate: row.endDate!,
    lineStatus: row.lineStatus ?? 'active',
    bitableRecordId: row.bitableRecordId,
    remark: row.remark,
    rawJson: row.rawCanonical,
  }

  const [byBitable] = await db
    .select({ id: supplierContractCapacityLine.id })
    .from(supplierContractCapacityLine)
    .where(eq(supplierContractCapacityLine.bitableRecordId, row.bitableRecordId))
    .limit(1)

  if (byBitable) {
    await db
      .update(supplierContractCapacityLine)
      .set(payload)
      .where(eq(supplierContractCapacityLine.id, byBitable.id))
    return 'update'
  }

  const [byScope] = await db
    .select({ id: supplierContractCapacityLine.id })
    .from(supplierContractCapacityLine)
    .where(
      and(
        eq(supplierContractCapacityLine.contractId, contractId),
        eq(supplierContractCapacityLine.dataCenterId, row.dataCenterId!),
        eq(supplierContractCapacityLine.gpuCardTypeId, row.gpuCardTypeId!),
        eq(supplierContractCapacityLine.startDate, row.startDate!),
      ),
    )
    .limit(1)

  if (byScope) {
    await db
      .update(supplierContractCapacityLine)
      .set(payload)
      .where(eq(supplierContractCapacityLine.id, byScope.id))
    return 'update'
  }

  await db.insert(supplierContractCapacityLine).values({ id: newId(), ...payload })
  return 'create'
}

export async function buildPreviewFromRecords(input: {
  config: SlaBitableSyncConfigDto
  records: FeishuBitableRecord[]
  batchId: string
  operatorStaffId?: string | null
}): Promise<SlaBitablePreviewResult> {
  const missingRequiredHeaders = validateSlaFieldMapping(
    input.config.fieldMappingJson,
    input.config.syncKind,
  )
  if (missingRequiredHeaders.length > 0) {
    return emptyPreview({
      batchId: input.batchId,
      config: input.config,
      recordCount: input.records.length,
      parseError: `缺少必需列映射：${missingRequiredHeaders.join('、')}`,
      missingRequiredHeaders,
    })
  }

  const runtimeConfig = loadFeishuRuntimeConfig()
  if (!runtimeConfig?.enabled) {
    throw new Error('飞书集成未配置或未启用')
  }

  const bitableFields = await listFeishuBitableFields(
    runtimeConfig,
    input.config.appToken,
    input.config.tableId,
  )
  const fieldIdToName = buildSlaFieldIdToNameMap(bitableFields)
  const importRows = mapSlaBitableRecordsToImportRows({
    records: input.records,
    fieldMapping: input.config.fieldMappingJson,
    fieldIdToName,
    syncKind: input.config.syncKind,
  })

  const nonEmptyRows = importRows.filter((row) => !isRowEmpty(row.canonical))
  if (nonEmptyRows.length === 0) {
    return emptyPreview({
      batchId: input.batchId,
      config: input.config,
      recordCount: input.records.length,
      parseError: '未解析到有效数据行，请检查表头与内容',
      missingRequiredHeaders: [],
    })
  }

  const ctx = await loadMasterDataContext()
  const externalIds = nonEmptyRows.map((r) => r.bitableRecordId)
  const existingExternalIds = await loadExistingExternalIds(input.config.syncKind, externalIds)

  const previewRows = nonEmptyRows.map((row, index) =>
    buildPreviewRow({
      rowNo: index + 1,
      bitableRecordId: row.bitableRecordId,
      syncKind: input.config.syncKind,
      canonical: row.canonical,
      ctx,
      existingExternalIds,
    }),
  )

  const okCount = previewRows.filter((r) => r.parseStatus === 'ok').length
  const warningCount = previewRows.filter((r) => r.parseStatus === 'warning').length
  const errorCount = previewRows.filter((r) => r.parseStatus === 'error').length
  const unmatchedMasterDataCount = previewRows.filter(
    (r) => r.selectable === false && r.messages.some((m) => m.includes('未匹配')),
  ).length

  await upsertImportBatch({
    batchId: input.batchId,
    syncKind: input.config.syncKind,
    importStatus: 'parsed',
    rowCount: previewRows.length,
    createdByStaffId: input.operatorStaffId,
  })

  return {
    batchId: input.batchId,
    syncKind: input.config.syncKind,
    configId: input.config.id,
    configName: input.config.name,
    recordCount: input.records.length,
    sourceRowCount: previewRows.length,
    okCount,
    warningCount,
    errorCount,
    unmatchedMasterDataCount,
    parseError: null,
    missingRequiredHeaders: [],
    rows: previewRows,
  }
}

export const slaBitableImportDataAccess = {
  buildPreviewFromRecords,

  async commitPreview(input: {
    batchId: string
    syncKind: SlaBitableSyncKind
    rows: SlaBitablePreviewRow[]
    operatorStaffId?: string | null
  }): Promise<SlaBitableImportCommitResult> {
    const importable = input.rows.filter((r) => r.selectable)
    if (importable.length === 0) {
      throw new Error('没有通过校验的可入库行')
    }

    let created = 0
    let updated = 0
    const skipped = input.rows.length - importable.length
    let failed = 0

    for (const row of importable) {
      try {
        let action: 'create' | 'update'
        switch (input.syncKind) {
          case 'platform_offline_baremetal':
            action = await commitOfflineRow(row, input.batchId)
            break
          case 'platform_online_incident':
            action = await commitOnlineRow(row, input.batchId)
            break
          case 'platform_internal_usage':
            action = await commitInternalRow(row, input.batchId)
            break
          case 'supplier_capacity_contract':
            action = await commitCapacityRow(row, input.batchId)
            break
          default:
            throw new Error(`不支持的 syncKind：${String(input.syncKind)}`)
        }
        if (action === 'create') created++
        else updated++
      } catch {
        failed++
      }
    }

    await upsertImportBatch({
      batchId: input.batchId,
      syncKind: input.syncKind,
      importStatus: failed > 0 && created + updated === 0 ? 'error' : 'committed',
      rowCount: input.rows.length,
      committedRowCount: created + updated,
      createdByStaffId: input.operatorStaffId,
    })

    return {
      batchId: input.batchId,
      created,
      updated,
      skipped,
      failed,
    }
  },
}
