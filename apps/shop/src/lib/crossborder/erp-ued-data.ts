import { DEMO_IMAGES } from './demo-images'

export type DemoStatus = '待确认' | '启用' | '停用' | '待审核' | '已审核' | '已驳回' | '待收货' | '部分收货' | '待质检' | '已入库' | '异常'

export type DemoProduct = {
  spu: string
  name: string
  brand: string
  category: string
  owner: string
  status: DemoStatus
  skuCount: number
  material: string
  style: string
  coverImage?: string
  images?: string[]
  variants: DemoSku[]
}

export type DemoSku = {
  code: string
  color: string
  size: string
  pack: string
  barcode: string
  weight: number
  /** 长 / 宽 / 高（毫米），对齐 product_variants.length_mm 等 */
  lengthMm: number
  widthMm: number
  heightMm: number
  status: DemoStatus
  coverImage?: string
  images?: string[]
}

export type DemoSupplier = {
  code: string
  name: string
  contact: string
  phone: string
  sku: string
  factoryCode: string
  price: number
  currency: string
  leadDays: number
  preferred: boolean
  status: DemoStatus
}

export type DemoSupplierMaster = {
  code: string
  name: string
  contact: string
  phone: string
  email: string
  settlement: string
  status: DemoStatus
  note: string
}

export type DemoMapping = {
  shop: string
  platform: string
  site: string
  itemId: string
  /** 平台 SKU / 变体 ID，独立于 itemId / sellerSku / internalSku */
  platformSkuId: string
  sellerSku: string
  internalSku: string
  color: string
  size: string
  listingStatus: string
  mappingStatus: DemoStatus
}

export type DemoPurchase = {
  id: string
  applicant: string
  sku: string
  quantity: number
  supplier: string
  unitPrice: number
  currency: string
  warehouse: string
  reason: string
  status: DemoStatus
  approver: string
  received: number
  passed: number
}

export type DemoInventory = {
  sku: string
  name: string
  warehouse: string
  bin: string
  onHand: number
  reserved: number
  damaged: number
  inbound: number
  threshold: number
}

export type DemoAfterSale = {
  id: string
  order: string
  sku: string
  type: string
  reason: string
  refund: number
  currency: string
  returned: number
  qc: string
  status: DemoStatus
}

export type DemoImport = {
  id: string
  file: string
  kind: string
  createdAt: string
  success: number
  errors: number
  status: DemoStatus
  rollback: string
}

export const ERP_DEMO_PRODUCTS: DemoProduct[] = [
  { spu: 'HSY000001', name: 'Oversized Cotton Tee', brand: 'HELLO COSMOS', category: '服装 / 上衣 / T恤', owner: '李萍', status: '启用', skuCount: 3, material: '纯棉', style: '落肩宽松', coverImage: DEMO_IMAGES.teeBlack, images: [DEMO_IMAGES.teeBlack, DEMO_IMAGES.teeWhite, DEMO_IMAGES.teeGrey], variants: [
    { code: 'HSY000001001', color: '黑色', size: 'L', pack: '单件', barcode: '8901001001001', weight: 220, lengthMm: 720, widthMm: 520, heightMm: 15, status: '启用', coverImage: DEMO_IMAGES.teeBlack, images: [DEMO_IMAGES.teeBlack, DEMO_IMAGES.teeWhite] },
    { code: 'HSY000001002', color: '白色', size: 'L', pack: '单件', barcode: '8901001001002', weight: 218, lengthMm: 720, widthMm: 520, heightMm: 15, status: '启用', coverImage: DEMO_IMAGES.teeWhite, images: [DEMO_IMAGES.teeWhite, DEMO_IMAGES.teeGrey] },
    { code: 'HSY000001003', color: '深灰色', size: 'XL', pack: '单件', barcode: '8901001001003', weight: 226, lengthMm: 740, widthMm: 540, heightMm: 15, status: '待确认', coverImage: DEMO_IMAGES.teeGrey, images: [DEMO_IMAGES.teeGrey] },
  ] },
  { spu: 'HSY000002', name: 'USB-C Hub 7-in-1', brand: 'LinkForge', category: '数码 / 电脑配件', owner: '张鑫德', status: '启用', skuCount: 1, material: '铝合金', style: '7口扩展坞', coverImage: DEMO_IMAGES.hub, images: [DEMO_IMAGES.hub], variants: [
    { code: 'HSY000002001', color: '灰色', size: '标准', pack: '单件', barcode: '8901001002002', weight: 95, lengthMm: 120, widthMm: 80, heightMm: 25, status: '启用', coverImage: DEMO_IMAGES.hub, images: [DEMO_IMAGES.hub] },
  ] },
]

