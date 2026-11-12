export const PLATFORM_CARRIER_TYPES = [
  { value: 'platform', label: '平台物流' },
  { value: 'express', label: '国际快递' },
  { value: 'ocean', label: '海运' },
  { value: 'last_mile', label: '尾程派送' },
] as const

export type PlatformCarrierType = (typeof PLATFORM_CARRIER_TYPES)[number]['value']
