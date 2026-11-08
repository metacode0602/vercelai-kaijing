import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  TARIFF_PROFILES,
  TARIFF_PROFILE_IDS,
  computeLandedCost,
  resolveImportTaxRates,
  type CostCalculatorInput,
} from './cost-calculator'
import {
  getPlatformFeePercents,
  type FeeComponent,
  type FeeTemplate,
  type FeeTemplateVersion,
  type ResolvedFeeTemplate,
} from './fee-template-store'

function baseInput(overrides: Partial<CostCalculatorInput> = {}): CostCalculatorInput {
  return {
    sku: 'SKU-TEST-001',
    title: '测试商品',
    fobUnit: 2,
    units: 100,
    firstMileTotal: 10,
    firstMileInCif: false,
    insuranceTotal: 1,
    cartonLcm: 40,
    cartonWcm: 30,
    cartonHcm: 25,
    unitsPerCarton: 20,
    kgPerCarton: 8,
    airVolumetricDivisor: 5000,
    airQuoteIncludesTax: false,
    freightMode: 'LCL',
    tariffProfileId: 'apparel',
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    asOf: '2026-01-15',
    clearanceMiscTotal: 5,
    targetNetMarginPct: 20,
    platformCommissionPct: 0,
    paymentFeePct: 0,
    adsPct: 0,
    lastMileUnit: 1,
    manualFreightTotal: 100,
    ...overrides,
  }
}

const runtime = { fxUsdLkr: 300, fxRateDate: '2026-01-15', fxRateId: 'fx_test_1' }

