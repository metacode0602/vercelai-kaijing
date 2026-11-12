/**
 * 多平台定价建议：装载主档/柜次/汇率/费用模板/税则，调用 @workspace/freight 纯函数。
 * 不把建议价写入 listings.price_amount，也不写 products.payload / product_variants.attrs。
 * @see docs/design/multi-platform-pricing-calculator-ux-2026-11-11.md
 */
import { and, desc, eq, ne } from 'drizzle-orm'
import {
  allocateOceanFreightByActualCbm,
  cbmPerCartonCm,
  comparePlatformSuggestions,
  computeSuggestedPrices,
  computeTaxStack,
  currencyForCountry,
  marginAtSellPrice,
  normalizeHsCode,
  pieceCbm,
  pieceGrossKg,
  formulasForCountry,
  resolveFormulaForCountry,
  type FormulaVersion,
  type PlatformFeePercents,
} from '@workspace/freight'
import {
  commerceCartonSpecs,
  oceanShipmentLines,
  oceanShipments,
  productVariants,
  products,
  skuCosts,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { getPreferredForSku } from '@/lib/server/dataaccess/suppliers'
import { resolveFxRate } from '@/lib/server/dataaccess/fx-rates'
import { resolveFreightRateBundle } from '@/lib/server/dataaccess/freight-rate-cards'
import {
  listFeeTemplates,
  resolveFeeTemplateVersion,
  type FeeComponentDto,
  type ResolvedFeeTemplateDto,
} from '@/lib/server/dataaccess/fee-templates'
import { resolveHsTariff } from '@/lib/server/dataaccess/hs-tariffs'
import { listPendingOfficialFeeDrafts } from '@/lib/server/dataaccess/official-fee-sync'
import { listShopConnections } from '@/lib/server/dataaccess/shop-connections'
import { getSkuByCode } from '@/lib/server/dataaccess/products'
import { getOceanShipment, listOceanLotCostRelay } from '@/lib/server/dataaccess/ocean'

type DbLike = AppDatabase

export type PricingGapCode =
  | 'purchase'
  | 'carton'
  | 'gross_weight'
  | 'hs'
  | 'tariff'
  | 'fx'
  | 'fee_template'
  | 'freight'
  | 'formula'

export type PricingGap = {
  code: PricingGapCode
  labelZh: string
  detail: string
}

export type PricingBreakdownStep = {
  id: string
  labelZh: string
  input: string
  source: string
  currency: string
  result: number | null
  note?: string
}

export type TemporaryFeeOverride = {
  commissionPct?: number
  payoutPct?: number
  warehousePct?: number
  freeShippingPct?: number
  freeShippingCap?: number
  capCurrency?: string
  targetMarginPct?: number
}

export type SuggestPricingInput = {
  sku: string
  platform: string
  country: string
  shopId?: string
  targetMarginPct?: number
  formulaVersion?: FormulaVersion
  useFreightRateCardEstimate?: boolean
  temporaryFees?: TemporaryFeeOverride
  asOf?: string
  currentSellPrice?: number
  currentSellCurrency?: string
}

const COUNTRY_LABEL: Record<string, string> = {
  LK: '斯里兰卡',
  MY: '马来西亚',
  SG: '新加坡',
  ID: '印度尼西亚',
  TH: '泰国',
  PH: '菲律宾',
  VN: '越南',
  PK: '巴基斯坦',
  BD: '孟加拉',
}

function platformLabel(platform: string, country: string) {
  const p = platform.toLowerCase() === 'daraz' ? 'Daraz' : platform.toLowerCase() === 'lazada' ? 'Lazada' : platform
  return `${p} ${COUNTRY_LABEL[country.toUpperCase()] ?? country}`
}

function listingCurrencyFor(country: string): string {
  return currencyForCountry(country)
}

function n(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

function packingFreight(details: Record<string, unknown>): { amount: number | null; currency: string } {
  const amount = details.freightAmount ?? details.totalFreight ?? details.amount ?? details.freightUsd
  const currency = String(details.freightCurrency ?? details.currency ?? 'USD').toUpperCase()
  if (amount == null || amount === '') return { amount: null, currency }
  const num = Number(amount)
  return { amount: Number.isFinite(num) ? num : null, currency }
}

function componentPct(components: FeeComponentDto[], codes: string[]): number | null {
  for (const code of codes) {
    const c = components.find((x) => x.code === code)
    if (!c) continue
    if (c.unit === 'pct') return c.rate <= 1 ? c.rate * 100 : c.rate
    return c.rate
  }
  return null
}

function componentAmount(
  components: FeeComponentDto[],
  codes: string[],
): { amount: number; currency: string } | null {
  for (const code of codes) {
    const c = components.find((x) => x.code === code)
    if (!c) continue
    if (c.unit === 'pct') continue
    const currency =
      (c as FeeComponentDto & { currency?: string }).currency ||
      (c.note?.match(/\b([A-Z]{3})\b/)?.[1] ?? 'LKR')
    return { amount: c.rate, currency }
  }
  return null
}

export function feesFromTemplate(
  resolved: ResolvedFeeTemplateDto | null,
  temporary?: TemporaryFeeOverride,
  defaultMargin = 40,
): { fees: PlatformFeePercents | null; missingFeeParts: string[]; temporary: boolean } {
  const missingFeeParts: string[] = []
  if (!resolved && !temporary) return { fees: null, missingFeeParts: ['平台费用模板'], temporary: false }
  const components = resolved?.version.components ?? []
  const commission = temporary?.commissionPct ?? componentPct(components, ['commission'])
  const payout = temporary?.payoutPct ?? componentPct(components, ['payment_fee', 'payout', 'settlement_fee'])
  const warehouse = temporary?.warehousePct ?? componentPct(components, ['warehouse_fee', 'warehouse', 'storage_fee'])
  const freeShipping = temporary?.freeShippingPct ?? componentPct(components, ['free_shipping_fee', 'free_shipping'])
  const capComp = componentAmount(components, ['free_shipping_cap', 'free_shipping_fee_cap'])
  const marginFromTpl = componentPct(components, ['target_margin', 'target_net_margin'])
  if (!resolved) missingFeeParts.push('平台费用模板')
  if (commission == null && temporary?.commissionPct == null) missingFeeParts.push('佣金')
  if (payout == null && temporary?.payoutPct == null) missingFeeParts.push('回款费率')
  if (warehouse == null && temporary?.warehousePct == null) missingFeeParts.push('仓杂费率')
  const fees: PlatformFeePercents = {
    commissionPct: commission ?? 0,
    payoutPct: payout ?? 0,
    warehousePct: warehouse ?? 0,
    targetMarginPct: temporary?.targetMarginPct ?? marginFromTpl ?? defaultMargin,
    freeShippingPct: freeShipping ?? 0,
    freeShippingCap: temporary?.freeShippingCap ?? capComp?.amount ?? 0,
    temporary: Boolean(temporary),
  }
  return { fees, missingFeeParts, temporary: Boolean(temporary) }
}

async function convertAmount(
  db: AppDatabase,
  organizationId: string,
  amount: number,
  from: string,
  to: string,
  asOf: string,
  platform?: string,
): Promise<{ amount: number | null; rate: number | null; fxId: string | null; missing: boolean }> {
  if (from.toUpperCase() === to.toUpperCase()) return { amount, rate: 1, fxId: null, missing: false }
  const direct = await resolveFxRate(db, organizationId, {
    baseCurrency: from,
    quoteCurrency: to,
    asOf,
    platform,
  })
  if (direct) return { amount: amount * n(direct.rate), rate: n(direct.rate), fxId: direct.id, missing: false }
  const inverse = await resolveFxRate(db, organizationId, {
    baseCurrency: to,
    quoteCurrency: from,
    asOf,
    platform,
  })
  if (inverse && n(inverse.rate) > 0) {
    return { amount: amount / n(inverse.rate), rate: 1 / n(inverse.rate), fxId: inverse.id, missing: false }
  }
  return { amount: null, rate: null, fxId: null, missing: true }
}

export async function suggestPricing(db: DbLike, organizationId: string, input: SuggestPricingInput) {
  const asOf = (input.asOf || new Date().toISOString().slice(0, 10)).slice(0, 10)
  const platform = input.platform.trim().toLowerCase()
  const country = input.country.trim().toUpperCase()
  const formulaResolution = resolveFormulaForCountry({
    country,
    requested: input.formulaVersion,
  })
  const formulaVersion: FormulaVersion | null = formulaResolution.formula
  const gaps: PricingGap[] = []
  const steps: PricingBreakdownStep[] = []
  if (formulaResolution.reasonZh) {
    gaps.push({
      code: 'formula',
      labelZh: formulaVersion ? '公式已改用目的国默认' : '缺计税公式',
      detail: formulaResolution.reasonZh,
    })
  }

  const sku = await getSkuByCode(db, organizationId, input.sku)
  if (!sku) throw new Error(`未找到 SKU ${input.sku}`)

  const [variant] = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.organizationId, organizationId), eq(productVariants.id, sku.id)))
    .limit(1)
  if (!variant) throw new Error(`未找到 SKU ${input.sku}`)

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.organizationId, organizationId), eq(products.id, variant.productId)))
    .limit(1)
  if (!product) throw new Error('未找到所属商品')

  const hsCode = normalizeHsCode(variant.hsCode || product.hsCode || '')
  if (!hsCode) gaps.push({ code: 'hs', labelZh: '缺 HS 编码', detail: 'SKU / 商品尚未填写 HS，不能按税则计税。' })

  const preferred = await getPreferredForSku(db, organizationId, sku.sku)
  const purchaseUnitRaw = preferred ? n(preferred.price) : 0
  const purchaseCurrency = (preferred?.currency || 'CNY').toUpperCase()
  if (!preferred || !(purchaseUnitRaw > 0)) {
    gaps.push({ code: 'purchase', labelZh: '缺采购价', detail: '没有首选供应商单价，采购成本按 0 估算。' })
  }

  let carton: typeof commerceCartonSpecs.$inferSelect | null = null
  if (variant.cartonSpecId) {
    const [row] = await db
      .select()
      .from(commerceCartonSpecs)
      .where(
        and(
          eq(commerceCartonSpecs.organizationId, organizationId),
          eq(commerceCartonSpecs.id, variant.cartonSpecId),
        ),
      )
      .limit(1)
    carton = row ?? null
  }
  const cartonCbm = carton
    ? cbmPerCartonCm(n(carton.lengthCm), n(carton.widthCm), n(carton.heightCm))
    : 0
  const unitsPerCarton = carton ? Math.max(1, carton.unitsPerCarton || 1) : 0
  const pieceVol = carton && unitsPerCarton > 0 ? pieceCbm(cartonCbm, unitsPerCarton) : null
  const grossKg = carton && unitsPerCarton > 0 ? pieceGrossKg(n(carton.grossWeightKg), unitsPerCarton) : null
  if (!carton) gaps.push({ code: 'carton', labelZh: '缺箱规', detail: 'SKU 尚未绑定默认箱规，无法自动计算件体积与单件毛重。' })
  if (carton && !(n(carton.grossWeightKg) > 0)) {
    gaps.push({ code: 'gross_weight', labelZh: '缺毛重', detail: '箱规未维护箱毛重，从量税无法计算。' })
  }

  const costCurrency = purchaseCurrency || 'CNY'
  const sellCurrency = listingCurrencyFor(country)

  // 柜次：取该 SKU 最近非取消柜次行
  const [lotRow] = await db
    .select({
      line: oceanShipmentLines,
      shipment: oceanShipments,
    })
    .from(oceanShipmentLines)
    .innerJoin(oceanShipments, eq(oceanShipments.id, oceanShipmentLines.shipmentId))
    .where(
      and(
        eq(oceanShipmentLines.organizationId, organizationId),
        eq(oceanShipmentLines.variantId, variant.id),
        ne(oceanShipments.status, 'cancelled'),
      ),
    )
    .orderBy(desc(oceanShipments.updatedAt))
    .limit(1)

  let freightUnitCost: number | null = null
  let freightSource: 'shipment_actual_cbm' | 'rate_card_estimate' | 'missing' = 'missing'
  let freightNote = ''
  let shipmentActualTotalCbm: number | null = null
  let shipmentFreightAmountCost: number | null = null

  if (lotRow) {
    const lineRows = await db
      .select()
      .from(oceanShipmentLines)
      .where(
        and(
          eq(oceanShipmentLines.organizationId, organizationId),
          eq(oceanShipmentLines.shipmentId, lotRow.shipment.id),
        ),
      )
    let totalCbm = 0
    let anyCbm = false
    for (const line of lineRows) {
      if (line.cbm != null && n(line.cbm) > 0) {
        totalCbm += n(line.cbm)
        anyCbm = true
      }
    }
    if (!anyCbm) {
      // 回退箱明细合计
      const packing = (lotRow.shipment.packingDetails ?? {}) as Record<string, unknown>
      const packed = n(String(packing.totalCbm ?? packing.cbm ?? 0))
      if (packed > 0) {
        totalCbm = packed
        anyCbm = true
      }
    }
    shipmentActualTotalCbm = anyCbm ? totalCbm : null
    const packing = (lotRow.shipment.packingDetails ?? {}) as Record<string, unknown>
    const rawFreight = packingFreight(packing)
    if (rawFreight.amount != null && rawFreight.amount > 0) {
      const converted = await convertAmount(
        db,
        organizationId,
        rawFreight.amount,
        rawFreight.currency,
        costCurrency,
        asOf,
        platform,
      )
      if (converted.missing) {
        gaps.push({
          code: 'fx',
          labelZh: '缺汇率',
          detail: `柜次运费为 ${rawFreight.currency}，缺少换到 ${costCurrency} 的有效汇率。`,
        })
      } else {
        shipmentFreightAmountCost = converted.amount
      }
    }
    const lineCbm =
      lotRow.line.cbm != null && n(lotRow.line.cbm) > 0
        ? n(lotRow.line.cbm) / Math.max(1, lotRow.line.qtyShipped || 1)
        : pieceVol
    if (shipmentFreightAmountCost != null && shipmentActualTotalCbm && shipmentActualTotalCbm > 0 && lineCbm != null) {
      const alloc = allocateOceanFreightByActualCbm({
        shipmentFreightAmount: shipmentFreightAmountCost,
        shipmentActualTotalCbm,
        pieceCbm: lineCbm,
      })
      if (alloc) {
        freightUnitCost = alloc.unitFreight
        freightSource = 'shipment_actual_cbm'
        freightNote = `按柜次 ${lotRow.shipment.lotCode} 实际总 CBM ${shipmentActualTotalCbm.toFixed(4)} 分摊`
      }
    }
  }

  if (freightUnitCost == null && (input.useFreightRateCardEstimate || !lotRow)) {
    const { bundle } = await resolveFreightRateBundle(db, organizationId, { asOf, freightMode: 'FCL40' })
    const cardTotal = bundle.fcl40Usd + bundle.thcUsd
    const usable = Math.max(0.1, bundle.fcl40UsableCbm || 58)
    if (cardTotal > 0 && pieceVol != null && pieceVol > 0) {
      const usdUnit = (cardTotal / usable) * pieceVol
      const converted = await convertAmount(db, organizationId, usdUnit, 'USD', costCurrency, asOf, platform)
      if (converted.missing) {
        gaps.push({ code: 'fx', labelZh: '缺汇率', detail: `运价卡为 USD，缺少换到 ${costCurrency} 的有效汇率。` })
      } else if (converted.amount != null) {
        freightUnitCost = converted.amount
        freightSource = 'rate_card_estimate'
        freightNote = bundle.code
          ? `运价卡 ${bundle.code} 估算（按柜容 ${usable} CBM 估摊，非本柜实际分摊）`
          : '运价卡估算（非本柜实际分摊）'
        if (!bundle.code) gaps.push({ code: 'freight', labelZh: '缺运价', detail: '未配置运价卡，海运按 0 估算。' })
      }
    } else if (!lotRow) {
      gaps.push({ code: 'freight', labelZh: '缺海运分摊', detail: '该 SKU 没有所属柜次，且无法用运价卡估算。' })
    }
  } else if (freightUnitCost == null) {
    gaps.push({
      code: 'freight',
      labelZh: '缺海运分摊',
      detail: lotRow ? '柜次缺少运费总额或行 CBM，无法按实际总体积分摊。' : '没有所属柜次。',
    })
  }

  const [latestCost] = await db
    .select()
    .from(skuCosts)
    .where(and(eq(skuCosts.organizationId, organizationId), eq(skuCosts.variantId, variant.id)))
    .orderBy(desc(skuCosts.createdAt))
    .limit(1)

  const tariff = hsCode
    ? await resolveHsTariff(db, organizationId, { hsCode, countryCode: country, asOf })
    : null
  if (hsCode && !tariff) {
    gaps.push({
      code: 'tariff',
      labelZh: '缺税则',
      detail: `未找到 ${country} / HS ${hsCode} 的已发布税则，税金按 0 估算，不可当作可上架依据。`,
    })
  } else if (tariff && !tariff.isExact) {
    gaps.push({
      code: 'tariff',
      labelZh: '税则为近似',
      detail: '命中的税则标记为近似/回退，请核对后再上架。',
    })
  }

  const feeResolved = await resolveFeeTemplateVersion(db, organizationId, {
    platform,
    country,
    type: 'platform_fee',
    asOf,
    categoryId: product.categoryId ?? undefined,
    hsCode: hsCode || undefined,
  })
  const feeParsed = feesFromTemplate(feeResolved, input.temporaryFees, 40)
  if (input.targetMarginPct != null && feeParsed.fees) {
    feeParsed.fees.targetMarginPct = input.targetMarginPct
  }
  if (!feeParsed.fees) {
    gaps.push({
      code: 'fee_template',
      labelZh: '缺费用模板',
      detail: `本组织没有匹配 ${platformLabel(platform, country)} 的平台费用模板。费率来自本组织费用模板，并非平台实时同步。`,
    })
  } else if (feeParsed.missingFeeParts.length && !input.temporaryFees) {
    gaps.push({
      code: 'fee_template',
      labelZh: '费用模板缺项',
      detail: `已匹配模板 ${feeResolved?.template.code}，但缺少：${feeParsed.missingFeeParts.join('、')}。`,
    })
  }

  // 汇率：成本币种 → 站点结算币种
  let fxToSell: { amount: number | null; rate: number | null; fxId: string | null; missing: boolean } = {
    amount: 1,
    rate: 1,
    fxId: null,
    missing: false,
  }
  if (costCurrency !== sellCurrency) {
    fxToSell = await convertAmount(db, organizationId, 1, costCurrency, sellCurrency, asOf, platform)
    if (fxToSell.missing) {
      gaps.push({
        code: 'fx',
        labelZh: '缺汇率',
        detail: `缺少 ${costCurrency}/${sellCurrency} 的组织有效汇率，建议价仅以 ${costCurrency} 展示。`,
      })
    }
  }

  const purchaseUnit = purchaseUnitRaw
  const freightUnit = freightUnitCost ?? 0
  let fullLandedUnit = purchaseUnit + freightUnit
  let taxSummary: Record<string, number | string | null> | null = null
  let purchaseFreightDuty: number | null = null
  let otherTaxes: number | null = null

  if (!formulaVersion) {
    steps.push({
      id: 'landed_est',
      labelZh: '含税成本（缺计税公式，税金按 0 估算，未套用斯里兰卡税栈）',
      input: `${purchaseUnit}+${freightUnit}`,
      source: '估算',
      currency: costCurrency,
      result: fullLandedUnit,
    })
  } else if (tariff) {
    let gdSpecific = tariff.gdSpecificAmount
    let cessSpecific = tariff.cessSpecificAmount
    const components = { ...(tariff.components ?? {}) }
    if ((gdSpecific || cessSpecific || components.dutySpecificAmount) && tariff.currency && tariff.currency !== costCurrency) {
      if (gdSpecific) {
        const conv = await convertAmount(db, organizationId, gdSpecific, tariff.currency, costCurrency, asOf, platform)
        if (conv.missing) gaps.push({ code: 'fx', labelZh: '缺汇率', detail: `从量税为 ${tariff.currency}，缺少换到 ${costCurrency} 的汇率。` })
        else gdSpecific = conv.amount
      }
      if (cessSpecific) {
        const conv = await convertAmount(db, organizationId, cessSpecific, tariff.currency, costCurrency, asOf, platform)
        if (conv.missing) gaps.push({ code: 'fx', labelZh: '缺汇率', detail: `CESS 从量税为 ${tariff.currency}，缺少换到 ${costCurrency} 的汇率。` })
        else cessSpecific = conv.amount
      }
      if (components.dutySpecificAmount != null) {
        const raw = Number(components.dutySpecificAmount)
        if (Number.isFinite(raw) && raw > 0) {
          const conv = await convertAmount(db, organizationId, raw, tariff.currency, costCurrency, asOf, platform)
          if (!conv.missing) components.dutySpecificAmount = conv.amount
        }
      }
    }
    const stack = computeTaxStack({
      formulaVersion,
      purchaseUnit,
      freightUnit,
      pieceGrossKg: grossKg,
      rates: {
        components,
        gdRate: tariff.gdRate,
        surchargeRate: tariff.surchargeRate,
        palRate: tariff.palRate,
        cessRate: tariff.cessRate,
        exciseRate: tariff.exciseRate,
        vatRate: tariff.vatRate,
        ssclRate: tariff.ssclRate,
        gdSpecificAmount: gdSpecific,
        gdSpecificUnit: tariff.gdSpecificUnit || null,
        gdSpecificRule: tariff.gdSpecificRule || 'none',
        cessSpecificAmount: cessSpecific,
        cessSpecificUnit: tariff.cessSpecificUnit || null,
      },
    })
    if (!stack) {
      gaps.push({
        code: 'formula',
        labelZh: '缺计税公式',
        detail: `无法按公式 ${formulaVersion} 计税，税金按 0 估算，不会套用其他国家税栈。`,
      })
      steps.push({
        id: 'landed_est',
        labelZh: '含税成本（公式不可用，税金按 0 估算）',
        input: `${purchaseUnit}+${freightUnit}`,
        source: '估算',
        currency: costCurrency,
        result: fullLandedUnit,
      })
    } else {
      for (const w of stack.warnings) {
        if (w.includes('毛重') && !gaps.some((g) => g.code === 'gross_weight')) {
          gaps.push({ code: 'gross_weight', labelZh: '缺毛重', detail: w })
        } else if (w.includes('内地税') && !gaps.some((g) => g.detail.includes('内地税'))) {
          gaps.push({ code: 'tariff', labelZh: '税则缺项', detail: w })
        }
      }
      fullLandedUnit = stack.fullLandedUnit
      purchaseFreightDuty = stack.purchaseFreightDuty
      otherTaxes = stack.otherTaxes
      taxSummary = {
        formulaVersion: stack.formulaVersion,
        insurance: stack.insuranceUnit,
        duty: stack.duty,
        gd: stack.duty,
        surcharge: stack.surcharge,
        pal: stack.pal,
        cess: stack.cess,
        excise: stack.excise,
        interiorTax: stack.interiorTax,
        incomeTax: stack.incomeTax,
        luxuryTax: stack.luxuryTax,
        vat: stack.vat,
        sscl: stack.sscl,
        taxTotal: stack.taxTotal,
      }
      steps.push(
        ...stack.lines.map((line) => ({
          id: line.code,
          labelZh: line.labelZh,
          input: line.base ? `税基 ${line.base}` : '',
          source: line.source,
          currency: costCurrency,
          result: line.amount,
          note: line.code === 'uplift' ? '结果会变，不是平台官方报价' : undefined,
        })),
      )
    }
  } else {
    steps.push({
      id: 'landed_est',
      labelZh: formulaVersion
        ? '含税成本（缺税则，税金按 0 估算）'
        : '含税成本（缺计税公式或税则，税金按 0 估算）',
      input: `${purchaseUnit}+${freightUnit}`,
      source: '估算',
      currency: costCurrency,
      result: fullLandedUnit,
    })
  }

  const isEstimate = gaps.length > 0
  const fees = feeParsed.fees
  const priced = fees
    ? computeSuggestedPrices({ fullCostUnit: fullLandedUnit, fees })
    : null

  const toSell = (amount: number | null) => {
    if (amount == null) return null
    if (fxToSell.missing || fxToSell.rate == null) return null
    return Math.round(amount * fxToSell.rate * 100) / 100
  }

  steps.push({
    id: 'reverse',
    labelZh: '倒推建议价',
    input: fees
      ? `${fullLandedUnit} ÷ (1 − ${fees.commissionPct}% − ${fees.payoutPct}% − ${fees.warehousePct}% − ${fees.targetMarginPct}%)`
      : '缺费用模板',
    source: feeParsed.temporary ? '临时费率' : fees ? '来自本组织费用模板' : '缺项',
    currency: costCurrency,
    result: priced?.retail.price ?? null,
  })
  if (priced?.freeShipping) {
    steps.push({
      id: 'free_shipping',
      labelZh: priced.freeShipping.capped ? '包邮建议价（已按上限回算）' : '包邮建议价',
      input: priced.freeShipping.capped ? `(完全成本 + 封顶) ÷ 标准分母` : '标准分母 − 包邮佣金',
      source: feeParsed.temporary ? '临时费率' : '来自本组织费用模板',
      currency: costCurrency,
      result: priced.freeShipping.suggestedPrice,
    })
  }

  // 其他平台对照
  const tplPage = await listFeeTemplates(db, organizationId, { page: 1, pageSize: 100, type: 'platform_fee' })
  const seen = new Set<string>()
  const comparisonInputs = []
  for (const tpl of tplPage.items) {
    if (String(tpl.statusLabel) === '停用' || tpl.status === 'disabled') continue
    const key = `${tpl.platform.toLowerCase()}::${tpl.country.toUpperCase()}`
    if (key === `${platform}::${country}`) continue
    if (seen.has(key)) continue
    seen.add(key)
    const otherResolved = await resolveFeeTemplateVersion(db, organizationId, {
      platform: tpl.platform,
      country: tpl.country,
      type: 'platform_fee',
      asOf,
      categoryId: product.categoryId ?? undefined,
      hsCode: hsCode || undefined,
    })
    const otherFees = feesFromTemplate(otherResolved, undefined, 40)
    const otherCountry = tpl.country.toUpperCase()
    const otherMissing: string[] = []
    let otherLanded: number | null = fullLandedUnit
    if (otherCountry !== country) {
      const otherFormula = resolveFormulaForCountry({ country: otherCountry })
      const otherTariff = hsCode
        ? await resolveHsTariff(db, organizationId, { hsCode, countryCode: otherCountry, asOf })
        : null
      if (!otherFormula.formula) {
        otherMissing.push(otherFormula.reasonZh || '缺该站点计税公式')
        otherLanded = null
      } else if (!otherTariff) {
        otherMissing.push('缺该站点税则')
        otherLanded = null
      } else {
        const otherStack = computeTaxStack({
          formulaVersion: otherFormula.formula,
          purchaseUnit,
          freightUnit,
          pieceGrossKg: grossKg,
          rates: {
            components: otherTariff.components ?? {},
            gdRate: otherTariff.gdRate,
            surchargeRate: otherTariff.surchargeRate,
            palRate: otherTariff.palRate,
            cessRate: otherTariff.cessRate,
            exciseRate: otherTariff.exciseRate,
            vatRate: otherTariff.vatRate,
            ssclRate: otherTariff.ssclRate,
            gdSpecificAmount: otherTariff.gdSpecificAmount,
            gdSpecificUnit: otherTariff.gdSpecificUnit || null,
            gdSpecificRule: otherTariff.gdSpecificRule || 'none',
            cessSpecificAmount: otherTariff.cessSpecificAmount,
            cessSpecificUnit: otherTariff.cessSpecificUnit || null,
          },
        })
        if (!otherStack) {
          otherMissing.push('该站点计税公式不可用')
          otherLanded = null
        } else {
          otherLanded = otherStack.fullLandedUnit
        }
      }
    }
    if (!otherFees.fees) otherMissing.push('缺费用模板')
    if (otherLanded == null) otherMissing.push('缺到仓成本')
    comparisonInputs.push({
      platform: tpl.platform,
      country: otherCountry,
      currency: listingCurrencyFor(otherCountry),
      labelZh: platformLabel(tpl.platform, otherCountry),
      fees: otherFees.fees,
      fullCostUnit: otherLanded,
      costCurrency,
      missingReasons: otherMissing,
    })
  }
  const comparison = comparePlatformSuggestions(comparisonInputs)

  const pendingOfficialDrafts = await listPendingOfficialFeeDrafts(db, organizationId, {
    platform,
    country,
  })
  const shops = await listShopConnections(db, organizationId, { page: 1, pageSize: 100 })
  const shopOptions = shops.items.map((s) => ({
    id: s.id,
    name: s.name,
    platform: s.platform,
    country: (s.region || '').toUpperCase() || undefined,
    currency: s.currency,
  }))

  const requiredCodes: PricingGapCode[] = ['purchase', 'carton', 'hs', 'tariff', 'formula', 'fx', 'fee_template', 'freight']
  const readyRequired = requiredCodes.filter((c) => !gaps.some((g) => g.code === c))
  // 毛重只在从量需要时计入，但箱规缺毛重仍展示
  const extra = gaps.some((g) => g.code === 'gross_weight') ? 1 : 0
  const readyTotal = requiredCodes.length + extra
  const readyCount = readyRequired.length

  return {
    sku: {
      id: sku.id,
      sku: sku.sku,
      name: sku.name,
      spu: sku.spu,
      hsCode: hsCode || '',
      netWeightGrams: variant.weightGrams,
      categoryId: product.categoryId,
      category: product.categoryHint ?? sku.category,
      cartonSpecId: variant.cartonSpecId,
      cartonSpecCode: carton?.code ?? null,
      cartonSpecName: carton?.name ?? null,
      unitsPerCarton: unitsPerCarton || null,
      cartonCbm: carton ? cartonCbm : null,
      pieceCbm: pieceVol,
      pieceGrossKg: grossKg,
    },
    context: {
      platform,
      country,
      shopId: input.shopId ?? null,
      formulaVersion,
      asOf,
      costCurrency,
      sellCurrency,
      feeSourceNote: pendingOfficialDrafts.length
        ? '费用来源：来自本组织费用模板。另有来自官方费率同步草稿（待审核），本次建议价未使用。'
        : '费用来源：来自本组织费用模板（并非平台实时同步）。',
      pendingOfficialDrafts,
      availableFormulas: formulasForCountry(country).map((f) => ({ id: f.id, labelZh: f.labelZh, legacy: Boolean(f.legacy) })),
      targetMarginPct: fees?.targetMarginPct ?? input.targetMarginPct ?? 40,
      targetMarginSource: input.targetMarginPct != null ? 'user' : feeParsed.fees ? 'fee_template' : 'default',
    },
    cost: {
      purchaseUnit,
      purchaseCurrency: costCurrency,
      purchaseSource: preferred ? `供应商首选 ${preferred.supplier}` : '缺采购价',
      freightUnit: freightUnitCost,
      freightSource,
      freightNote,
      shipmentLotCode: lotRow?.shipment.lotCode ?? null,
      shipmentActualTotalCbm,
      tax: taxSummary,
      purchaseFreightDuty,
      otherTaxes,
      fullLandedUnit,
      latestSkuCost: latestCost
        ? {
            id: latestCost.id,
            landedUnitCost: latestCost.landedUnitCost != null ? n(latestCost.landedUnitCost) : null,
            currency: latestCost.currency,
            versionNo: latestCost.versionNo,
            containerLotId: latestCost.containerLotId,
          }
        : null,
    },
    primary: {
      labelZh: platformLabel(platform, country),
      isEstimate,
      fees: fees
        ? {
            commissionPct: fees.commissionPct,
            payoutPct: fees.payoutPct,
            warehousePct: fees.warehousePct,
            targetMarginPct: fees.targetMarginPct,
            freeShippingPct: fees.freeShippingPct,
            freeShippingCap: fees.freeShippingCap,
            temporary: Boolean(fees.temporary),
          }
        : null,
      currentMarginPct: (() => {
        if (input.currentSellPrice == null || !fees || fullLandedUnit == null) return null
        const sellCur = (input.currentSellCurrency || sellCurrency).toUpperCase()
        let landedInSell: number | null = null
        if (sellCur === costCurrency.toUpperCase()) landedInSell = fullLandedUnit
        else if (sellCur === sellCurrency.toUpperCase() && !fxToSell.missing && fxToSell.rate != null) {
          landedInSell = fullLandedUnit * fxToSell.rate
        }
        if (landedInSell == null) return null
        return marginAtSellPrice({
          fullCostUnit: landedInSell,
          sellPrice: input.currentSellPrice,
          fees,
        })
      })(),
      currentSellPrice: input.currentSellPrice ?? null,
      suggestedRetailCost: priced?.retail.price ?? null,
      suggestedRetailSell: toSell(priced?.retail.price ?? null),
      suggestedFreeShippingCost: priced?.freeShipping?.suggestedPrice ?? null,
      suggestedFreeShippingSell: toSell(priced?.freeShipping?.suggestedPrice ?? null),
      freeShippingCapped: priced?.freeShipping?.capped ?? null,
      expectedMarginPct: priced?.expectedMarginPct ?? null,
      expectedPayoutCost: priced?.expectedPayout ?? null,
      expectedPayoutSell: toSell(priced?.expectedPayout ?? null),
      denom: priced?.retail.denom ?? null,
      error: priced?.retail.error ?? (fees ? null : '缺费用模板，无法倒推建议价'),
      feeTemplateCode: feeResolved?.template.code ?? null,
      tariffId: tariff?.id ?? null,
      tariffExact: tariff?.isExact ?? null,
    },
    comparison: comparison.map((row) => ({
      ...row,
      suggestedRetailSell:
        row.suggestedRetail != null && !fxToSell.missing && row.currency
          ? row.suggestedRetail
          : row.suggestedRetail,
    })),
    readiness: {
      readyCount,
      readyTotal,
      gaps,
    },
    breakdown: steps,
    shops: shopOptions,
    fx: {
      costToSellRate: fxToSell.rate,
      fxId: fxToSell.fxId,
      missing: fxToSell.missing,
    },
  }
}

