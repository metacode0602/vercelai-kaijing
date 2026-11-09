export type CurrencyRecord = {
  code: string
  name: string
  symbol: string
  decimals: number
  status: 'active' | 'inactive'
}

export type CountryRecord = {
  code: string
  name: string
  region: string
  timezone: string
  defaultCurrency: string
  status: 'active' | 'inactive'
}

export type PlatformRecord = {
  code: string
  name: string
  status: 'active' | 'inactive'
  countries: string[]
  apiReady: 'Connected' | 'Configuration required' | 'Planned'
}

export type WarehouseRecord = {
  code: string
  name: string
  type: string
  country: string
  timezone: string
  currency: string
  status: 'active' | 'inactive'
  shops: string[]
}

export const INITIAL_CURRENCIES: CurrencyRecord[] = [
  { code: 'CNY', name: '人民币', symbol: '¥', decimals: 2, status: 'active' },
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM', decimals: 2, status: 'active' },
  { code: 'PHP', name: '菲律宾比索', symbol: '₱', decimals: 2, status: 'active' },
  { code: 'SGD', name: '新加坡元', symbol: 'S$', decimals: 2, status: 'active' },
  { code: 'THB', name: '泰铢', symbol: '฿', decimals: 2, status: 'active' },
  { code: 'VND', name: '越南盾', symbol: '₫', decimals: 0, status: 'active' },
  { code: 'LKR', name: '斯里兰卡卢比', symbol: 'Rs', decimals: 2, status: 'active' },
]

export const INITIAL_COUNTRIES: CountryRecord[] = [
  { code: 'CN', name: '中国', region: '东亚', timezone: 'Asia/Shanghai', defaultCurrency: 'CNY', status: 'active' },
  { code: 'MY', name: '马来西亚', region: '东南亚', timezone: 'Asia/Kuala_Lumpur', defaultCurrency: 'MYR', status: 'active' },
  { code: 'PH', name: '菲律宾', region: '东南亚', timezone: 'Asia/Manila', defaultCurrency: 'PHP', status: 'active' },
  { code: 'SG', name: '新加坡', region: '东南亚', timezone: 'Asia/Singapore', defaultCurrency: 'SGD', status: 'active' },
  { code: 'TH', name: '泰国', region: '东南亚', timezone: 'Asia/Bangkok', defaultCurrency: 'THB', status: 'active' },
  { code: 'VN', name: '越南', region: '东南亚', timezone: 'Asia/Ho_Chi_Minh', defaultCurrency: 'VND', status: 'active' },
  { code: 'LK', name: '斯里兰卡', region: '南亚', timezone: 'Asia/Colombo', defaultCurrency: 'LKR', status: 'active' },
]

export const INITIAL_PLATFORMS: PlatformRecord[] = [
  { code: 'lazada', name: 'Lazada', status: 'active', countries: ['MY', 'PH', 'SG', 'TH', 'VN'], apiReady: 'Configuration required' },
  { code: 'daraz', name: 'Daraz', status: 'active', countries: ['LK'], apiReady: 'Configuration required' },
  { code: 'shopee', name: 'Shopee', status: 'inactive', countries: [], apiReady: 'Planned' },
  { code: 'tiktok_shop', name: 'TikTok Shop', status: 'inactive', countries: [], apiReady: 'Planned' },
]

export const INITIAL_WAREHOUSES: WarehouseRecord[] = [
  { code: 'WH-CN-XMN-001', name: '好时运厦门自营仓', type: '自营仓', country: 'CN', timezone: 'Asia/Shanghai', currency: 'CNY', status: 'active', shops: ['Lazada MY', 'Lazada PH', 'Lazada SG', 'Lazada TH', 'Lazada VN', 'Daraz LK'] },
]
