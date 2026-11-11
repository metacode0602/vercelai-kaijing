/**
 * 柜次成本保存后的 SKU 列表接力：只列出已写入 sku_costs 的 SKU，不改刊登价。
 * @see docs/design/multi-platform-pricing-calculator-ux-2026-11-11.md §7.6
 */

export type OceanCostRelayRow = {
  id: string
  sku: string
  shipmentId: string
  versionNo: number
  landedUnitCost?: number | null
}

export type OceanCostRelaySku = {
  sku: string
  costId: string
  latestVersionNo: number
  landedUnitCost: number | null
}

export function listSkusForCostRelay(
  costs: OceanCostRelayRow[],
  shipmentId: string,
): OceanCostRelaySku[] {
  const latest = new Map<string, OceanCostRelaySku>()
  for (const row of costs) {
    if (row.shipmentId !== shipmentId) continue
    const sku = row.sku.trim()
    if (!sku) continue
    const prev = latest.get(sku)
    if (!prev || row.versionNo > prev.latestVersionNo) {
      latest.set(sku, {
        sku,
        costId: row.id,
        latestVersionNo: row.versionNo,
        landedUnitCost: row.landedUnitCost ?? null,
      })
    }
  }
  return [...latest.values()].sort((a, b) => a.sku.localeCompare(b.sku))
}

export function buildCostRelayPath(shipmentId: string, platform?: string, country?: string) {
  const params = new URLSearchParams({ shipmentId })
  if (platform) params.set('platform', platform)
  if (country) params.set('country', country)
  return `/console/costs/suggestions?${params.toString()}`
}
