import type { MerchantAccessMode } from '@/lib/types/merchant'

/**
 * `access_mode` 派生（D3-1/D3-2=A/Q4）：
 *
 *   oem > iframe > promo > direct（三个 flag 全 false → direct）
 *
 * 列 `merchant.access_mode` 保留作快照，但**读取一律以本函数为准**；
 * 写入只发生在 `apps/web`（运营），`apps/merchant` 无入参（Q5）。
 */

export type AccessModeFlags = {
  oemEnabled?: boolean | null
  promoEnabled?: boolean | null
  iframeEnabled?: boolean | null
}

export function deriveAccessMode(flags: AccessModeFlags): MerchantAccessMode {
  if (flags.oemEnabled) return 'oem'
  if (flags.iframeEnabled) return 'iframe'
  if (flags.promoEnabled) return 'promo'
  return 'direct'
}

/**
 * 资金模式 → 能力 flag（D3-5=A：平台同步不再硬编码 `access_mode`）。
 *   commission → 推广链接形态（promo）
 *   prepay     → 预付/OEM 形态（oem）
 */
export function accessFlagsForFundingMode(fundingMode: 'prepay' | 'commission'): AccessModeFlags {
  return fundingMode === 'commission'
    ? { oemEnabled: false, promoEnabled: true, iframeEnabled: false }
    : { oemEnabled: true, promoEnabled: false, iframeEnabled: false }
}
