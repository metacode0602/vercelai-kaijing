import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildCostRelayPath, listSkusForCostRelay } from './ocean-cost-relay'

describe('ocean.saveCost relay list', () => {
  it('只列出本次柜次已写入成本的 SKU，并取每个 SKU 的最新版本', () => {
    const rows = listSkusForCostRelay(
      [
        { id: 'c1', sku: 'AAA', shipmentId: 'lot-1', versionNo: 1, landedUnitCost: 10 },
        { id: 'c2', sku: 'AAA', shipmentId: 'lot-1', versionNo: 2, landedUnitCost: 12 },
        { id: 'c3', sku: 'BBB', shipmentId: 'lot-1', versionNo: 1, landedUnitCost: 8 },
        { id: 'c4', sku: 'CCC', shipmentId: 'lot-other', versionNo: 9, landedUnitCost: 99 },
      ],
      'lot-1',
    )
    assert.deepEqual(
      rows.map((row) => ({ sku: row.sku, costId: row.costId, latestVersionNo: row.latestVersionNo })),
      [
        { sku: 'AAA', costId: 'c2', latestVersionNo: 2 },
        { sku: 'BBB', costId: 'c3', latestVersionNo: 1 },
      ],
    )
  })

  it('没有写入 sku_costs 时列表为空，不假装已算价', () => {
    assert.deepEqual(listSkusForCostRelay([{ id: 'c1', sku: 'AAA', shipmentId: 'other', versionNo: 1 }], 'lot-1'), [])
  })

  it('接力入口指向成本下的建议列表页，不进入一键改价', () => {
    assert.equal(
      buildCostRelayPath('lot-1', 'daraz', 'LK'),
      '/console/costs/suggestions?shipmentId=lot-1&platform=daraz&country=LK',
    )
  })
})
