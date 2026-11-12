/**
 * 官方费率 / 类目佣金接口能力盘点。
 * 只依据仓库内已核验的平台 Open API 文档与现有 connector；没有可调用的费率表接口时不得假装已同步。
 *
 * 核查范围（2026-11-12）：
 * - packages/marketplace adapters/clients（Lazop: Daraz/Lazada；TikTok Shop）
 * - docs/design/platform-apis/{lazada,daraz,shopee,tiktok-shop}
 *
 * 结论：当前已接入或目录中的平台都没有「卖家费用表 / 类目佣金 / 支付费率 /
 * 仓杂 / 包邮佣金上限」的官方只读费率表接口。财务类接口返回的是订单或结算单上的
 * 历史费用行，不能当作官方费率表写入费用模板。
 */
export const OFFICIAL_FEE_SOURCE_MANUAL = 'manual' as const
export const OFFICIAL_FEE_SOURCE_SYNC = 'official_sync' as const

export type OfficialFeeCapabilityStatus = 'unsupported' | 'ready'

export type OfficialFeeCapability = {
  platform: string
  status: OfficialFeeCapabilityStatus
  supported: boolean
  reasonZh: string
  documentedEndpoints: string[]
  whyNotUsableZh: string
}

const TRANSACTION_DETAILS_NOTE =
  '财务接口只返回订单/结算单上的历史费用行（如佣金、支付费），不是类目佣金表或费率表，不能推断为官方费率并写入模板。'

const UNSUPPORTED_UI = '该平台暂无官方费率接口，仍使用本组织费用模板'

export const OFFICIAL_FEE_CAPABILITIES: Record<string, OfficialFeeCapability> = {
  daraz: {
    platform: 'daraz',
    status: 'unsupported',
    supported: false,
    reasonZh: UNSUPPORTED_UI,
    documentedEndpoints: ['/finance/transaction/details/get', '/finance/payout/status/get'],
    whyNotUsableZh: `Daraz Open API 已文档化的财务接口为结算状态与交易明细。${TRANSACTION_DETAILS_NOTE}类目接口只返回类目树和属性，不含佣金率。`,
  },
  lazada: {
    platform: 'lazada',
    status: 'unsupported',
    supported: false,
    reasonZh: UNSUPPORTED_UI,
    documentedEndpoints: [
      '/finance/transaction/details/get',
      '/finance/payout/status/get',
      '/finance/transaction/accountTransactions/query',
      '/lbs/slb/queryLogisticsFeeDetail',
    ],
    whyNotUsableZh: `Lazada Open API 财务域提供打款状态、账户流水、交易明细和物流费明细。${TRANSACTION_DETAILS_NOTE}类目接口（/category/tree/get、/category/attributes/get）不含佣金率。Seller Center 帮助页上的佣金说明不是 Open API，本同步不会去抓取。`,
  },
  tiktok_shop: {
    platform: 'tiktok_shop',
    status: 'unsupported',
    supported: false,
    reasonZh: UNSUPPORTED_UI,
    documentedEndpoints: [],
    whyNotUsableZh:
      '仓库内 TikTok Shop 文档与 connector 未列出可调用的官方费率表或类目佣金接口。现有财务同步面向订单结算，不能当作费率表。',
  },
  tiktok: {
    platform: 'tiktok',
    status: 'unsupported',
    supported: false,
    reasonZh: UNSUPPORTED_UI,
    documentedEndpoints: [],
    whyNotUsableZh: '同 tiktok_shop：暂无官方费率表接口。',
  },
  shopee: {
    platform: 'shopee',
    status: 'unsupported',
    supported: false,
    reasonZh: UNSUPPORTED_UI,
    documentedEndpoints: [],
    whyNotUsableZh: 'Shopee 尚在平台目录规划中，没有已接入的 OpenAPI 客户端，也未核验到可调用的官方费率表接口。',
  },
}

export function normalizeFeePlatform(platform: string): string {
  const raw = platform.trim().toLowerCase()
  if (raw === 'tiktok' || raw === 'tiktokshop') return 'tiktok_shop'
  return raw
}

export function getOfficialFeeCapability(platform: string): OfficialFeeCapability {
  const key = normalizeFeePlatform(platform)
  const known = OFFICIAL_FEE_CAPABILITIES[key]
  if (known) return known
  return {
    platform: key,
    status: 'unsupported',
    supported: false,
    reasonZh: UNSUPPORTED_UI,
    documentedEndpoints: [],
    whyNotUsableZh: '该平台未列入已核验的官方费率接口清单，不会发起模拟拉取。',
  }
}

export function officialFeeUnsupportedMessage(platform?: string): string {
  if (!platform) return UNSUPPORTED_UI
  return getOfficialFeeCapability(platform).reasonZh
}
