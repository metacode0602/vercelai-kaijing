export type BillingTenantType = 'internal' | 'external'

export type BillingTenantListItem = {
  id: string
  customerId: string
  platformTenantId?: string
  name: string
  phone?: string
  status: string
  type: BillingTenantType
  /** 所属商户本地 ID */
  merchantId: string
  /** 所属商户名称 */
  merchantName: string
  /** 内部租户收入排除起止（自然日，含）；均为空且 type=internal 时全历史排除 */
  internalEffectiveFrom?: string
  internalEffectiveTo?: string
  balance: number
  overdueAt?: string
  creditLimit?: number
  isDefault: boolean
  /** CRM 导入/创建时间 */
  createdAt: string
  /** 平台侧注册时间（OpenAPI create_time） */
  platformRegisteredAt?: string
  customerName: string
  contactPerson?: string
  contactPhone?: string
}

export type BillingTenantListResult = {
  items: BillingTenantListItem[]
  total: number
  page: number
  pageSize: number
}

export type BillingTenantDetail = BillingTenantListItem & {
  customerType: 'B' | 'C'
  customerStatus: string
  customerContactPerson?: string
  customerContactPhone?: string
  customerContactEmail?: string
  contactEmail?: string
  updatedAt: string
}

/** 内部/外部与收入排除有效期（独立设置，不走常规编辑） */
export type BillingTenantInternalSettingInput = {
  type: BillingTenantType
  internalEffectiveFrom?: string | null
  internalEffectiveTo?: string | null
}

export type BillingTenantUpdateInput = {
  tenant: {
    name: string
    phone?: string
    status: 'active' | 'inactive' | 'suspended'
    balance: number
    overdueAt?: string | null
    creditLimit?: number | null
    isDefault: boolean
  }
  customer: {
    type: 'B' | 'C'
    status: 'active' | 'inactive' | 'suspended'
  }
}

export type TenantImportResult = {
  total: number
  created: number
  updated: number
  failed: number
  errors: { row: number; platformTenantId?: string; message: string }[]
}
