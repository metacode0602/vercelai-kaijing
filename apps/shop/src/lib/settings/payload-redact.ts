/**
 * Redact secrets from integration log payload summaries before returning to clients.
 */

const SENSITIVE_KEY =
  /^(access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|passwd|authorization|auth|api[_-]?key|client[_-]?secret|credential|payload[_-]?encrypted|bearer)$/i

const SENSITIVE_INLINE =
  /(access_token|refresh_token|client_secret|authorization|bearer\s+[a-z0-9._\-]+|api[_-]?key\s*[:=]\s*\S+)/gi

export function redactValue(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    return value.replace(SENSITIVE_INLINE, '[REDACTED]')
  }
  if (Array.isArray(value)) {
    return value.map(redactValue)
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redactValue(v)
    }
    return out
  }
  return value
}

export function redactPayloadSummary(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const text = raw.trim()
  try {
    const parsed = JSON.parse(text) as unknown
    return JSON.stringify(redactValue(parsed))
  } catch {
    return text.replace(SENSITIVE_INLINE, '[REDACTED]')
  }
}

/** Extract syncTaskId from a redacted/unredacted payload JSON if present. */
export function extractSyncTaskIdFromPayload(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as { taskId?: unknown; syncTaskId?: unknown }
    const id = parsed.taskId ?? parsed.syncTaskId
    return typeof id === 'string' && id.trim() ? id.trim() : null
  } catch {
    return null
  }
}
