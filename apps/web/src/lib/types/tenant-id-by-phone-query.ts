export type TenantIdByPhoneQueryRow = {
  userId: number
  phone: string
  nickname?: string | null
  tenantIds: number[]
  tenantNames: string[]
  tenantTypes: string[]
  realNameVerified: boolean
}

export type TenantIdByPhoneQueryResult = {
  phone: string
  rows: TenantIdByPhoneQueryRow[]
  summary: {
    userCount: number
    tenantCount: number
  }
}

export function summarizeTenantIdByPhoneRows(
  rows: TenantIdByPhoneQueryRow[],
): TenantIdByPhoneQueryResult['summary'] {
  const tenantIdSet = new Set<number>()
  for (const row of rows) {
    for (const tenantId of row.tenantIds) {
      tenantIdSet.add(tenantId)
    }
  }
  return {
    userCount: rows.length,
    tenantCount: tenantIdSet.size,
  }
}
