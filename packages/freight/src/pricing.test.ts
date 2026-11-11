import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allocateOceanFreightByActualCbm } from './allocation'
import { comparePlatformSuggestions, feesBelongToPlatform } from './compare'
import { cbmPerCartonCm, pieceCbm, pieceGrossKg, round4 } from './math'
import {
  computeSuggestedPrices,
  marginAtSellPrice,
  reversePriceDenominator,
  suggestFreeShippingPrice,
  suggestSellPriceStandard,
} from './pricing'
import { computeLkCascadeTaxStack, computeLkUpliftTaxStack } from './tax'

describe('lk_cascade_v1 tax stack (no CIF uplift)', () => {
  it('对齐移动电源实例的中间值与含税成本（不以讲义售价为验收）', () => {
    const cartonCbm = 0.019406
    const unitsPerCarton = 40
    const piece = pieceCbm(cartonCbm, unitsPerCarton)
    const alloc = allocateOceanFreightByActualCbm({
      shipmentFreightAmount: 3000 * 6.7589,
      shipmentActualTotalCbm: 67.909,
      pieceCbm: piece,
    })
    assert.ok(alloc)
    const tax = computeLkCascadeTaxStack({
      purchaseUnit: 41.6,
      freightUnit: alloc.unitFreight,
      rates: {
        gdRate: 0.15,
        surchargeRate: 0,
        palRate: 0.05,
        cessRate: 0,
        exciseRate: 0,
        vatRate: 0.18,
        ssclRate: 0.025,
        insuranceRate: 0.003,
      },
    })
    assert.equal(tax.formulaVersion, 'lk_cascade_v1')
    assert.ok(Math.abs(tax.purchaseFreightDuty - 48.03) < 0.02, `中间值 ${tax.purchaseFreightDuty}`)
    assert.ok(Math.abs(tax.fullLandedUnit - 60.77) < 0.03, `含税成本 ${tax.fullLandedUnit}`)
    // SSCL 税基含 VAT，因此应大于「不含 VAT」的对照
    const ssclIfNoVat = (tax.base + tax.gd + tax.surcharge + tax.pal + tax.cess + tax.excise) * 0.025
    assert.ok(tax.sscl > ssclIfNoVat + 0.01)
  })

  it('不对 CIF 做 10% 上浮（与 lk_uplift_v1 可区分）', () => {
    const cascade = computeLkCascadeTaxStack({
      purchaseUnit: 100,
      freightUnit: 0,
      rates: {
        gdRate: 0,
        surchargeRate: 0,
        palRate: 0,
        cessRate: 0,
        exciseRate: 0,
        vatRate: 0.18,
        ssclRate: 0,
        insuranceRate: 0,
      },
    })
    const uplift = computeLkUpliftTaxStack({
      cifTotal: 100,
      rates: { customs: 0, cess: 0, pal: 0, vat: 0.18, sscl: 0 },
    })
    assert.equal(cascade.vat, 18)
    assert.ok(Math.abs(uplift.vat - 19.8) < 0.001)
    assert.ok(cascade.vat < uplift.vat)
  })

  it('从量税缺毛重时记入 warnings，不静默漏税当 0 而不提示', () => {
    const tax = computeLkCascadeTaxStack({
      purchaseUnit: 10,
      freightUnit: 1,
      pieceGrossKg: null,
      rates: {
        gdRate: 0.1,
        surchargeRate: 0,
        palRate: 0,
        cessRate: 0,
        exciseRate: 0,
        vatRate: 0,
        ssclRate: 0,
        insuranceRate: 0,
        gdSpecificAmount: 2,
        gdSpecificUnit: 'kg',
        gdSpecificRule: 'max',
      },
    })
    assert.ok(tax.warnings.some((w) => w.includes('毛重')))
  })
})

describe('reverse price denominator', () => {
  it('使用 1−佣金−回款−仓杂−目标毛利，而不是讲义 0.365', () => {
    const denom = reversePriceDenominator({
      fullCostUnit: 60.77,
      commissionPct: 11,
      payoutPct: 3.5,
      warehousePct: 10,
      targetMarginPct: 40,
    })
    assert.ok(Math.abs(denom - 0.355) < 1e-9)
    const suggested = suggestSellPriceStandard({
      fullCostUnit: 60.77,
      commissionPct: 11,
      payoutPct: 3.5,
      warehousePct: 10,
      targetMarginPct: 40,
    })
    assert.ok(suggested.price)
    assert.ok(Math.abs(suggested.price - 60.77 / 0.355) < 0.02)
    assert.notEqual(suggested.denom, 0.365)
  })

  it('分母过小时报错且不出价', () => {
    const suggested = suggestSellPriceStandard({
      fullCostUnit: 10,
      commissionPct: 40,
      payoutPct: 20,
      warehousePct: 20,
      targetMarginPct: 25,
    })
    assert.equal(suggested.price, null)
    assert.ok(suggested.error)
  })
})

