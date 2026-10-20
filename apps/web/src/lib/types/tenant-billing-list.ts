export type TenantRechargeListItem = {
  id: string
  transactionId: string
  amount: number
  paymentMethod: string
  status: string
  source: string
  remark?: string
  createdAt: string
  completedAt?: string
}

export type TenantRechargeListResult = {
  items: TenantRechargeListItem[]
  total: number
  page: number
  pageSize: number
}

export type TenantMonthlyBillListItem = {
  id: string
  billMonth: string
  totalAmount: number
  balanceAmount: number
  couponAmount: number
  status: string
  dueDate: string
  paidAt?: string
}

export type TenantMonthlyBillDetailItem = {
  id: string
  productLine: string
  resourceName: string
  amount: number
  balanceAmount: number
  couponAmount: number
  type: string
}

export type TenantBareMetalOrderDeviceItem = {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

export type TenantBareMetalOrderListItem = {
  id: string
  orderNo: string
  status: string
  /** 折扣前订单金额 */
  orderAmount: number
  /** 折后应付（实付） */
  amount: number
  /** 商业折扣：orderAmount − amount */
  discountAmount: number
  balanceAmount: number
  couponAmount: number
  dataCenterName?: string
  deviceCount?: number
  deviceModel?: string
  gpuCount?: number
  unit?: string
  createdAt: string
  completedAt?: string
  items: TenantBareMetalOrderDeviceItem[]
}

export type TenantBareMetalOrderListResult = {
  items: TenantBareMetalOrderListItem[]
  total: number
  page: number
  pageSize: number
}

/** @deprecated 已合并至 bare_metal_order，请使用 TenantBareMetalOrderListItem */
export type TenantCommerceOrderListItem = TenantBareMetalOrderListItem

/** @deprecated 已合并至 bare_metal_order_device，请使用 TenantBareMetalOrderDeviceItem */
export type TenantCommerceOrderItem = TenantBareMetalOrderDeviceItem
