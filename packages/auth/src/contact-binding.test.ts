import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { user, verification } from '@workspace/db/schema'
import {
  bindEmailToUser,
  bindPhoneToUser,
  buildContactIdentifier,
  generateContactCode,
  hasBoundEmail,
  hasBoundPhone,
  isChannelBound,
  isSyntheticPhoneEmail,
  issueContactCode,
  normalizeContactPhone,
  parseContactIdentifier,
  resolveLocaleFromCookieHeader,
  verifyContactCode,
} from './contact-binding'

type Row = Record<string, unknown>
type TableName = 'user' | 'verification'
type Dataset = Record<TableName, Row[]>

const COLUMN_TO_FIELD: Record<string, string> = {
  id: 'id',
  user_id: 'userId',
  phone_number: 'phoneNumber',
  phone_number_verified: 'phoneNumberVerified',
  email: 'email',
  identifier: 'identifier',
  value: 'value',
  expires_at: 'expiresAt',
}

const SQL_TABLE_NAME: Record<TableName, string> = {
  user: 'users',
  verification: 'verification',
}

const CLAUSE_REGEX = /"[^"]+"\."(\w+)"\s*(= \$(\d+)|is not null|in \(([^)]*)\)|<> \$(\d+))/g

function matchesClause(row: Row, table: TableName, sql: string, params: unknown[]): boolean {
  for (const match of sql.matchAll(CLAUSE_REGEX)) {
    const column = match[1]
    assert.ok(column, `fake db 解析不出列名: ${sql}`)
    const field = COLUMN_TO_FIELD[column]
    assert.ok(field, `fake db 未覆盖列 ${column}`)

    if (match[2] === 'is not null') {
      if (row[field] == null) return false
      continue
    }

    if (match[5]) {
      if (row[field] === params[Number(match[5]) - 1]) return false
      continue
    }

    if (match[3]) {
      if (row[field] !== params[Number(match[3]) - 1]) return false
      continue
    }

    const placeholders = [...(match[4] ?? '').matchAll(/\$(\d+)/g)].map(
      (p) => params[Number(p[1]) - 1]
    )
    if (!placeholders.includes(row[field])) return false
  }

  assert.ok(sql.includes(`"${SQL_TABLE_NAME[table]}"."`), `条件未作用于 ${table} 表: ${sql}`)
  return true
}

function createFakeDb(dataset: Dataset) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const render = (condition: any): { sql: string; params: unknown[] } =>
    new PgDialect().sqlToQuery(condition)

  const chainable = (compute: (limit?: number) => Promise<Row[]>) => ({
    limit: (count?: number) => compute(count),
    then: (
      onFulfilled: (rows: Row[]) => unknown,
      onRejected: (reason: unknown) => unknown
    ) => compute(undefined).then(onFulfilled, onRejected),
  })

  const matching = (table: TableName, condition: unknown) => {
    const { sql, params } = render(condition)
    return (limit?: number) => {
      const rows = dataset[table].filter((row) => matchesClause(row, table, sql, params))
      return Promise.resolve(limit === undefined ? rows : rows.slice(0, limit))
    }
  }

  return {
    select: () => ({
      from: (table: unknown) => {
        const tableName = table === user ? 'user' : 'verification'
        return { where: (condition: never) => chainable(matching(tableName, condition)) }
      },
    }),
    update: (table: unknown) => {
      const tableName = table === user ? 'user' : 'verification'
      return {
        set: (values: Row) => ({
          where: (condition: never) => {
            const { sql, params } = render(condition)
            const apply = () => {
              const updated: Row[] = []
              for (const row of dataset[tableName]) {
                if (matchesClause(row, tableName, sql, params)) {
                  Object.assign(row, values)
                  updated.push(row)
                }
              }
              return updated
            }
            return {
              returning: async () => apply().map((row) => ({ id: row.id })),
              then: (
                onFulfilled: () => unknown,
                onRejected: (reason: unknown) => unknown
              ) => Promise.resolve(apply()).then(() => onFulfilled(), onRejected),
            }
          },
        }),
      }
    },
    delete: (table: unknown) => {
      assert.equal(table, verification)
      return {
        where: async (condition: never) => {
          const { sql, params } = render(condition)
          dataset.verification = dataset.verification.filter(
            (row) => !matchesClause(row, 'verification', sql, params)
          )
        },
      }
    },
    insert: (table: unknown) => {
      assert.equal(table, verification)
      return {
        values: async (values: Row) => {
          dataset.verification.push(values)
        },
      }
    },
  }
}

const USER_ID = 'user-1'

function emptyDataset(): Dataset {
  return { user: [{ id: USER_ID, email: null, phoneNumber: null }], verification: [] }
}

/** 取种子用户的 user 行（noUncheckedIndexedAccess 下需要显式断言）。 */
function seededUser(dataset: Dataset): Row {
  const row = dataset.user.find((candidate) => candidate.id === USER_ID)
  assert.ok(row, '种子用户应存在')
  return row
}