function template(type: 'import_tax' | 'platform_fee', code: string): FeeTemplate {
  return {
    id: `tpl_${code}`,
    code,
    name: code,
    platform: 'daraz',
    country: 'LK',
    fulfillmentPool: 'daraz_lk_sea_lot',
    fulfillmentLogistics: '',
    type,
    status: '启用',
    note: '',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function version(components: FeeComponent[], code: string): FeeTemplateVersion {
  return {
    id: `ver_${code}`,
    templateId: `tpl_${code}`,
    versionNo: 1,
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    priority: 10,
    formulaProfile: 'apparel',
    components,
    published: true,
    reviewNeeded: false,
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'published',
  }
}

function pct(code: string, rate: number): FeeComponent {
  return { code, labelZh: code, rate, unit: 'pct' }
}

const FULL_IMPORT_COMPONENTS: FeeComponent[] = [
  pct('customs', 0.1),
  pct('cess', 0.0),
  pct('pal', 0.02),
  pct('vat', 0.18),
  pct('sscl', 0.0),
]

function resolvedImport(components: FeeComponent[]): ResolvedFeeTemplate {
  return { template: template('import_tax', 'IMPORT-LK'), version: version(components, 'IMPORT-LK') }
}

function resolvedPlatformFee(components: FeeComponent[]): ResolvedFeeTemplate {
  return { template: template('platform_fee', 'PF-LK'), version: version(components, 'PF-LK') }
}

describe('cost-calculator 正式成本阻断（G2）', () => {
  it('未注入费用模板时阻断发布，且税率全为 0（不回退写死税率）', () => {
    const result = computeLandedCost(baseInput(), undefined, runtime)
    assert.equal(result.meta.canPublishFormal, false)
    assert.ok(result.meta.blockReasons.some((r) => r.includes('未命中进口税费用模板')))
    assert.ok(result.meta.blockReasons.some((r) => r.includes('未命中平台费费用模板')))
    assert.equal(result.tax.rates.customs, 0)
    assert.equal(result.tax.rates.vat, 0)
    assert.equal(result.meta.platformFeeTemplateCode, null)
  })

  it('缺少汇率时阻断', () => {
    const result = computeLandedCost(baseInput(), undefined, { ...runtime, fxUsdLkr: 0 })
    assert.equal(result.meta.canPublishFormal, false)
    assert.ok(result.meta.blockReasons.some((r) => r.includes('缺少有效汇率')))
  })

  it('进口税模板缺组件时阻断并列出缺失项', () => {
    const partial = resolvedImport([pct('vat', 0.18)])
    const result = computeLandedCost(
      baseInput(),
      { importTax: partial, platformFee: resolvedPlatformFee([pct('commission', 0.08)]) },
      runtime,
    )
    assert.equal(result.meta.canPublishFormal, false)
    assert.ok(result.meta.blockReasons.some((r) => r.includes('缺少组件')))
    assert.deepEqual(
      [...result.meta.missingImportTaxComponents].sort(),
      ['cess', 'customs', 'pal', 'sscl'],
    )
  })

  it('模板齐全 + 汇率 + 运费齐备时可发布正式成本', () => {
    const result = computeLandedCost(
      baseInput(),
      {
        importTax: resolvedImport(FULL_IMPORT_COMPONENTS),
        platformFee: resolvedPlatformFee([pct('commission', 0.08), pct('payment_fee', 0.02)]),
      },
      runtime,
    )
    assert.equal(result.meta.canPublishFormal, true)
    assert.deepEqual(result.meta.blockReasons, [])
    assert.equal(result.meta.platformFeeTemplateCode, 'PF-LK')
    assert.equal(result.tax.resolvedFrom, 'fee_template')
    assert.equal(result.tax.rates.customs, 0.1)
    assert.equal(result.tax.rates.vat, 0.18)
  })
})

describe('resolveImportTaxRates（G2/G4）', () => {
  it('未注入时返回 missing 且税率为 0', () => {
    const out = resolveImportTaxRates(baseInput())
    assert.equal(out.resolvedFrom, 'missing')
    assert.equal(out.resolved, null)
    assert.equal(out.rates.customs, 0)
    assert.equal(out.rates.vat, 0)
    assert.deepEqual(out.missingComponents, [])
  })

  it('完整模板返回 fee_template 且无缺失组件', () => {
    const out = resolveImportTaxRates(baseInput(), { importTax: resolvedImport(FULL_IMPORT_COMPONENTS) })
    assert.equal(out.resolvedFrom, 'fee_template')
    assert.deepEqual(out.missingComponents, [])
    assert.equal(out.rates.pal, 0.02)
  })
})

describe('getPlatformFeePercents（G4：不回退 8%/2%）', () => {
  it('未解析返回 0 而不是默认费率', () => {
    assert.deepEqual(getPlatformFeePercents(null), { commissionPct: 0, paymentFeePct: 0 })
  })

  it('模板缺 payment_fee 时为 0 而不是 2%', () => {
    const out = getPlatformFeePercents(resolvedPlatformFee([pct('commission', 0.08)]))
    assert.equal(out.commissionPct, 8)
    assert.equal(out.paymentFeePct, 0)
  })

  it('从模板 components 读取费率', () => {
    const out = getPlatformFeePercents(
      resolvedPlatformFee([pct('commission', 0.12), pct('payment_fee', 0.03)]),
    )
    assert.equal(out.commissionPct, 12)
    assert.equal(out.paymentFeePct, 3)
  })
})

describe('TARIFF_PROFILES 不含写死税率（G4）', () => {
  it('所有公式档案税率均为 0（正式税率只来自费用模板）', () => {
    for (const id of TARIFF_PROFILE_IDS) {
      const profile = TARIFF_PROFILES[id]
      assert.equal(profile.customs, 0, `${id}.customs`)
      assert.equal(profile.cess, 0, `${id}.cess`)
      assert.equal(profile.pal, 0, `${id}.pal`)
      assert.equal(profile.vat, 0, `${id}.vat`)
      assert.equal(profile.sscl, 0, `${id}.sscl`)
      assert.equal(profile.reviewNeeded, true, `${id}.reviewNeeded`)
    }
  })
})
