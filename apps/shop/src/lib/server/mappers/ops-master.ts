export const UI_CARRIER_TYPES = ['国际快递', '海运', '平台物流', '尾程派送'] as const
export type UiCarrierType = (typeof UI_CARRIER_TYPES)[number]

export const UI_ACTIVE_STATUSES = ['启用', '停用'] as const
export type UiActiveStatus = (typeof UI_ACTIVE_STATUSES)[number]

export function toUiCarrierType(v: string | null | undefined): UiCarrierType {
  switch ((v ?? '').toLowerCase()) {
    case 'ocean':
    case '海运':
      return '海运'
    case 'platform':
    case '平台物流':
      return '平台物流'
    case 'last_mile':
    case '尾程派送':
      return '尾程派送'
    default:
      return '国际快递'
  }
}

export function toDbCarrierType(v: string | null | undefined): string {
  const x = (v ?? '').trim()
  if (x === '海运' || x === 'ocean') return 'ocean'
  if (x === '平台物流' || x === 'platform') return 'platform'
  if (x === '尾程派送' || x === 'last_mile') return 'last_mile'
  return 'express'
}

export function toUiActiveStatus(v: string | null | undefined): UiActiveStatus {
  return (v ?? '').toLowerCase() === 'disabled' || v === '停用' ? '停用' : '启用'
}

export function toDbActiveStatus(v: string | null | undefined): string {
  return v === '停用' || (v ?? '').toLowerCase() === 'disabled' ? 'disabled' : 'active'
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const x = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(x.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}`
}

export function formatDateOnly(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const x = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(x.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export const UI_SHOP_AUTH_STATUSES = ['已授权', '待授权', '授权失效', '连接中', '草稿'] as const
export type UiShopAuthStatus = (typeof UI_SHOP_AUTH_STATUSES)[number]

export function toUiShopAuthStatus(status: string | null | undefined, authExpiresAt?: Date | null): UiShopAuthStatus {
  const s = (status ?? 'draft').toLowerCase()
  if (s === 'active') {
    if (authExpiresAt && authExpiresAt.getTime() < Date.now()) return '授权失效'
    return '已授权'
  }
  if (s === 'connecting') return '连接中'
  if (s === 'error') return '授权失效'
  if (s === 'disabled') return '授权失效'
  if (s === 'draft') return '草稿'
  return '待授权'
}

export function toUiFulfillmentMode(v: string | null | undefined): string {
  switch ((v ?? '').toLowerCase()) {
    case 'fbp':
      return '平台仓'
    case 'hybrid':
      return '混合'
    default:
      return '自营仓发货'
  }
}

export function toDbFulfillmentMode(v: string | null | undefined): string {
  if (v === '平台仓' || v === 'fbp') return 'fbp'
  if (v === '混合' || v === 'hybrid') return 'hybrid'
  return 'fbm'
}