test('占位邮箱（手机号派生）视为未绑定邮箱', () => {
  assert.equal(isSyntheticPhoneEmail('13800138000@gpurun.cn', '13800138000'), true)
  assert.equal(isSyntheticPhoneEmail('real@example.com', '13800138000'), false)
  assert.equal(isSyntheticPhoneEmail('13800138000@gpurun.cn', '13900139000'), false)
  assert.equal(isSyntheticPhoneEmail(null, '13800138000'), false)
  assert.equal(isSyntheticPhoneEmail('no-at-sign', '13800138000'), false)

  assert.equal(hasBoundEmail({ email: '13800138000@gpurun.cn', phoneNumber: '13800138000' }), false)
  assert.equal(hasBoundEmail({ email: null, phoneNumber: null }), false)
  assert.equal(hasBoundEmail({ email: 'real@example.com', phoneNumber: null }), true)
  assert.equal(hasBoundEmail({ email: '', phoneNumber: '13800138000' }), false)
})

test('手机号绑定状态判定', () => {
  assert.equal(hasBoundPhone({ phoneNumber: '13800138000' }), true)
  assert.equal(hasBoundPhone({ phoneNumber: '  ' }), false)
  assert.equal(hasBoundPhone({ phoneNumber: null }), false)
})

test('绑定验证码为 6 位数字', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateContactCode()
    assert.match(code, /^\d{6}$/)
  }
})

test('验证码标识绑定到用户与手机号', () => {
  const identifier = buildContactIdentifier('phone', USER_ID, '13800138000')
  assert.equal(identifier, `bind-phone:${USER_ID}:13800138000`)
  assert.deepEqual(parseContactIdentifier(identifier), {
    channel: 'phone',
    userId: USER_ID,
    target: '13800138000',
  })
  assert.equal(parseContactIdentifier('bind-phone:user-1:'), null)
  assert.equal(parseContactIdentifier('other:user-1:13800138000'), null)
  // 邮箱与手机号渠道互不串用
  assert.equal(
    parseContactIdentifier(buildContactIdentifier('email', USER_ID, 'a@b.com'))?.channel,
    'email'
  )
})

test('渠道绑定状态判定', () => {
  const synthetic = { email: '13800138000@gpurun.cn', phoneNumber: '13800138000' }
  assert.equal(isChannelBound('email', synthetic), false)
  assert.equal(isChannelBound('phone', synthetic), true)
  assert.equal(isChannelBound('email', { email: 'a@b.com', phoneNumber: null }), true)
  assert.equal(isChannelBound('phone', { email: 'a@b.com', phoneNumber: null }), false)
})

test('验证码校验通过后立即作废，不能重复使用', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' })

  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' }),
    'ok'
  )
  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' }),
    'invalid'
  )
  assert.equal(dataset.verification.length, 0)
})

test('验证码只认发码时的手机号，不能用在其他号码上', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' })

  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13900139000', code: '123456' }),
    'invalid'
  )
  // 原号码的验证码仍然有效
  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' }),
    'ok'
  )
})

test('验证码只认发码时的用户，不能被其他用户拿去绑定', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' })

  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: 'attacker', target: '13800138000', code: '123456' }),
    'invalid'
  )
})

test('错误次数超限后验证码作废', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' })

  for (let i = 0; i < 5; i++) {
    assert.equal(
      await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '000000' }),
      'invalid'
    )
  }

  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' }),
    'too-many-attempts'
  )
  assert.equal(dataset.verification.length, 0)
})

test('过期验证码无法通过校验', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' })
  const [row] = dataset.verification
  assert.ok(row)
  row.expiresAt = new Date(Date.now() - 1000)

  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' }),
    'expired'
  )
  assert.equal(dataset.verification.length, 0)
})

test('重发验证码会作废上一条', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '111111' })
  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '222222' })

  assert.equal(dataset.verification.length, 1)
  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '111111' }),
    'invalid'
  )
  assert.equal(
    await verifyContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '222222' }),
    'ok'
  )
})

test('验证码在数据库中不落明文', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, { channel: 'phone', userId: USER_ID, target: '13800138000', code: '123456' })

  const [row] = dataset.verification
  assert.ok(row)
  assert.ok(!String(row.value).includes('123456'), 'verification.value 不应包含明文验证码')
})

test('手机号被其他用户占用时拒绝绑定', async () => {
  const dataset = emptyDataset()
  dataset.user.push({ id: 'user-2', email: null, phoneNumber: '13800138000' })
  const db = createFakeDb(dataset)

  assert.equal(await bindPhoneToUser(db, { userId: USER_ID, phone: '13800138000' }), 'taken')
  assert.notEqual(seededUser(dataset).phoneNumber, '13800138000')
})

