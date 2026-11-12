import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_PLATFORM_BASICS } from '@workspace/db/platform-basics'
import {
  DEFAULT_ORGANIZATION_DISPLAY_CURRENCY,
  DEFAULT_PLATFORM_CARRIERS,
  DEFAULT_PLATFORM_CATEGORY_TREE,
  DEFAULT_PLATFORM_DICTIONARIES,
  DEFAULT_PLATFORM_IMPORT_TEMPLATES,
  EXCLUDED_DICTIONARY_KEYS,
  categoryNodesReadyToCopy,
  isActiveCatalogStatus,
} from '@workspace/db/platform-catalogs'

describe('platform-catalogs-rules', () => {
  it('default dictionaries match the confirmed 17 keys and page-aligned values', () => {
    assert.equal(DEFAULT_PLATFORM_DICTIONARIES.length, 17)
    const byKey = Object.fromEntries(DEFAULT_PLATFORM_DICTIONARIES.map((item) => [item.key, item]))
    assert.deepEqual(byKey.product_size?.values, ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'])
    assert.deepEqual(byKey.fulfillment_mode?.values, ['自营仓发货', '平台仓（LGS）', 'JSB 灰清', '混合'])
    assert.deepEqual(byKey.warehouse_type?.values, ['自营仓', 'LGS', 'JSB', '第三方仓'])
    for (const key of EXCLUDED_DICTIONARY_KEYS) {
      assert.equal(byKey[key], undefined)
    }
    assert.ok(DEFAULT_PLATFORM_DICTIONARIES.every((item) => item.status === 'active'))
  })

  it('default category tree includes SPORTS and is parent-complete', () => {
    const codes = DEFAULT_PLATFORM_CATEGORY_TREE.map((item) => item.code)
    assert.ok(codes.includes('SPORTS'))
    assert.ok(codes.includes('APPAREL-TOPS-TEE'))
    assert.ok(codes.includes('HOME-KITCHEN'))
    const byCode = new Map(DEFAULT_PLATFORM_CATEGORY_TREE.map((item) => [item.code, item]))
    for (const node of DEFAULT_PLATFORM_CATEGORY_TREE) {
      if (node.parentCode) {
        assert.ok(byCode.has(node.parentCode), `${node.code} 缺少父节点 ${node.parentCode}`)
      }
      assert.equal(node.status, 'active')
    }
  })

  it('USD is an active catalog currency but organization default display currency is CNY', () => {
    const usd = DEFAULT_PLATFORM_BASICS.find((item) => item.kind === 'currency' && item.code === 'USD')
    const cny = DEFAULT_PLATFORM_BASICS.find((item) => item.kind === 'currency' && item.code === 'CNY')
    assert.equal(usd?.status, 'active')
    assert.equal(cny?.status, 'active')
    assert.equal(DEFAULT_ORGANIZATION_DISPLAY_CURRENCY, 'CNY')
  })

  it('carrier and import template defaults are name/field templates only', () => {
    assert.deepEqual(
      DEFAULT_PLATFORM_CARRIERS.map((item) => item.name),
      ['LGS', 'Daraz Express'],
    )
    assert.ok(DEFAULT_PLATFORM_CARRIERS.every((item) => item.status === 'active'))
    assert.equal(DEFAULT_PLATFORM_IMPORT_TEMPLATES.length, 1)
    assert.equal(DEFAULT_PLATFORM_IMPORT_TEMPLATES[0]?.kind, '商品 / SKU')
    assert.match(DEFAULT_PLATFORM_IMPORT_TEMPLATES[0]?.fields ?? '', /SPU/)
  })

  it('categoryNodesReadyToCopy requires an active ancestor chain', () => {
    const nodes = [
      { id: 'root', parentId: null, status: 'active' },
      { id: 'child', parentId: 'root', status: 'active' },
      { id: 'inactive-root', parentId: null, status: 'inactive' },
      { id: 'orphan', parentId: 'inactive-root', status: 'active' },
      { id: 'missing-parent', parentId: 'nope', status: 'active' },
    ]
    const ready = categoryNodesReadyToCopy(nodes).map((item) => item.id)
    assert.deepEqual(ready, ['root', 'child'])
    assert.equal(isActiveCatalogStatus('active'), true)
    assert.equal(isActiveCatalogStatus('inactive'), false)
  })
})
