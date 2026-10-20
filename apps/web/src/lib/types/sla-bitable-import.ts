export const SLA_BITABLE_SYNC_KINDS = [
  'platform_offline_baremetal',
  'platform_online_incident',
  'platform_internal_usage',
  'supplier_capacity_contract',
] as const

export type SlaBitableSyncKind = (typeof SLA_BITABLE_SYNC_KINDS)[number]

export const SLA_OFFLINE_BAREMETAL_CANONICAL_HEADERS = [
  'report_received_at',
  'customer_full_name',
  'contract_no',
  'offline_order_no',
  'fault_started_at',
  'fault_ended_at',
  'impact_minutes',
  'data_center',
  'gpu_card_type',
  'responsibility',
  'fault_description',
  'remediation',
  'is_force_majeure_exempt',
  'is_compensated',
  'compensation_amount',
  'compensation_work_order_id',
] as const

export const SLA_ONLINE_INCIDENT_CANONICAL_HEADERS = [
  'report_received_at',
  'tenant_platform_id',
  'fault_started_at',
  'fault_ended_at',
  'impact_minutes',
  'data_center',
  'gpu_card_type',
  'product_line',
  'order_id',
  'affected_nodes',
  'responsibility',
  'fault_description',
  'remediation',
  'is_force_majeure_exempt',
  'is_compensated',
  'compensation_voucher_amount',
  'compensation_work_order_id',
] as const

export const SLA_INTERNAL_USAGE_CANONICAL_HEADERS = [
  'expected_at',
  'actual_started_at',
  'actual_returned_at',
  'actual_shelved_at',
  'department',
  'user_name',
  'data_center',
  'gpu_card_type',
  'device_count',
  'gpu_count',
  'unit_price',
  'total_amount',
  'usage_card_hours',
] as const

export const SLA_CAPACITY_CONTRACT_CANONICAL_HEADERS = [
  'contract_no',
  'supplier_code',
  'data_center',
  'gpu_card_type',
  'cooperation_type',
  'device_quantity',
  'gpu_quantity',
  'start_date',
  'end_date',
  'line_status',
  'remark',
] as const

export type SlaOfflineBaremetalCanonicalHeader =
  (typeof SLA_OFFLINE_BAREMETAL_CANONICAL_HEADERS)[number]
export type SlaOnlineIncidentCanonicalHeader =
  (typeof SLA_ONLINE_INCIDENT_CANONICAL_HEADERS)[number]
export type SlaInternalUsageCanonicalHeader =
  (typeof SLA_INTERNAL_USAGE_CANONICAL_HEADERS)[number]
export type SlaCapacityContractCanonicalHeader =
  (typeof SLA_CAPACITY_CONTRACT_CANONICAL_HEADERS)[number]

export type SlaBitableCanonicalHeader =
  | SlaOfflineBaremetalCanonicalHeader
  | SlaOnlineIncidentCanonicalHeader
  | SlaInternalUsageCanonicalHeader
  | SlaCapacityContractCanonicalHeader

export const SLA_CANONICAL_HEADERS_BY_KIND: Record<SlaBitableSyncKind, readonly string[]> = {
  platform_offline_baremetal: SLA_OFFLINE_BAREMETAL_CANONICAL_HEADERS,
  platform_online_incident: SLA_ONLINE_INCIDENT_CANONICAL_HEADERS,
  platform_internal_usage: SLA_INTERNAL_USAGE_CANONICAL_HEADERS,
  supplier_capacity_contract: SLA_CAPACITY_CONTRACT_CANONICAL_HEADERS,
}

export const SLA_REQUIRED_HEADERS_BY_KIND: Record<SlaBitableSyncKind, readonly string[]> = {
  platform_offline_baremetal: [
    'report_received_at',
    'customer_full_name',
    'fault_started_at',
    'impact_minutes',
    'data_center',
    'gpu_card_type',
    'responsibility',
  ],
  platform_online_incident: [
    'report_received_at',
    'tenant_platform_id',
    'fault_started_at',
    'impact_minutes',
    'data_center',
    'gpu_card_type',
    'product_line',
    'responsibility',
  ],
  platform_internal_usage: [
    'actual_started_at',
    'department',
    'user_name',
    'data_center',
    'gpu_card_type',
    'device_count',
    'gpu_count',
    'unit_price',
    'total_amount',
  ],
  supplier_capacity_contract: [
    'contract_no',
    'supplier_code',
    'data_center',
    'gpu_card_type',
    'cooperation_type',
    'device_quantity',
    'gpu_quantity',
    'start_date',
    'end_date',
  ],
}

