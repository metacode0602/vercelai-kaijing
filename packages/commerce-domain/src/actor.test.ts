import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertMcpWriteAllowed, type DomainActor } from './actor'

const mcpActor: DomainActor = { channel: 'mcp', organizationId: 'org_1', userId: 'user_1' }
const consoleActor: DomainActor = { channel: 'console', organizationId: 'org_1', userId: 'user_1' }

test('MCP 禁止直接发布刊登、改已上架价或入队写同步', () => {
  assert.throws(() => assertMcpWriteAllowed(mcpActor, 'listings.publish'), /禁止直接执行/)
  assert.throws(() => assertMcpWriteAllowed(mcpActor, 'listings.updateLivePrice'), /禁止直接执行/)
  assert.throws(() => assertMcpWriteAllowed(mcpActor, 'sync.enqueue.price'), /禁止直接执行/)
  assert.throws(() => assertMcpWriteAllowed(mcpActor, 'pending.confirm'), /禁止直接执行/)
})

test('控制台通道仍可走现有写回', () => {
  assert.doesNotThrow(() => assertMcpWriteAllowed(consoleActor, 'listings.publish'))
  assert.doesNotThrow(() => assertMcpWriteAllowed(consoleActor, 'sync.enqueue.inventory'))
})

test('MCP 允许创建待审', () => {
  assert.doesNotThrow(() => assertMcpWriteAllowed(mcpActor, 'pending.create_price_change'))
})