export const ERP_DEMO_SUPPLIERS: DemoSupplier[] = [
  { code: 'SUP-0001', name: '厦门优品服饰有限公司', contact: '陈先生', phone: '138****1022', sku: 'HSY000001001', factoryCode: 'TEE-001-BK-L', price: 28, currency: 'CNY', leadDays: 12, preferred: true, status: '启用' },
  { code: 'SUP-0002', name: '泉州联创数码配件厂', contact: '林女士', phone: '159****8841', sku: 'HSY000002001', factoryCode: 'HUB-01', price: 62, currency: 'CNY', leadDays: 18, preferred: true, status: '启用' },
]

export const ERP_DEMO_SUPPLIER_MASTERS: DemoSupplierMaster[] = [
  { code: 'SUP-0001', name: '厦门优品服饰有限公司', contact: '陈先生', phone: '138****1022', email: 'chen@xmyoupin.example', settlement: '月结 30 天', status: '启用', note: 'T恤类主力供应商' },
  { code: 'SUP-0002', name: '泉州联创数码配件厂', contact: '林女士', phone: '159****8841', email: 'lin@qzliangchuang.example', settlement: '月结 15 天', status: '启用', note: '数码配件供应商' },
  { code: 'SUP-0003', name: '汕头华彩印务', contact: '待补充', phone: '—', email: '—', settlement: '现结', status: '停用', note: '包装印刷备选供应商' },
]

export const ERP_DEMO_MAPPINGS: DemoMapping[] = [
  { shop: 'Lazada MY', platform: 'Lazada', site: 'MY', itemId: 'MY-ITEM-8802', platformSkuId: 'MY-SKU-8802-BLK-L', sellerSku: 'TEE-BLK-L', internalSku: 'HSY000001001', color: 'Black', size: 'L', listingStatus: '在线', mappingStatus: '启用' },
  { shop: 'Daraz LK', platform: 'Daraz', site: 'LK', itemId: 'LK-ITEM-5201', platformSkuId: 'LK-SKU-5201-01', sellerSku: 'DZ-HUB-01', internalSku: 'HSY000002001', color: 'Grey', size: 'Standard', listingStatus: '在线', mappingStatus: '启用' },
  { shop: 'Daraz LK', platform: 'Daraz', site: 'LK', itemId: 'LK-ITEM-9011', platformSkuId: 'LK-SKU-9011-OLD', sellerSku: 'TEE-OLD-BLACK', internalSku: '—', color: 'Black', size: 'M', listingStatus: '在线', mappingStatus: '异常' },
]

export const ERP_DEMO_PURCHASES: DemoPurchase[] = [
  { id: 'PR-2026-0012', applicant: '李萍', sku: 'HSY000001001', quantity: 100, supplier: '厦门优品服饰有限公司', unitPrice: 28, currency: 'CNY', warehouse: 'WH-CN-XMN-001', reason: '补货', status: '待审核', approver: '杨洁 / 黄发聪', received: 0, passed: 0 },
  { id: 'PR-2026-0011', applicant: '杨洁', sku: 'HSY000002001', quantity: 50, supplier: '泉州联创数码配件厂', unitPrice: 62, currency: 'CNY', warehouse: 'WH-CN-XMN-001', reason: '订单采购', status: '已审核', approver: '黄发聪', received: 0, passed: 0 },
  { id: 'PR-2026-0009', applicant: '黄发聪', sku: 'HSY000001002', quantity: 80, supplier: '厦门优品服饰有限公司', unitPrice: 29, currency: 'CNY', warehouse: 'WH-CN-XMN-001', reason: '备货', status: '部分收货', approver: '杨洁', received: 40, passed: 32 },
]

