export type BareMetalOrderMark = 'online' | 'offline'
export type BareMetalOrderSource = 'platform_sync' | 'offline_excel'

export type BareMetalOrderListItemDto = {
  id: string
  orderNo: string | null
  platformOrderId: string | null
  orderMark: BareMetalOrderMark
  source: BareMetalOrderSource | string
  status: string
  payStatus: string
  tenantId: string
  tenantName: string | null
  platformTenantId: string
  projectId: string | null
  projectName: string | null
  dataCenterId: string | null
  dataCenterName: string | null
  idcName: string | null
  deviceCount: number
  gpuCount: number
  purchaseQty: number | null
  purchaseQtyText: string | null
  billingUnit: string
  finalAmount: string
  orderAmount: string | null
  discountAmount: string | null
  balanceAmount: string
  couponAmount: string
  orderedAt: string
  rentStartsAt: string | null
  rentEndsAt: string | null
  /** 设备明细聚合的卡型摘要，如「4090 × 8」 */
  gpuCardSummary?: string | null
  /** 设备明细聚合的设备型号摘要，如「H800-8卡 × 2」 */
  deviceModelSummary?: string | null
}

export type BareMetalOrderDeviceDto = {
  id: string
  lineNo: number
  allocationStatus: string
  deviceModelText: string | null
  gpuCardTypeId: string | null
  gpuCardTypeCode: string | null
  gpuCount: number
  durationHours: string | null
  unitPricePerCardHour: string | null
  lineAmount: string | null
  balanceAmount: string | null
  couponAmount: string | null
  discountAmount: string | null
  deviceStatus: string | null
  /** Waiting / 无租期：尚未确收，待后续同步更新 */
  revenuePending?: boolean
  rentStartsAt: string | null
  rentEndsAt: string | null
  supplierDeviceId: string | null
  platformDeviceId: string | null
}

export type BareMetalOrderDetailDto = BareMetalOrderListItemDto & {
  orderAmount: string | null
  refundAmount: string
  balanceAmount: string
  couponAmount: string
  paidAt: string | null
  completedAt: string | null
  purchaseQty: number | null
  idcCode: string | null
  supplierId: string | null
  supplierName: string | null
  customerId: string | null
  customerName: string | null
  importBatchId: string | null
  matchFlags: Record<string, unknown>
  remark: string | null
  devices: BareMetalOrderDeviceDto[]
  sshEnabled: boolean | null
  sshPublicKey: string | null
  autoRenew: boolean | null
  nextBillingAt: string | null
  renewCount: number | null
  overdueRetries: number | null
  overdueAt: string | null
  workspaceId: string | null
  description: string | null
  priceSnapshot: BareMetalOrderPriceSnapshotDto | null
  logs: BareMetalOrderLogDto[]
}

export type BareMetalOrderPriceSnapshotDto = {
  id: string
  unitPricePerCardHour: string
  gpuCount: number
  orderAmount: string
  currency: string
  priceSource: string | null
}

export type BareMetalOrderLogDto = {
  id: string
  eventType: string
  previousStatus: string | null
  newStatus: string | null
  description: string | null
  detail: Record<string, unknown> | null
  operatorId: string | null
  operatorSource: string | null
  occurredAt: string
}

export type OfflineBareMetalOrderPreviewRowDto = {
  rowNo: number
  cardType: string
  gpuCardTypeId: string | null
  gpuCardTypeCode: string | null
  gpuCount: number
  rentStartsAt: string
  rentEndsAt: string
  durationHours: number
  unitPricePerCardHour: number
  lineAmount: number
  errors: string[]
  warnings: string[]
}

export type OfflineBareMetalOrderPreviewResult = {
  previewToken: string
  fileName: string
  projectId: string
  projectName: string
  tenantId: string
  tenantName: string
  headSummary: {
    deviceLineCount: number
    gpuCount: number
    finalAmount: number
    rentStartsAt: string | null
    rentEndsAt: string | null
    purchaseQtyText: string
  }
  rows: OfflineBareMetalOrderPreviewRowDto[]
  headerErrors: string[]
  selectable: boolean
}

export type OfflineBareMetalOrderImportResult = {
  importBatchId: string
  bareMetalOrderId: string
  orderNo: string
  deviceLineCount: number
  finalAmount: string
  errors: Array<{ rowNo: number; message: string }>
}
