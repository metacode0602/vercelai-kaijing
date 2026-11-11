import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_UNIQUE_MESSAGE,
  getUniqueConstraintName,
  isUniqueViolation,
  uniqueViolationMessage,
} from './unique-constraint'
import { toUserFacingTrpcError } from './user-facing-trpc-error'

function pgUnique(constraint: string, detail = '') {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
    code: '23505',
    constraint,
    detail,
  })
}

test('detects node-postgres unique errors by code and constraint', () => {
  const error = pgUnique('commerce_brands_org_name_uidx', 'Key (name)=(Acme) already exists.')
  assert.equal(isUniqueViolation(error), true)
  assert.equal(getUniqueConstraintName(error), 'commerce_brands_org_name_uidx')
  assert.equal(uniqueViolationMessage(error), '品牌名称已存在，请更换名称')
})

test('walks drizzle-style cause wrappers and constraint_name', () => {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint "commerce_brands_org_code_uidx"'), {
    code: '23505',
    constraint_name: 'commerce_brands_org_code_uidx',
  })
  const drizzle = Object.assign(new Error('Failed query: insert into "commerce_brands" values ($1)'), {
    cause,
  })
  assert.equal(isUniqueViolation(drizzle), true)
  assert.equal(uniqueViolationMessage(drizzle), '品牌编码已存在，请更换编码')
})

test('allows contextual overrides and falls back when constraint is unknown', () => {
  const error = pgUnique('commerce_brands_org_name_uidx')
  assert.equal(
    uniqueViolationMessage(error, { commerce_brands_org_name_uidx: '品牌名称 示例 已存在' }),
    '品牌名称 示例 已存在',
  )
  const unknown = pgUnique('some_other_uidx')
  assert.equal(uniqueViolationMessage(unknown), DEFAULT_UNIQUE_MESSAGE)
  assert.equal(uniqueViolationMessage(new Error('not unique')), null)
})

test('toUserFacingTrpcError maps unique conflicts to CONFLICT and sanitizes SQL dumps', () => {
  const unique = toUserFacingTrpcError(pgUnique('commerce_categories_org_code_uidx'))
  assert.equal(unique.code, 'CONFLICT')
  assert.equal(unique.message, '品类编码已存在，请更换编码')

  const sql = toUserFacingTrpcError(new Error('Failed query: insert into "commerce_brands" values ($1)'))
  assert.equal(sql.code, 'BAD_REQUEST')
  assert.equal(sql.message, '保存失败，请检查输入后重试')
  assert.doesNotMatch(sql.message, /insert into/i)

  const business = toUserFacingTrpcError(new Error('品牌名称不能为空'))
  assert.equal(business.code, 'BAD_REQUEST')
  assert.equal(business.message, '品牌名称不能为空')
})