/** 表头别名 → canonical 字段（snake_case） */
export const SLA_BITABLE_HEADER_ALIASES: Record<string, string> = {
  // offline / online 共用
  report_received_at: 'report_received_at',
  收到用户报告时间: 'report_received_at',
  报告收到时间: 'report_received_at',
  customer_full_name: 'customer_full_name',
  客户全称: 'customer_full_name',
  客户名称: 'customer_full_name',
  contract_no: 'contract_no',
  合同编号: 'contract_no',
  合同号: 'contract_no',
  offline_order_no: 'offline_order_no',
  线下订单号: 'offline_order_no',
  fault_started_at: 'fault_started_at',
  故障开始时间: 'fault_started_at',
  故障开始: 'fault_started_at',
  fault_ended_at: 'fault_ended_at',
  故障结束时间: 'fault_ended_at',
  故障结束: 'fault_ended_at',
  impact_minutes: 'impact_minutes',
  影响时长: 'impact_minutes',
  '影响时长（分钟）': 'impact_minutes',
  影响分钟: 'impact_minutes',
  data_center: 'data_center',
  机房: 'data_center',
  数据中心: 'data_center',
  gpu_card_type: 'gpu_card_type',
  卡型: 'gpu_card_type',
  显卡型号: 'gpu_card_type',
  responsibility: 'responsibility',
  责任归属: 'responsibility',
  责任方: 'responsibility',
  fault_description: 'fault_description',
  故障说明: 'fault_description',
  故障描述: 'fault_description',
  remediation: 'remediation',
  处理措施: 'remediation',
  is_force_majeure_exempt: 'is_force_majeure_exempt',
  是否免责: 'is_force_majeure_exempt',
  免责: 'is_force_majeure_exempt',
  is_compensated: 'is_compensated',
  是否赔付: 'is_compensated',
  compensation_amount: 'compensation_amount',
  赔付金额: 'compensation_amount',
  compensation_work_order_id: 'compensation_work_order_id',
  赔付工单: 'compensation_work_order_id',
  赔付工单id: 'compensation_work_order_id',
  // online
  tenant_platform_id: 'tenant_platform_id',
  租户id: 'tenant_platform_id',
  租户ID: 'tenant_platform_id',
  平台租户id: 'tenant_platform_id',
  product_line: 'product_line',
  产品线: 'product_line',
  order_id: 'order_id',
  订单id: 'order_id',
  订单ID: 'order_id',
  affected_nodes: 'affected_nodes',
  受影响节点: 'affected_nodes',
  compensation_voucher_amount: 'compensation_voucher_amount',
  算力券: 'compensation_voucher_amount',
  赔付券: 'compensation_voucher_amount',
  算力券金额: 'compensation_voucher_amount',
  // internal
  expected_at: 'expected_at',
  期望时间: 'expected_at',
  actual_started_at: 'actual_started_at',
  实际开始时间: 'actual_started_at',
  实际开始: 'actual_started_at',
  actual_returned_at: 'actual_returned_at',
  实际交还时间: 'actual_returned_at',
  实际交还: 'actual_returned_at',
  actual_shelved_at: 'actual_shelved_at',
  实际上架时间: 'actual_shelved_at',
  实际上架: 'actual_shelved_at',
  department: 'department',
  部门: 'department',
  user_name: 'user_name',
  人员: 'user_name',
  使用人: 'user_name',
  用户名: 'user_name',
  device_count: 'device_count',
  台数: 'device_count',
  设备数量: 'device_count',
  gpu_count: 'gpu_count',
  卡数: 'gpu_count',
  gpu数量: 'gpu_count',
  unit_price: 'unit_price',
  单价: 'unit_price',
  total_amount: 'total_amount',
  合计: 'total_amount',
  总金额: 'total_amount',
  usage_card_hours: 'usage_card_hours',
  占用卡时: 'usage_card_hours',
  使用卡时: 'usage_card_hours',
  // capacity
  supplier_code: 'supplier_code',
  供应商编码: 'supplier_code',
  供应商: 'supplier_code',
  cooperation_type: 'cooperation_type',
  合作模式: 'cooperation_type',
  合作类型: 'cooperation_type',
  device_quantity: 'device_quantity',
  承诺台数: 'device_quantity',
  gpu_quantity: 'gpu_quantity',
  承诺卡数: 'gpu_quantity',
  start_date: 'start_date',
  开始日期: 'start_date',
  开始时间: 'start_date',
  end_date: 'end_date',
  结束日期: 'end_date',
  结束时间: 'end_date',
  line_status: 'line_status',
  状态: 'line_status',
  行状态: 'line_status',
  remark: 'remark',
  备注: 'remark',
}

