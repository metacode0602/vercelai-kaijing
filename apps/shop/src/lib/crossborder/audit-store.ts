'use client'

/**
 * audit_events 原型会话 — 对齐 schema audit_events / ERP_DEMO_AUDIT_LOGS。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import { ERP_DEMO_AUDIT_LOGS } from '@/lib/crossborder/erp-ued-data'

export type AuditEvent = {
  id: string
  at: string
  actor: string
  action: string
  object: string
  entityType: string
  result: string
  detail: string
}

function seed(): AuditEvent[] {
  return ERP_DEMO_AUDIT_LOGS.map((row, index) => ({
    id: `AUD-${String(index + 1).padStart(4, '0')}`,
    at: row.at,
    actor: row.actor,
    action: row.action,
    object: row.object,
    entityType: row.object.startsWith('PR-')
      ? 'purchase'
      : row.object.startsWith('IMP-')
        ? 'import'
        : 'system',
    result: row.result,
    detail: row.detail,
  }))
}

const store = createDemoStore<AuditEvent[]>('open-shop.console.demo.audit.v1', seed())

export function useAuditEvents() {
  return store.useStore()
}

export function getAuditEvents() {
  return store.get()
}

export function appendAuditEvent(input: Omit<AuditEvent, 'id' | 'at'> & { at?: string }) {
  const list = store.get()
  const row: AuditEvent = {
    id: `AUD-${String(list.length + 1).padStart(4, '0')}`,
    at: input.at || new Date().toLocaleString('zh-CN', { hour12: false }),
    actor: input.actor,
    action: input.action,
    object: input.object,
    entityType: input.entityType,
    result: input.result,
    detail: input.detail,
  }
  store.set([row, ...list])
  return row
}
