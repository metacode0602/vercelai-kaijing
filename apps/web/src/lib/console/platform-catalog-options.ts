export const PLATFORM_CARRIER_TYPES = [
  { value: 'platform', label: '平台物流' },
  { value: 'express', label: '国际快递' },
  { value: 'ocean', label: '海运' },
  { value: 'last_mile', label: '尾程派送' },
] as const

export type PlatformCarrierType = (typeof PLATFORM_CARRIER_TYPES)[number]['value']

export const PLATFORM_TARIFF_COUNTRIES = ['LK', 'MY', 'SG', 'TH', 'VN', 'ID', 'PH'] as const

export const PLATFORM_TARIFF_FORMULAS = [
  { id: 'lk_cascade_v1', label: '斯里兰卡级联税栈', countries: ['LK'] },
  { id: 'lk_uplift_v1', label: '斯里兰卡旧口径对照', countries: ['LK'] },
  { id: 'my_sst_v1', label: '马来西亚 SST', countries: ['MY'] },
  { id: 'sg_gst_v1', label: '新加坡 GST', countries: ['SG'] },
  { id: 'th_vat_v1', label: '泰国 VAT', countries: ['TH'] },
  { id: 'vn_vat_v1', label: '越南 VAT', countries: ['VN'] },
  { id: 'id_ppn_v1', label: '印尼 PPN', countries: ['ID'] },
  { id: 'ph_vat_v1', label: '菲律宾 VAT', countries: ['PH'] },
] as const

export const FEE_TEMPLATE_TYPES = [
  { value: 'import_tax', label: '进口税' },
  { value: 'platform_fee', label: '平台费' },
  { value: 'ocean_freight', label: '海运运费' },
] as const