export const ERP_DEMO_INVENTORY: DemoInventory[] = [
  { sku: 'HSY000001001', name: 'Oversized Cotton Tee · 黑色 L', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-01', onHand: 46, reserved: 8, damaged: 2, inbound: 60, threshold: 20 },
  { sku: 'HSY000001002', name: 'Oversized Cotton Tee · 白色 L', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-02', onHand: 12, reserved: 3, damaged: 0, inbound: 0, threshold: 20 },
  { sku: 'HSY000002001', name: 'USB-C Hub 7-in-1 · 标准', warehouse: 'WH-CN-XMN-001', bin: 'B-02-01-01', onHand: 85, reserved: 5, damaged: 1, inbound: 0, threshold: 15 },
]

export const ERP_DEMO_AFTERSALES: DemoAfterSale[] = [
  { id: 'AS-2026-0081', order: 'DZ-10018', sku: 'HSY000002001', type: '退货退款', reason: '商品不符合预期', refund: 24, currency: 'USD', returned: 1, qc: '待质检', status: '待确认' },
  { id: 'AS-2026-0079', order: 'DZ-10012', sku: 'HSY000001001', type: '仅退款', reason: '物流延迟补偿', refund: 3, currency: 'USD', returned: 0, qc: '不适用', status: '已审核' },
]

export const ERP_DEMO_IMPORTS: DemoImport[] = [
  { id: 'IMP-2026-0021', file: 'seller_sku_mapping_oct.xlsx', kind: '刊登映射', createdAt: '2026-10-28 10:25', success: 126, errors: 4, status: '异常', rollback: '可撤销' },
  { id: 'IMP-2026-0020', file: 'opening_inventory.xlsx', kind: '期初库存', createdAt: '2026-10-27 17:10', success: 83, errors: 0, status: '已审核', rollback: '可撤销' },
]

export const ERP_DEMO_BINS = [
  { warehouse: 'WH-CN-XMN-001', code: 'A-01-01-01', sku: 'HSY000001001', status: '占用' },
  { warehouse: 'WH-CN-XMN-001', code: 'A-01-01-02', sku: 'HSY000001002', status: '占用' },
  { warehouse: 'WH-CN-XMN-001', code: 'B-02-01-01', sku: 'HSY000002001', status: '占用' },
  { warehouse: 'WH-CN-XMN-001', code: 'C-01-01-01', sku: '—', status: '空闲' },
]

export const ERP_DEMO_AUDIT_LOGS = [
  { at: '2026-10-28 10:25', actor: '李萍', action: '导入 Seller SKU 映射', object: 'IMP-2026-0021', result: '部分成功', detail: '126 行成功，4 行需修复' },
  { at: '2026-10-28 09:50', actor: '黄发聪', action: '审核采购申请', object: 'PR-2026-0011', result: '已审核', detail: '杨洁申请，由黄发聪审批' },
  { at: '2026-10-28 09:02', actor: '系统', action: '订单同步', object: 'Lazada MY', result: '未连接', detail: '示例状态；尚未接入真实接口' },
]

export const ERP_DEMO_ROLES = [
  { role: '公司负责人', person: '蔡值', scope: '全业务', permissions: '只读', note: '角色矩阵待业务确认' },
  { role: 'ERP业务负责人', person: '杨洁', scope: '全业务统筹', permissions: '管理 / 审核', note: '不能自审采购申请' },
  { role: '采购负责人', person: '黄发聪', scope: '全业务，以采购为主', permissions: '管理 / 审核', note: '与杨洁互审' },
  { role: 'Lazada运营', person: '李萍、张鑫德', scope: 'Lazada 五国', permissions: '运营 / 查看库存 / 申请采购', note: '无采购审核权' },
  { role: 'Daraz运营', person: '蔡利达', scope: 'Daraz', permissions: '运营 / 查看库存 / 申请采购', note: '无采购审核权' },
  { role: '美工', person: '郑惠蓉', scope: '商品素材', permissions: '素材维护 / 申请采购', note: '范围需确认' },
  { role: '运营助理', person: '兰雨晨', scope: '授权范围', permissions: '协助操作 / 申请采购', note: '范围需确认' },
  { role: '外部 IT', person: '开发人员', scope: '技术排查', permissions: '技术配置', note: '不得默认拥有业务操作权' },
]

/** Demo listing rows for master/SKU/mapping related-info tables (mock). */
export type DemoListing = {
  id: string
  spu: string
  sku: string
  shop: string
  platform: string
  site: string
  sellerSku: string
  title: string
  /** 售价 */
  sellPrice: number
  currency: string
  status: string
  stockOnHand: number
  updatedAt: string
  note?: string
}

/**
 * Mock 刊登列表 — bridges ERP master SKUs (HSY*) to console listing detail pages
 * where an ops listing already exists (e.g. lst-tee-daraz). Rows marked as 示例数据.
 */
export const ERP_DEMO_LISTINGS: DemoListing[] = [
  {
    id: 'lst-tee-daraz',
    spu: 'HSY000001',
    sku: 'HSY000001001',
    shop: 'Daraz LK · Demo',
    platform: 'Daraz',
    site: 'LK',
    sellerSku: 'DZ-TEE-001',
    title: 'Oversized Cotton Tee · Black L',
    sellPrice: 12.5,
    currency: 'USD',
    status: '草稿',
    stockOnHand: 12,
    updatedAt: '2026-10-20',
    note: '示例数据 · 对齐 ops listing lst-tee-daraz',
  },
  {
    id: 'lst-tee-lazada',
    spu: 'HSY000001',
    sku: 'HSY000001001',
    shop: 'Lazada MY · Sandbox',
    platform: 'Lazada',
    site: 'MY',
    sellerSku: 'TEE-BLK-L',
    title: 'Oversized Cotton Tee',
    sellPrice: 55.0,
    currency: 'MYR',
    status: '待审',
    stockOnHand: 0,
    updatedAt: '2026-10-19',
    note: '示例数据 · 对齐 mapping Lazada MY::TEE-BLK-L',
  },
  {
    id: 'lst-tee-white-daraz',
    spu: 'HSY000001',
    sku: 'HSY000001002',
    shop: 'Daraz LK · Demo',
    platform: 'Daraz',
    site: 'LK',
    sellerSku: 'DZ-TEE-001-WH',
    title: 'Oversized Cotton Tee · White L',
    sellPrice: 12.9,
    currency: 'USD',
    status: '在售',
    stockOnHand: 8,
    updatedAt: '2026-10-18',
    note: '示例数据 · 白色 SKU 演示刊登',
  },
  {
    id: 'lst-hub-daraz',
    spu: 'HSY000002',
    sku: 'HSY000002001',
    shop: 'Daraz LK · Demo',
    platform: 'Daraz',
    site: 'LK',
    sellerSku: 'DZ-HUB-01',
    title: 'USB-C Hub 7-in-1 PD 100W',
    sellPrice: 24.0,
    currency: 'USD',
    status: '在售',
    stockOnHand: 80,
    updatedAt: '2026-10-19',
    note: '示例数据 · 对齐 ops listing lst-hub-daraz',
  },
]

/** Demo 主定价 for internal SKUs (mock). */
export type DemoSkuPricing = {
  sku: string
  currency: string
  /** 采购 / 到仓成本参考 */
  costPrice: number
  /** 主定价（基准售价） */
  basePrice: number
  /** 建议售价 */
  suggestPrice: number
  targetMarginPct: number
  effective: string
  source: string
}

export const ERP_DEMO_SKU_PRICING: DemoSkuPricing[] = [
  {
    sku: 'HSY000001001',
    currency: 'USD',
    costPrice: 5.98,
    basePrice: 12.5,
    suggestPrice: 12.5,
    targetMarginPct: 35,
    effective: '2026-10-01',
    source: '示例主定价 · mock',
  },
  {
    sku: 'HSY000001002',
    currency: 'USD',
    costPrice: 6.1,
    basePrice: 12.9,
    suggestPrice: 12.9,
    targetMarginPct: 34,
    effective: '2026-10-01',
    source: '示例主定价 · mock',
  },
  {
    sku: 'HSY000001003',
    currency: 'USD',
    costPrice: 6.2,
    basePrice: 13.5,
    suggestPrice: 13.5,
    targetMarginPct: 33,
    effective: '2026-10-15',
    source: '示例主定价 · mock · 待确认 SKU',
  },
  {
    sku: 'HSY000002001',
    currency: 'USD',
    costPrice: 13.15,
    basePrice: 24.0,
    suggestPrice: 24.0,
    targetMarginPct: 32,
    effective: '2026-09-15',
    source: '示例主定价 · mock',
  },
]

export function getDemoListingsBySpu(spu: string) {
  return ERP_DEMO_LISTINGS.filter((item) => item.spu === spu)
}

export function getDemoListingsBySku(sku: string) {
  return ERP_DEMO_LISTINGS.filter((item) => item.sku === sku)
}

export function getDemoListingsBySellerSku(shop: string, sellerSku: string) {
  return ERP_DEMO_LISTINGS.filter(
    (item) =>
      (item.shop.startsWith(shop) || item.shop.includes(shop)) && item.sellerSku === sellerSku,
  )
}

export function getDemoSkuPricing(sku: string) {
  return ERP_DEMO_SKU_PRICING.find((item) => item.sku === sku) ?? null
}

export function findProductBySku(sku: string) {
  return ERP_DEMO_PRODUCTS.find((product) => product.variants.some((variant) => variant.code === sku)) ?? null
}

export function findSupplierMasterByName(name: string) {
  return ERP_DEMO_SUPPLIER_MASTERS.find((item) => item.name === name) ?? null
}
