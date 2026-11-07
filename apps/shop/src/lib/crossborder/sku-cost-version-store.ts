'use client'

/**
 * @deprecated 柜次成本正式路径仅走 ocean.saveCost → sku_costs。
 * 本文件保留空只读桩，避免旧引用编译失败；不再读写 localStorage。
 */

export type SkuCostVersion = {
  id: string
  sku: string
  title: string
  containerLotId: string
  lotCode: string
  versionNo: number
  taxTemplateCode: string
  feeTemplateVersionId: string | null
  currency: string
  landedUnitCost: number
  suggestPrice: number | null
  freightMode: string
  effectiveFrom: string
  createdBy: string
  taxBreakdown: Record<string, number>
  snapshot: {
    input: Record<string, unknown>
    waterfall: Array<{ id: string; labelZh: string; unitUsd: number; totalUsd: number }>
    components: Array<{ code: string; labelZh: string; rate: number; unit: string }>
  }
  status: string
}

export function useSkuCostVersions(): SkuCostVersion[] {
  return []
}

export function getSkuCostVersions(): SkuCostVersion[] {
  return []
}

export function listSkuCostVersions(_sku?: string): SkuCostVersion[] {
  return []
}

/** @deprecated 已禁用；请使用 trpc.ocean.saveCost */
export function saveSkuCostVersionFromCalculator(_args: {
  input?: unknown
  result?: unknown
  containerLotId?: string
  lotCode?: string
  createdBy?: string
}): never {
  throw new Error('saveSkuCostVersionFromCalculator 已停用：请使用 trpc.ocean.saveCost 写入 sku_costs')
}