describe('free-shipping cap recalculation', () => {
  it('未触顶时用（标准分母−包邮%）倒推', () => {
    const result = suggestFreeShippingPrice({
      fullCostUnit: 20,
      commissionPct: 11,
      payoutPct: 3.5,
      warehousePct: 10,
      targetMarginPct: 40,
      freeShippingPct: 5,
      capAmount: 100,
    })
    assert.equal(result.capped, false)
    assert.ok(result.suggestedPrice)
    assert.ok(Math.abs((result.denomUsed ?? 0) - 0.305) < 1e-9)
    assert.ok(Math.abs((result.suggestedPrice ?? 0) - 20 / 0.305) < 0.02)
  })

  it('触顶后改为 (总成本 + 封顶) ÷ 标准档分母', () => {
    const cap = 9.13
    const result = suggestFreeShippingPrice({
      fullCostUnit: 60.77,
      commissionPct: 11,
      payoutPct: 3.5,
      warehousePct: 10,
      targetMarginPct: 40,
      freeShippingPct: 5,
      capAmount: cap,
    })
    assert.equal(result.capped, true)
    assert.ok(result.suggestedPrice)
    const expected = (60.77 + cap) / 0.355
    assert.ok(Math.abs((result.suggestedPrice ?? 0) - expected) < 0.02)
    assert.equal(result.freeShippingFee, cap)
    assert.ok(Math.abs((result.denomUsed ?? 0) - 0.355) < 1e-9)
  })
})

describe('CBM allocation by actual total CBM', () => {
  it('按本件 CBM / 本柜实际总 CBM 分摊，不用柜容做分母', () => {
    const cartonCbm = cbmPerCartonCm(62, 25, 12.5) // ≈ 0.019375
    const piece = pieceCbm(cartonCbm, 40)
    const actual = allocateOceanFreightByActualCbm({
      shipmentFreightAmount: 3000,
      shipmentActualTotalCbm: 67.909,
      pieceCbm: piece,
    })
    const byUsable = 3000 * (piece / 58) // 错误分母（可用柜容）
    assert.ok(actual)
    assert.ok(Math.abs(actual.unitFreight - round4(3000 * (piece / 67.909))) < 1e-9)
    assert.ok(actual.unitFreight < byUsable)
    assert.equal(allocateOceanFreightByActualCbm({
      shipmentFreightAmount: 3000,
      shipmentActualTotalCbm: 0,
      pieceCbm: piece,
    }), null)
  })

  it('单件毛重由箱毛重 ÷ 件数得出', () => {
    assert.equal(pieceGrossKg(8, 40), 0.2)
  })
})

describe('multi-platform comparison does not mix fee templates', () => {
  it('Daraz 费率不会套到 Lazada 行，缺模板的行不算假价格', () => {
    const darazFees = {
      commissionPct: 11,
      payoutPct: 3.5,
      warehousePct: 10,
      targetMarginPct: 40,
      freeShippingPct: 5,
      freeShippingCap: 9.13,
    }
    const lazadaFees = {
      commissionPct: 8,
      payoutPct: 2,
      warehousePct: 0,
      targetMarginPct: 30,
      freeShippingPct: 0,
      freeShippingCap: 0,
    }
    const rows = comparePlatformSuggestions([
      {
        platform: 'daraz',
        country: 'LK',
        currency: 'LKR',
        labelZh: 'Daraz 斯里兰卡',
        fees: darazFees,
        fullCostUnit: 60.77,
        costCurrency: 'CNY',
        missingReasons: [],
      },
      {
        platform: 'lazada',
        country: 'MY',
        currency: 'MYR',
        labelZh: 'Lazada 马来西亚',
        fees: lazadaFees,
        fullCostUnit: 60.77,
        costCurrency: 'CNY',
        missingReasons: [],
      },
      {
        platform: 'lazada',
        country: 'SG',
        currency: 'SGD',
        labelZh: 'Lazada 新加坡',
        fees: null,
        fullCostUnit: 60.77,
        costCurrency: 'CNY',
        missingReasons: [],
      },
    ])
    const daraz = rows[0]!
    const lazadaMy = rows[1]!
    const lazadaSg = rows[2]!
    assert.ok(daraz.suggestedRetail)
    assert.ok(lazadaMy.suggestedRetail)
    assert.notEqual(daraz.suggestedRetail, lazadaMy.suggestedRetail)
    // 若误把 Daraz 11/3.5/10/40 套到 Lazada，分母会变成 0.355，售价接近 171
    const darazLikePrice = 60.77 / 0.355
    assert.ok(Math.abs((lazadaMy.suggestedRetail ?? 0) - darazLikePrice) > 1)
    assert.equal(lazadaSg.suggestedRetail, null)
    assert.ok(lazadaSg.missingReasons.some((m) => m.includes('费用模板')))
    assert.equal(lazadaSg.feeSource, 'missing')
    assert.equal(feesBelongToPlatform('daraz', 'LK', 'lazada', 'MY'), false)
    assert.equal(feesBelongToPlatform('lazada', 'MY', 'lazada', 'MY'), true)
  })
})

describe('marginAtSellPrice', () => {
  it('returns margin at a filled sell price without changing suggested price math', () => {
    const fees = { commissionPct: 8, payoutPct: 2, warehousePct: 5, targetMarginPct: 40, freeShippingPct: 0, freeShippingCap: 0 }
    const suggested = computeSuggestedPrices({ fullCostUnit: 100, fees })
    assert.ok(suggested.retail.price)
    const atSuggested = marginAtSellPrice({ fullCostUnit: 100, sellPrice: suggested.retail.price!, fees })
    assert.ok(atSuggested != null)
    assert.ok(Math.abs(atSuggested! - suggested.expectedMarginPct!) < 0.15)
    const lower = marginAtSellPrice({ fullCostUnit: 100, sellPrice: 150, fees })
    assert.ok(lower != null && lower < (atSuggested ?? 0))
  })

  it('returns null for invalid price', () => {
    assert.equal(marginAtSellPrice({ fullCostUnit: 100, sellPrice: 0, fees: { commissionPct: 8, payoutPct: 2, warehousePct: 5 } }), null)
  })
})
