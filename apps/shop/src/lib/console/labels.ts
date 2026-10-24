/**
 * User-facing Chinese labels for console enums / field names.
 * Underlying values (API statuses, SKUs, tax codes) stay unchanged.
 */

const STATUS_LABELS: Record<string, string> = {
  // shops
  active: '已启用',
  error: '异常',
  connecting: '连接中',
  draft: '草稿',
  success: '正常',
  idle: '空闲',

  // candidates
  new: '新候选',
  accepted: '已接受',
  GO: '通过',
  HOLD: '搁置',
  CONDITIONAL: '有条件',
  NO_GO: '否决',

  // pending
  pending: '待审',
  approved: '已通过',
  rejected: '已拒绝',
  listing_submit: '刊登提交',
  inventory_push: '库存推送',
  price_change: '改价',
  publish: '刊登',

  // listings / products
  live: '在售',
  failed: '失败',
  pending_review: '待审',
  INACTIVE: '未激活',
  PENDING: '待处理',
  ACTIVE: '已激活',
  DRAFT: '草稿',
  REJECTED: '已拒绝',

  // product source
  sourcing: '选品',
  import: '导入',
  manual: '手工',

  // orders
  created: '已创建',
  paid: '已付款',
  ready_to_ship: '待发货',
  shipped: '已发货',
  delivered: '已签收',
  cancelled: '已取消',

  // inventory
  critical: '紧急',
  open: '开放',
  none: '无告警',
  below_threshold: '低于阈值',
  critical_age: '库龄过高',
  healthy: '健康',

  // members
  owner: '所有者',
  member: '成员',
  admin: '管理员',

  // cost components
  purchase: '采购',
  freight: '头程运费',
  customs: '关税',
  duty: '关税',
  other: '其他',
  landed: '到仓合计',
}

/** Map a status / enum code to Chinese UI text. Unknown values pass through. */
export function labelStatus(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  return STATUS_LABELS[value] ?? value
}

/** Build filter options with Chinese labels; values stay as raw codes. */
export function labeledOptions(values: readonly string[]): { value: string; label: string }[] {
  return values.map((value) => ({ value, label: labelStatus(value) }))
}

/** Common field-name → Chinese label for detail grids / table heads. */
const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  sku: 'SKU',
  variantId: '变体 ID',
  barcode: '条码',
  status: '状态',
  source: '来源',
  updatedAt: '更新时间',
  submittedAt: '提交时间',
  liveAt: '上架时间',
  paidAt: '付款时间',
  placedAt: '下单时间',
  attrs: '属性',
  'payload.description': '描述',
  'product.id': '商品 ID',
  'variant.sku': '变体 SKU',
  categoryHint: '类目提示',
  competition: '竞争度',
  risk: '风险',
  url: '链接',
  demand: '需求',
  margin: '毛利',
  purchase: '采购',
  freight: '头程运费',
  customs: '关税',
  PAL: 'PAL',
  CESS: 'CESS',
  VAT: 'VAT',
  SSCL: 'SSCL',
  landed: '到仓合计',
  component: '费用项',
  amount: '金额',
  note: '备注',
  shopId: '店铺 ID',
  shopName: '店铺',
  shop: '店铺',
  platform: '平台',
  externalItemId: '平台商品 ID',
  externalOrderId: '平台订单号',
  externalShopId: '平台店铺 ID',
  externalSettlementId: '平台结算 ID',
  platformSku: '平台 SKU',
  brandExternalId: '品牌外部 ID',
  brandName: '品牌',
  categoryExternalId: '类目外部 ID',
  categoryPath: '类目路径',
  publishState: '发布状态',
  lastError: '最近错误',
  slug: '标识',
  region: '区域',
  marketplaceCountry: '市场国家',
  timezone: '时区',
  sellerName: '卖家名',
  currency: '币种',
  authExpiresAt: '授权到期',
  lastSyncAt: '最近同步',
  meta: '元数据',
  kind: '类型',
  mask: '脱敏密钥',
  expiresAt: '到期时间',
  ageDays: '库龄（天）',
  reorderSignal: '补货信号',
  totalAmount: '订单金额',
  'raw.shippingAmount': '运费',
  'raw.city': '城市',
  'raw.buyerNameMask': '买家（脱敏）',
  'raw.shipping': '收货信息',
  'currency / totalAmount': '币种 / 金额',
  period: '账期',
  publish: '发布',
}

export function labelField(key: string): string {
  return FIELD_LABELS[key] ?? key
}
