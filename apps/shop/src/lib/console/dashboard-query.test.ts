import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  currencyModeOf,
  defaultDateRange,
  formatAmount,
  isDemoOrganization,
  isRefundPendingStatus,
  isYmd,
  normalizeFilterToken,
  profitFromComponents,
  resolveDashboardWindow,
} from './dashboard-query'

describe('resolveDashboardWindow', () => {
  it('无自定义日期时取近 N 天（含今天），不回落到 2026-10-21', () => {
    const now = new Date(2026, 10, 11, 18, 30, 0) // 本地 2026-11-11
    const week = resolveDashboardWindow({ range: 7 }, now)
    assert.equal(week.dateFrom, '2026-11-05')
    assert.equal(week.dateTo, '2026-11-11')
    assert.equal(week.dayCount, 7)
    assert.equal(week.to.getTime(), resolveDashboardWindow({ range: 7 }, now).from.getTime() + 7 * 86_400_000)

    const month = resolveDashboardWindow({ range: 30 }, now)
    assert.equal(month.dateFrom, '2026-10-13')
    assert.equal(month.dateTo, '2026-11-11')
    assert.equal(month.dayCount, 30)

    const defaults = defaultDateRange(now, 7)
    assert.equal(defaults.dateFrom, '2026-11-05')
    assert.equal(defaults.dateTo, '2026-11-11')
    assert.notEqual(defaults.dateFrom, '2026-10-21')
    assert.notEqual(defaults.dateTo, '2026-10-28')
  })

  it('自定义日期按闭区间生效，跨度最多 90 天，起止颠倒会交换', () => {
    const window = resolveDashboardWindow({ range: 7, dateFrom: '2026-09-01', dateTo: '2026-09-10' })
    assert.equal(window.dateFrom, '2026-09-01')
    assert.equal(window.dateTo, '2026-09-10')
    assert.equal(window.dayCount, 10)
    assert.equal(window.range, 30)

    const swapped = resolveDashboardWindow({ dateFrom: '2026-09-10', dateTo: '2026-09-01' })
    assert.equal(swapped.dateFrom, '2026-09-01')
    assert.equal(swapped.dateTo, '2026-09-10')

    const capped = resolveDashboardWindow({ dateFrom: '2026-01-01', dateTo: '2026-06-01' })
    assert.equal(capped.dateFrom, '2026-01-01')
    assert.equal(capped.dateTo, '2026-03-31')
    assert.equal(capped.dayCount, 90)
    assert.equal(capped.range, 90)
  })

  it('非法日期回退到近 range 天', () => {
    const now = new Date(2026, 10, 11)
    const window = resolveDashboardWindow({ range: 7, dateFrom: '2026-13-99', dateTo: 'nope' }, now)
    assert.equal(window.dateFrom, '2026-11-05')
    assert.equal(window.dateTo, '2026-11-11')
    assert.equal(isYmd('2026-02-29'), false)
    assert.equal(isYmd('2024-02-29'), true)
  })
})

describe('currency and profit helpers', () => {
  it('多币种不选单一币种，单币种才返回该币种', () => {
    assert.deepEqual(currencyModeOf(['LKR', 'lkr', '']), {
      currencyMode: 'single',
      currency: 'LKR',
      currencies: ['LKR'],
    })
    assert.deepEqual(currencyModeOf(['LKR', 'MYR', 'THB']), {
      currencyMode: 'mixed',
      currency: null,
      currencies: ['LKR', 'MYR', 'THB'],
    })
    assert.deepEqual(currencyModeOf([]), { currencyMode: 'empty', currency: null, currencies: [] })
  })

  it('金额按实际币种展示，缺币种或空金额不写死 LKR', () => {
    assert.equal(formatAmount(2500, 'MYR'), 'MYR 2,500')
    assert.equal(formatAmount(1_250_000, 'LKR', { compact: true }), 'LKR 1.25M')
    assert.equal(formatAmount(3200, 'THB', { compact: true }), 'THB 3k')
    assert.equal(formatAmount(100, null), '跨币种暂不合计')
    assert.equal(formatAmount(null, 'LKR'), '跨币种暂不合计')
    assert.equal(formatAmount(0, 'CNY'), 'CNY 0')
  })

  it('毛利/净利与 finance.overview 相同：收入-成本、再减费用', () => {
    const p = profitFromComponents(1000, 400, 50)
    assert.equal(p.grossProfit, 600)
    assert.equal(p.netProfit, 550)
    assert.equal(p.grossMargin, 60)
    assert.equal(p.netMargin, 55)
    const zero = profitFromComponents(0, 0, 0)
    assert.equal(zero.grossMargin, null)
    assert.equal(zero.netMargin, null)
  })
})

describe('demo banner and filters', () => {
  it('仅演示组织 id 或 slug 判定为演示租户', () => {
    assert.equal(isDemoOrganization({ id: 'org_shop_dev_demo', slug: 'acme' }), true)
    assert.equal(isDemoOrganization({ id: 'org_other', slug: 'shop-dev-demo' }), true)
    assert.equal(isDemoOrganization({ id: 'org_real_tenant', slug: 'acme-shop' }), false)
    assert.equal(isDemoOrganization({}), false)
  })

  it('筛选 all / 空值视为未筛选', () => {
    assert.equal(normalizeFilterToken('all'), undefined)
    assert.equal(normalizeFilterToken('  '), undefined)
    assert.equal(normalizeFilterToken('daraz'), 'daraz')
  })

  it('售后进行中状态对齐仪表盘待办（含 aftersales 种子）', () => {
    assert.equal(isRefundPendingStatus('pending', null), true)
    assert.equal(isRefundPendingStatus('REVERSE_PENDING', 'pending_review'), true)
    assert.equal(isRefundPendingStatus(null, 'pending_qc'), true)
    assert.equal(isRefundPendingStatus('RETURN_COMPLETED', 'restocked'), false)
  })
})
