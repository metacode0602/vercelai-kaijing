import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getOfficialFeeCapability, officialFeeUnsupportedMessage } from './official-fee-capabilities'

describe('official fee capabilities', () => {
  it('marks integrated platforms as unsupported without inventing a live API', () => {
    for (const platform of ['daraz', 'lazada', 'tiktok_shop', 'tiktok', 'shopee', 'unknown-mall']) {
      const cap = getOfficialFeeCapability(platform)
      assert.equal(cap.supported, false)
      assert.equal(cap.status, 'unsupported')
      assert.equal(cap.reasonZh, '该平台暂无官方费率接口，仍使用本组织费用模板')
    }
  })

  it('does not treat finance transaction details as a fee schedule endpoint', () => {
    const lazada = getOfficialFeeCapability('lazada')
    assert.ok(lazada.documentedEndpoints.includes('/finance/transaction/details/get'))
    assert.match(lazada.whyNotUsableZh, /不是类目佣金表|不能推断为官方费率/)
    assert.equal(officialFeeUnsupportedMessage('daraz'), '该平台暂无官方费率接口，仍使用本组织费用模板')
  })
})