test('绑定手机号后写入 user 行并标记已验证', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  assert.equal(await bindPhoneToUser(db, { userId: USER_ID, phone: '13800138000' }), 'ok')
  assert.equal(seededUser(dataset).phoneNumber, '13800138000')
  assert.equal(seededUser(dataset).phoneNumberVerified, true)
})

test('重新绑定自己的手机号不被视为冲突', async () => {
  const dataset = emptyDataset()
  seededUser(dataset).phoneNumber = '13800138000'
  const db = createFakeDb(dataset)

  assert.equal(await bindPhoneToUser(db, { userId: USER_ID, phone: '13800138000' }), 'ok')
  assert.equal(seededUser(dataset).phoneNumberVerified, true)
})

test('用户不存在时不会静默成功', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  assert.equal(await bindPhoneToUser(db, { userId: 'ghost', phone: '13800138000' }), 'user-not-found')
})

test('验证码邮件语言跟随 Cookie，非法值回退默认语言', () => {
  const options = { cookieName: 'NEXT_LOCALE', locales: ['zh', 'en'] as const, fallback: 'zh' as const }

  assert.equal(resolveLocaleFromCookieHeader('NEXT_LOCALE=en', options), 'en')
  assert.equal(resolveLocaleFromCookieHeader('a=1; NEXT_LOCALE=en; b=2', options), 'en')
  assert.equal(resolveLocaleFromCookieHeader('NEXT_LOCALE=en%2DUS', options), 'zh')
  assert.equal(resolveLocaleFromCookieHeader('OTHER=en', options), 'zh')
  assert.equal(resolveLocaleFromCookieHeader('NEXT_LOCALE_X=en', options), 'zh')
  assert.equal(resolveLocaleFromCookieHeader(undefined, options), 'zh')
  assert.equal(resolveLocaleFromCookieHeader('', options), 'zh')
})

test('邮箱验证码与手机号验证码互不影响', async () => {
  const dataset = emptyDataset()
  const db = createFakeDb(dataset)

  await issueContactCode(db, {
    channel: 'phone',
    userId: USER_ID,
    target: '13800138000',
    code: '111111',
  })
  await issueContactCode(db, {
    channel: 'email',
    userId: USER_ID,
    target: 'new@example.com',
    code: '222222',
  })
  assert.equal(dataset.verification.length, 2)

  assert.equal(
    await verifyContactCode(db, {
      channel: 'email',
      userId: USER_ID,
      target: 'new@example.com',
      code: '222222',
    }),
    'ok'
  )
  assert.equal(
    await verifyContactCode(db, {
      channel: 'phone',
      userId: USER_ID,
      target: '13800138000',
      code: '111111',
    }),
    'ok'
  )
})

test('邮箱与手机号绑定到同一个 userId', async () => {
  const dataset = emptyDataset()
  dataset.user[0] = {
    id: USER_ID,
    email: '13800138000@gpurun.cn',
    phoneNumber: null,
  }
  const db = createFakeDb(dataset)

  assert.equal(
    await bindEmailToUser(db, { userId: USER_ID, email: 'Real@Example.com' }),
    'ok'
  )
  assert.equal(await bindPhoneToUser(db, { userId: USER_ID, phone: '13800138000' }), 'ok')

  const bound = seededUser(dataset)
  // 同一个 users 行同时持有真实邮箱与手机号
  assert.equal(bound.email, 'real@example.com')
  assert.equal(bound.emailVerified, true)
  assert.equal(bound.phoneNumber, '13800138000')
  assert.equal(bound.phoneNumberVerified, true)
  // 绑定真实邮箱后不再被判定为占位邮箱
  assert.equal(hasBoundEmail(bound), true)
  assert.equal(dataset.user.length, 1)
})

test('邮箱被其他用户占用时拒绝绑定', async () => {
  const dataset = emptyDataset()
  dataset.user.push({ id: 'user-2', email: 'taken@example.com', phoneNumber: null })
  const db = createFakeDb(dataset)

  assert.equal(
    await bindEmailToUser(db, { userId: USER_ID, email: 'taken@example.com' }),
    'taken'
  )
  assert.notEqual(seededUser(dataset).email, 'taken@example.com')
})

test('手机号归一化：去分隔符与 86 国际区号', () => {
  assert.equal(normalizeContactPhone('138 0013 8000'), '13800138000')
  assert.equal(normalizeContactPhone('138-0013-8000'), '13800138000')
  assert.equal(normalizeContactPhone('+8613800138000'), '13800138000')
  assert.equal(normalizeContactPhone('8613800138000'), '13800138000')
  // 去掉 86 后不是 11 位时不做剥离，避免静默截断成另一个号码
  assert.equal(normalizeContactPhone('861380013800'), '861380013800')
  assert.equal(normalizeContactPhone('86138001380001234'), '86138001380001234')
  assert.equal(normalizeContactPhone('13800138000'), '13800138000')
  assert.equal(normalizeContactPhone(''), '')
})