export type SlaBitableFieldMapping = Partial<Record<string, string>>

export type SlaBitableSyncCursor = {
  lastModifiedMs?: number
  lastRecordId?: string
}

export type SlaBitableSyncConfigDto = {
  id: string
  syncKind: SlaBitableSyncKind
  name: string
  appToken: string
  tableId: string
  viewId: string | null
  fieldMappingJson: SlaBitableFieldMapping
  filterFormula: string | null
  cronExpr: string
  autoCommit: boolean
  cursorJson: SlaBitableSyncCursor
  enabled: boolean
  lastRunAt: string | null
  lastSuccessAt: string | null
  createdAt: string
  updatedAt: string
}

export type SlaBitableFieldMatchSuggestion = {
  fieldId: string
  fieldName: string
  type?: number
  suggestedCanonicalHeader: string | null
}

export type SlaBitablePreviewRow = {
  rowNo: number
  bitableRecordId: string
  parseStatus: 'ok' | 'warning' | 'error'
  messages: string[]
  action: 'create' | 'update' | 'skip'
  selectable: boolean
  dataCenterId: string | null
  dataCenterLabel: string | null
  gpuCardTypeId: string | null
  gpuCardTypeLabel: string | null
  supplierId: string | null
  supplierLabel: string | null
  reportReceivedAt: string | null
  customerFullName: string | null
  contractNo: string | null
  offlineOrderNo: string | null
  faultStartedAt: string | null
  faultEndedAt: string | null
  impactMinutes: number | null
  responsibility: string | null
  faultDescription: string | null
  remediation: string | null
  isForceMajeureExempt: boolean
  isCompensated: boolean
  compensationAmount: string | null
  compensationWorkOrderId: string | null
  tenantPlatformId: string | null
  productLine: string | null
  orderId: string | null
  affectedNodes: string[]
  compensationVoucherAmount: string | null
  expectedAt: string | null
  actualStartedAt: string | null
  actualReturnedAt: string | null
  actualShelvedAt: string | null
  department: string | null
  userName: string | null
  deviceCount: number | null
  gpuCount: number | null
  unitPrice: string | null
  totalAmount: string | null
  usageCardHours: string | null
  supplierCode: string | null
  cooperationType: string | null
  deviceQuantity: number | null
  gpuQuantity: number | null
  startDate: string | null
  endDate: string | null
  lineStatus: string | null
  remark: string | null
  rawCanonical: Record<string, string>
}

export type SlaBitablePreviewResult = {
  batchId: string
  syncKind: SlaBitableSyncKind
  configId: string
  configName: string
  recordCount: number
  sourceRowCount: number
  okCount: number
  warningCount: number
  errorCount: number
  unmatchedMasterDataCount: number
  parseError: string | null
  missingRequiredHeaders: string[]
  rows: SlaBitablePreviewRow[]
}

export type SlaBitableImportCommitResult = {
  batchId: string
  created: number
  updated: number
  skipped: number
  failed: number
}

export type SlaBitableSyncRunResult = {
  jobRunId: string
  status: 'success' | 'failed' | 'skipped' | 'partial' | 'running'
  preview?: SlaBitablePreviewResult
  commit?: SlaBitableImportCommitResult
  message?: string
}

export type SlaBitableJobRunDto = {
  id: string
  status: string
  refId: string | null
  requestSummary: Record<string, unknown> | null
  responseSummary: Record<string, unknown> | null
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
}
