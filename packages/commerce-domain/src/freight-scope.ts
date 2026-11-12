import { currencyModeOf, sumMoneyByCurrency, type CurrencyMode } from "./money"

/** 从装箱明细读取海运费用：只认已有字段，缺额保持为空，绝不虚构。 */
export const OCEAN_FREIGHT_AMOUNT_KEYS = ["freightAmount", "totalFreight", "amount"] as const

export function normalizePortToken(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
}

const SRI_LANKA_DEST_TOKENS = new Set(["CMB", "COLOMBO", "LK", "LKCMB", "SRILANKA"])

/**
 * 目的港是否可识别为斯里兰卡（CMB / Colombo / LK / LKCMB 等）。
 * 空值或无法识别的港口不得当作 LK 运费。
 */
export function isSriLankaDestPort(value: string | null | undefined): boolean {
  const raw = value?.trim()
  if (!raw) return false
  const token = normalizePortToken(raw)
  if (!token) return false
  if (SRI_LANKA_DEST_TOKENS.has(token)) return true
  if (token.includes("COLOMBO") || token.includes("SRILANKA")) return true
  if (token.startsWith("LK") && token.includes("CMB")) return true
  return false
}

export function isDarazPlatform(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "daraz"
}

export function readOceanFreightAmount(packingDetails: unknown): {
  amount: number | null
  currency: string
} {
  const details =
    packingDetails && typeof packingDetails === "object" && !Array.isArray(packingDetails)
      ? (packingDetails as Record<string, unknown>)
      : {}
  let amount: number | null = null
  for (const key of OCEAN_FREIGHT_AMOUNT_KEYS) {
    const raw = details[key]
    if (raw == null || raw === "") continue
    const parsed = typeof raw === "number" ? raw : Number(raw)
    if (Number.isFinite(parsed)) {
      amount = parsed
      break
    }
  }
  const currencyRaw = details.currency
  const currency =
    typeof currencyRaw === "string" && currencyRaw.trim() ? currencyRaw.trim().toUpperCase() : "USD"
  return { amount, currency }
}

export type FreightUnionSource = "fee_template" | "ocean" | "freight_rate_card"

export type FreightUnionItem = {
  id: string
  code: string
  name: string
  platform: string | null
  country: string | null
  type: string | null
  status: string | null
  pool: string | null
  source: FreightUnionSource
  amount: number | null
  currency: string | null
  destPort: string | null
  effectiveFrom: string | null
  note: string
}

export type OceanShipmentFreightRow = {
  id: string
  lotCode: string
  platform?: string | null
  destPort?: string | null
  originPort?: string | null
  freightMode?: string | null
  status?: string | null
  etd?: string | null
  notes?: string | null
  packingDetails?: unknown
}

export type FreightRateCardRow = {
  id: string
  code: string
  name: string
  currency?: string | null
  unitRate?: number | string | null
  status?: string | null
  destPort?: string | null
  originPort?: string | null
  freightMode?: string | null
  effectiveFrom?: string | Date | null
  note?: string | null
}

export type FeeTemplateFreightRow = {
  id: string
  code: string
  name: string
  platform?: string | null
  country?: string | null
  status?: string | null
  type?: string | null
}

/** 海运柜次：必须是 Daraz 且目的港可识别为斯里兰卡，否则排除。 */
export function oceanLotToFreightItem(row: OceanShipmentFreightRow): FreightUnionItem | null {
  if (!isDarazPlatform(row.platform)) return null
  if (!isSriLankaDestPort(row.destPort)) return null
  const money = readOceanFreightAmount(row.packingDetails)
  return {
    id: row.id,
    code: row.lotCode,
    name: `海运柜次 ${row.lotCode}`,
    platform: "daraz",
    country: row.destPort?.trim() || "LK",
    type: row.freightMode || "ocean",
    status: row.status ?? null,
    pool: row.originPort || row.destPort || "—",
    source: "ocean",
    amount: money.amount,
    currency: money.currency,
    destPort: row.destPort ?? null,
    effectiveFrom: row.etd ?? null,
    note: row.notes ?? "",
  }
}

