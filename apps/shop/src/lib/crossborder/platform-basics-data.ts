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

export type DictionaryCategory = {
  key: string
  label: string
  description: string
  shared: boolean
  values: string[]
}

export const INITIAL_DICTIONARIES: DictionaryCategory[] = [
  { key: 'product_brand', label: '品牌', description: '商品品牌主数据', shared: true, values: ['HELLO COSMOS', 'LinkForge', '其他'] },
  { key: 'product_category', label: '商品品类', description: '支持父子级分类，商品/SPU 共用；多级品类在「品类树」维护', shared: true, values: ['服装', '家居', '配饰', '数码/电脑配件', '美妆个护', '户外运动'] },
  { key: 'product_color', label: '颜色', description: '商品规格标准色；别名可归一到标准值', shared: true, values: ['黑色', '白色', '深灰色', '蓝色', '红色'] },
  { key: 'product_size', label: '尺码', description: '商品规格标准尺码', shared: true, values: ['M', 'L', 'XL', '2XL', '3XL', '4XL'] },
  { key: 'fulfillment_mode', label: '履约模式', description: '店铺可选；决定包裹状态流程', shared: true, values: ['LGS', 'JSB 灰清'] },
  { key: 'warehouse_type', label: '仓库类型', description: '仓库主档使用', shared: true, values: ['自营仓', '3PL 仓', '供应商仓'] },
  { key: 'purchase_reason', label: '采购原因', description: '采购申请和采购单共用；按单据类型限制可选值', shared: true, values: ['常规补货', '新品首单', '活动备货', '缺货补单', '样品采购'] },
  { key: 'purchase_priority', label: '采购优先级', description: '采购申请和采购单共用；决定审批与排期顺序', shared: true, values: ['普通', '紧急', '低'] },
  { key: 'stock_in_type', label: '入库类型', description: '仅入库单使用；不同入库类型对应不同来源单据', shared: true, values: ['采购入库', '调拨入库', '退货入库', '盘盈入库', '其他入库'] },
  { key: 'stock_out_type', label: '出库类型', description: '仅出库单使用；不同出库类型对应不同去向', shared: true, values: ['销售出库', '调拨出库', '采购退货', '盘亏出库', '其他出库'] },
  { key: 'stock_adjustment_type', label: '库存调整类型', description: '仅盘点与调整使用；区分盘盈、盘亏和报废', shared: true, values: ['盘盈', '盘亏', '质量报废', '库位调整'] },
  { key: 'aftersale_type', label: '售后类型', description: '售后单使用；决定后续质检和回库流程', shared: true, values: ['仅退款', '退货退款', '换货', '补发'] },
  { key: 'qc_status', label: '质检状态', description: '退货质检使用；可售、残次、报废多级结果', shared: true, values: ['待检', '可售', '残次', '报废'] },
  { key: 'package_condition', label: '外包装状况', description: '退货质检和入库验收使用', shared: true, values: ['完好', '轻微破损', '严重破损', '缺件'] },
  { key: 'platform_sync_status', label: '平台同步状态', description: '刊登、售后和订单同步共用', shared: true, values: ['待同步', '同步中', '已同步', '同步失败'] },
  { key: 'review_sentiment', label: '评论情感', description: '评论分析使用；支持按业务需要新增自定义标签', shared: true, values: ['正面', '中性', '负面'] },
]