export type SuggestPricingResult = Awaited<ReturnType<typeof suggestPricing>>

export async function listShipmentPricingSuggestions(
  db: DbLike,
  organizationId: string,
  input: { shipmentId: string; platform?: string; country?: string },
) {
  const relay = await listOceanLotCostRelay(db, organizationId, input.shipmentId)
  const platform = (input.platform || relay.platform || 'daraz').toLowerCase()
  const country = (input.country || 'LK').toUpperCase()
  const items = await Promise.all(
    relay.skus.map(async (row) => {
      const suggestion = await suggestPricing(db, organizationId, {
        sku: row.sku,
        platform,
        country,
      })
      return {
        sku: row.sku,
        name: suggestion.sku.name,
        costId: row.costId,
        latestVersionNo: row.latestVersionNo,
        landedUnitCost: row.landedUnitCost,
        isEstimate: suggestion.primary.isEstimate,
        suggestedRetail: suggestion.primary.suggestedRetailSell ?? suggestion.primary.suggestedRetailCost,
        suggestedFreeShipping:
          suggestion.primary.suggestedFreeShippingSell ?? suggestion.primary.suggestedFreeShippingCost,
        currency: suggestion.primary.suggestedRetailSell != null
          ? suggestion.context.sellCurrency
          : suggestion.context.costCurrency,
        gaps: suggestion.readiness.gaps,
        error: suggestion.primary.error,
      }
    }),
  )
  return {
    shipmentId: relay.shipmentId,
    lotCode: relay.lotCode,
    platform,
    country,
    items,
  }
}
