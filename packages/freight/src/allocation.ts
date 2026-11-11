import { round4 } from './math'

/**
 * 按本柜实际总 CBM 分摊海运：单件海运 = 整柜运费 ×（本件 CBM ÷ 本柜实际总 CBM）。
 * 分母不得使用空柜可用容积。实际总 CBM ≤ 0 时返回空结果，由调用方改用估算并标记缺项。
 */
export function allocateOceanFreightByActualCbm(input: {
  shipmentFreightAmount: number
  shipmentActualTotalCbm: number
  pieceCbm: number
}): { unitFreight: number; share: number } | null {
  const totalCbm = input.shipmentActualTotalCbm
  if (!(totalCbm > 0) || !Number.isFinite(totalCbm)) return null
  if (!Number.isFinite(input.shipmentFreightAmount) || input.shipmentFreightAmount < 0) return null
  const share = input.pieceCbm / totalCbm
  const unitFreight = input.shipmentFreightAmount * share
  return { unitFreight: round4(unitFreight), share: round4(share) }
}
