import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertImportTemplateKind, validateImportTemplateFields } from './import-template-rules'

describe('import-template-rules', () => {
  it('accepts known kinds and unique headers', () => {
    assert.equal(assertImportTemplateKind('商品 / SKU'), '商品 / SKU')
    const { headers, normalized } = validateImportTemplateFields('sku, name, qty', '商品 / SKU')
    assert.deepEqual(headers, ['sku', 'name', 'qty'])
    assert.equal(normalized, 'sku, name, qty')
  })

  it('rejects unknown kind and duplicate headers', () => {
    assert.throws(() => assertImportTemplateKind('未知类型'), /不支持/)
    assert.throws(() => validateImportTemplateFields('sku, SKU', '商品 / SKU'), /重复/)
  })
})
