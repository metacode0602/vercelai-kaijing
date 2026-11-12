import { auditEvents, type AppDatabase } from "@workspace/db"
import type { DomainActor } from "./actor"

export async function recordMcpAudit(
  db: AppDatabase,
  actor: DomainActor,
  input: {
    action: string
    entityType: string
    entityId?: string | null
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    result?: string
    detail?: string | null
  },
): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorUserId: actor.userId ?? null,
    actorLabel: actor.clientId ? `mcp:${actor.clientId}` : actor.userId ?? "mcp",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    result: input.result ?? "ok",
    detail: input.detail ?? null,
  })
}

export function actorName(actor: DomainActor): string {
  return actor.userId?.trim() || (actor.clientId ? `mcp:${actor.clientId}` : "mcp")
}
