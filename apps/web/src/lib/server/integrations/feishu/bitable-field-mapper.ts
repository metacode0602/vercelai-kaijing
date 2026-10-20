import 'server-only'

import type { FeishuBitableRecord } from './bitable-client'

export type FeishuBitableSyncCursor = {
  lastModifiedMs?: number
  lastRecordId?: string
}

export function computeNextCursor(records: FeishuBitableRecord[]): FeishuBitableSyncCursor {
  if (records.length === 0) return {}
  let maxModified = 0
  let lastRecordId: string | undefined
  for (const record of records) {
    const modified = record.last_modified_time ?? 0
    if (modified > maxModified) {
      maxModified = modified
      lastRecordId = record.record_id
    } else if (modified === maxModified && record.record_id > (lastRecordId ?? '')) {
      lastRecordId = record.record_id
    }
  }
  return {
    lastModifiedMs: maxModified || undefined,
    lastRecordId,
  }
}

export function filterRecordsByCursor(
  records: FeishuBitableRecord[],
  cursor: FeishuBitableSyncCursor,
): FeishuBitableRecord[] {
  if (!cursor.lastModifiedMs) return records
  return records.filter((record) => {
    const modified = record.last_modified_time ?? 0
    if (modified > cursor.lastModifiedMs!) return true
    if (modified === cursor.lastModifiedMs! && cursor.lastRecordId) {
      return record.record_id > cursor.lastRecordId
    }
    return false
  })
}
