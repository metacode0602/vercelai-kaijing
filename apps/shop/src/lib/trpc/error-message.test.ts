import assert from 'node:assert/strict'
import test from 'node:test'
import { getClientErrorMessage } from './error-message'

test('prefers explicit Chinese messages', () => {
  assert.equal(getClientErrorMessage(new Error('品牌名称 示例 已存在')), '品牌名称 示例 已存在')
  assert.equal(getClientErrorMessage({ message: '品类编码已存在，请更换编码' }), '品类编码已存在，请更换编码')
})

test('maps empty or SQL-like messages to a generic Chinese fallback', () => {
  assert.equal(getClientErrorMessage({}), '操作失败，请检查输入后重试')
  assert.equal(
    getClientErrorMessage(new Error('Failed query: insert into "commerce_brands"')),
    '操作失败，请检查输入后重试',
  )
})

test('uses zod field errors when present', () => {
  assert.equal(
    getClientErrorMessage({
      message: 'Input validation failed',
      data: { zodError: { fieldErrors: { name: ['Required'] }, formErrors: [] } },
    }),
    '请填写必填项：name',
  )
})
