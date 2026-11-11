import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PLATFORM_BASICS,
  platformBasicCreateSchema,
  platformBasicKindLabels,
  platformBasicUpdateSchema,
} from '@workspace/db/platform-basics'

const base = {
  name: 'Daraz 斯里兰卡',
  description: '',
  sortOrder: 0,
} as const

describe('platform-basics-rules', () => {
  it('platform code is lowercased and invalid identifiers are rejected', () => {
    const parsed = platformBasicCreateSchema.parse({
      ...base,
      kind: 'platform',
      code: 'Daraz',
    })
    assert.equal(parsed.code, 'daraz')
    assert.throws(
      () =>
        platformBasicCreateSchema.parse({
          ...base,
          kind: 'platform',
          code: '1688',
        }),
      /平台代码/,
    )
  })

  it('country code uppercases and requires timezone + default currency', () => {
    const parsed = platformBasicCreateSchema.parse({
      ...base,
      kind: 'country',
      code: 'lk',
      timezone: 'Asia/Colombo',
      defaultCurrency: 'lkr',
    })
    assert.equal(parsed.code, 'LK')
    assert.equal(parsed.defaultCurrency, 'LKR')

    assert.throws(
      () =>
        platformBasicCreateSchema.parse({
          ...base,
          kind: 'country',
          code: 'lk',
        }),
      /时区/,
    )
    assert.throws(
      () =>
        platformBasicCreateSchema.parse({
          ...base,
          kind: 'country',
          code: 'lk',
          timezone: 'Asia Colombo',
          defaultCurrency: 'LKR',
        }),
      /Area\/City/,
    )
    assert.throws(
      () =>
        platformBasicCreateSchema.parse({
          ...base,
          kind: 'country',
          code: 'lk',
          timezone: 'Asia/Colombo',
        }),
      /默认币种/,
    )
  })

  it('currency code uppercases and requires symbol + decimals', () => {
    const parsed = platformBasicCreateSchema.parse({
      ...base,
      kind: 'currency',
      code: 'lkr',
      symbol: 'Rs',
      decimals: 2,
    })
    assert.equal(parsed.code, 'LKR')
    assert.equal(parsed.decimals, 2)

    assert.throws(
      () =>
        platformBasicCreateSchema.parse({
          ...base,
          kind: 'currency',
          code: 'lkr',
          decimals: 2,
        }),
      /符号/,
    )
    assert.throws(
      () =>
        platformBasicCreateSchema.parse({
          ...base,
          kind: 'currency',
          code: 'lkr',
          symbol: 'Rs',
        }),
      /小数位/,
    )
    assert.throws(() =>
      platformBasicCreateSchema.parse({
        ...base,
        kind: 'currency',
        code: 'lkr',
        symbol: 'Rs',
        decimals: 9,
      }),
    )
  })

  it('normalizes kind-specific fields and clears the rest', () => {
    const platform = platformBasicCreateSchema.parse({
      ...base,
      kind: 'platform',
      code: 'daraz',
      countries: ['lk', 'MY', 'lk'],
      timezone: 'Asia/Colombo',
      symbol: 'Rs',
      decimals: 2,
    })
    assert.deepEqual(platform.countries, ['LK', 'MY'])
    assert.equal(platform.timezone, null)
    assert.equal(platform.symbol, null)
    assert.equal(platform.decimals, null)
    assert.equal(platform.apiReady, null)

    const country = platformBasicCreateSchema.parse({
      ...base,
      kind: 'country',
      code: 'LK',
      timezone: 'Asia/Colombo',
      defaultCurrency: 'lkr',
      countries: ['LK'],
      symbol: 'Rs',
    })
    assert.deepEqual(country.countries, [])
    assert.equal(country.symbol, null)
    assert.equal(country.decimals, null)
    assert.equal(country.defaultCurrency, 'LKR')
  })

  it('update schema keeps id and applies the same normalization', () => {
    const parsed = platformBasicUpdateSchema.parse({
      id: 'row-1',
      kind: 'currency',
      code: 'usd',
      name: 'US Dollar',
      symbol: '$',
      decimals: 2,
    })
    assert.equal(parsed.id, 'row-1')
    assert.equal(parsed.code, 'USD')
    assert.throws(() =>
      platformBasicUpdateSchema.parse({
        kind: 'currency',
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimals: 2,
      }),
    )
  })

  it('default catalog is coherent', () => {
    const platforms = DEFAULT_PLATFORM_BASICS.filter((item) => item.kind === 'platform')
    const countries = DEFAULT_PLATFORM_BASICS.filter((item) => item.kind === 'country')
    const currencies = DEFAULT_PLATFORM_BASICS.filter((item) => item.kind === 'currency')
    assert.equal(platforms.length, 4)
    assert.equal(countries.length, 12)
    assert.equal(currencies.length, 13)

    const currencyCodes = new Set(currencies.map((item) => item.code))
    for (const country of countries) {
      assert.match(country.code, /^[A-Z]{2}$/)
      assert.ok(country.timezone, `${country.code} 缺时区`)
      const defaultCurrency = country.defaultCurrency
      assert.ok(defaultCurrency, `${country.code} 缺默认币种`)
      assert.ok(currencyCodes.has(defaultCurrency), `${country.code} 默认币种未在币种表`)
    }
    for (const currency of currencies) {
      assert.match(currency.code, /^[A-Z]{3}$/)
      assert.ok(currency.symbol, `${currency.code} 缺符号`)
      assert.equal(typeof currency.decimals, 'number')
    }
    for (const platform of platforms) {
      assert.match(platform.code, /^[a-z][a-z0-9_]*$/)
      assert.ok(platform.countries.every((code) => /^[A-Z]{2}$/.test(code)))
    }
    const byCode = Object.fromEntries(DEFAULT_PLATFORM_BASICS.map((item) => [`${item.kind}:${item.code}`, item]))
    assert.equal(byCode["currency:USD"]?.status, "active")
    assert.equal(byCode["currency:IDR"]?.status, "active")
    assert.equal(byCode["country:ID"]?.status, "active")
    assert.deepEqual(byCode["platform:lazada"]?.countries, ["MY", "PH", "SG", "TH", "VN", "ID"])
    for (const code of ["PK", "BD", "NP", "MM"]) {
      assert.equal(byCode[`country:${code}`]?.status, "inactive")
    }
    for (const code of ["PKR", "BDT", "NPR", "MMK"]) {
      assert.equal(byCode[`currency:${code}`]?.status, "inactive")
    }
    const shopee = byCode["platform:shopee"]
    const tiktok = byCode["platform:tiktok_shop"]
    assert.equal(shopee?.status, "inactive")
    assert.equal(tiktok?.status, "inactive")
    assert.equal(platformBasicKindLabels.platform, '平台')
  })
})
