/**
 * 调用通道。MCP 与控制台共用领域实现，但写策略不同。
 * @see docs/design/open-shop-desktop-mcp-upgrade-2026-11-12.md §5 / §8
 */
export const domainActorChannels = ['console', 'mcp'] as const
export type DomainActorChannel = (typeof domainActorChannels)[number]

export type DomainActor = {
  channel: DomainActorChannel
  organizationId: string
  userId?: string
  serviceName?: string
  clientId?: string
  requestId?: string
}

export function isMcpActor(actor: DomainActor): boolean {
  return actor.channel === 'mcp'
}

/** MCP 通道禁止直接走这些会触发平台写回的动作。 */
export const mcpForbiddenWriteActions = [
  'listings.publish',
  'listings.deactivate',
  'listings.updateLivePrice',
  'sync.enqueue.inventory',
  'sync.enqueue.price',
  'sync.enqueue.publish',
  'pending.confirm',
  'pending.reject',
] as const

export type McpForbiddenWriteAction = (typeof mcpForbiddenWriteActions)[number]

export function assertMcpWriteAllowed(actor: DomainActor, action: string): void {
  if (actor.channel !== 'mcp') return
  if ((mcpForbiddenWriteActions as readonly string[]).includes(action)) {
    throw new Error(`MCP 通道禁止直接执行 ${action}，请创建待审并由运营在 /console/pending 确认`)
  }
}