/** 运价卡：按目的港识别斯里兰卡；空或无法识别则排除，不假装为 LK。 */
export function rateCardToFreightItem(row: FreightRateCardRow): FreightUnionItem | null {
  if (!isSriLankaDestPort(row.destPort)) return null
  const raw = row.unitRate
  const parsed = raw == null || raw === "" ? Number.NaN : typeof raw === "number" ? raw : Number(raw)
  const amount = Number.isFinite(parsed) ? parsed : null
  const currency = row.currency?.trim() ? row.currency.trim().toUpperCase() : "USD"
  const origin = row.originPort?.trim() || ""
  const dest = row.destPort?.trim() || ""
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    platform: "freight_rate_card",
    country: dest || "LK",
    type: row.freightMode ?? null,
    status: row.status ?? null,
    pool: origin && dest ? `${origin}→${dest}` : origin || dest || "—",
    source: "freight_rate_card",
    amount,
    currency,
    destPort: row.destPort ?? null,
    effectiveFrom:
      row.effectiveFrom instanceof Date ? row.effectiveFrom.toISOString() : (row.effectiveFrom ?? null),
    note: row.note ?? "",
  }
}

export function feeTemplateToFreightItem(row: FeeTemplateFreightRow): FreightUnionItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    platform: row.platform ?? null,
    country: row.country ?? null,
    type: row.type ?? null,
    status: row.status ?? null,
    pool: "—",
    source: "fee_template",
    amount: null,
    currency: null,
    destPort: row.country ?? null,
    effectiveFrom: null,
    note: "",
  }
}

export function assembleFreightUnion(input: {
  templates: FeeTemplateFreightRow[]
  oceanLots: OceanShipmentFreightRow[]
  rateCards: FreightRateCardRow[]
}): {
  items: FreightUnionItem[]
  feeTemplates: FreightUnionItem[]
  oceanShipments: FreightUnionItem[]
  freightRateCards: FreightUnionItem[]
  excludedOceanCount: number
  excludedRateCardCount: number
  currencyMode: CurrencyMode
  currency: string | null
  currencies: string[]
  total: number | null
  byCurrency: Array<{ currency: string; total: number }>
  dataAvailable: boolean
  message: string
} {
  const feeTemplates = input.templates.map(feeTemplateToFreightItem)
  const oceanShipments: FreightUnionItem[] = []
  let excludedOceanCount = 0
  for (const row of input.oceanLots) {
    const item = oceanLotToFreightItem(row)
    if (item) oceanShipments.push(item)
    else excludedOceanCount += 1
  }
  const freightRateCards: FreightUnionItem[] = []
  let excludedRateCardCount = 0
  for (const row of input.rateCards) {
    const item = rateCardToFreightItem(row)
    if (item) freightRateCards.push(item)
    else excludedRateCardCount += 1
  }
  const items = [...feeTemplates, ...oceanShipments, ...freightRateCards]
  const moneyRows = items.filter((row) => row.amount != null)
  const summary = sumMoneyByCurrency(moneyRows)
  const hasData = items.length > 0
  const excludedHint =
    excludedOceanCount + excludedRateCardCount > 0
      ? `另有 ${excludedOceanCount} 条海运柜次、${excludedRateCardCount} 条运价卡因目的港无法识别为斯里兰卡或平台不是 Daraz，已排除，不会当作 LK 运费。`
      : ""
  const hints: string[] = []
  if (summary.currencyMode === "mixed") {
    hints.push("金额含多种币种，已按币种分列，未做跨币种合计。")
  }
  if (oceanShipments.some((row) => row.amount == null)) {
    hints.push("部分海运柜次装箱明细没有运费金额，已保持为空，不视为 0。")
  }
  const moneyHint = hints.join("")
  return {
    items,
    feeTemplates,
    oceanShipments,
    freightRateCards,
    excludedOceanCount,
    excludedRateCardCount,
    ...summary,
    dataAvailable: hasData,
    message: hasData
      ? [
          "运费由费用模板、海运柜次与运价卡三源组成，不存在 freight_estimates 表，以上为现有资料的只读合并，未生成估算行。",
          moneyHint,
          excludedHint,
        ]
          .filter(Boolean)
          .join("")
      : "运费资料暂无数据，不视为 0 成功。",
  }
}

export { currencyModeOf }
