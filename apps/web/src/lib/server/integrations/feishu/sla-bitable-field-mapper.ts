import 'server-only'

import {
  extractFeishuBitableFieldText,
  formatFeishuBitableDateValue,
  type FeishuBitableField,
  type FeishuBitableRecord,
} from './bitable-client'
import type { SlaBitableFieldMapping, SlaBitableSyncKind } from '@/lib/types/sla-bitable-import'
import {
  SLA_BITABLE_HEADER_ALIASES,
  SLA_CANONICAL_HEADERS_BY_KIND,
  SLA_REQUIRED_HEADERS_BY_KIND,
} from '@/lib/types/sla-bitable-import'

const DATE_CANONICAL_HEADERS = new Set([
  'report_received_at',
  'fault_started_at',
  'fault_ended_at',
  'expected_at',
  'actual_started_at',
  'actual_returned_at',
  'actual_shelved_at',
  'start_date',
  'end_date',
])

function normHeader(s: string): string {
  return s.replace(/^\ufeff/, '').trim().replace(/\s+/g, '').toLowerCase()
}

function headerMatchesAlias(canonical: string, bitableFieldName: string): boolean {
  const normalized = normHeader(bitableFieldName)
  if (normHeader(canonical) === normalized) return true
  for (const [alias, target] of Object.entries(SLA_BITABLE_HEADER_ALIASES)) {
    if (target === canonical && normHeader(alias) === normalized) return true
  }
  return false
}

export function getCanonicalHeadersForSlaSyncKind(syncKind: SlaBitableSyncKind): string[] {
  return [...SLA_CANONICAL_HEADERS_BY_KIND[syncKind]]
}

export function getRequiredHeadersForSlaSyncKind(syncKind: SlaBitableSyncKind): string[] {
  return [...SLA_REQUIRED_HEADERS_BY_KIND[syncKind]]
}

export function autoMatchSlaBitableFields(
  bitableFields: FeishuBitableField[],
  syncKind: SlaBitableSyncKind,
): SlaBitableFieldMapping {
  const mapping: SlaBitableFieldMapping = {}
  for (const canonical of SLA_CANONICAL_HEADERS_BY_KIND[syncKind]) {
    const matched = bitableFields.find((field) => headerMatchesAlias(canonical, field.field_name))
    if (matched) {
      mapping[canonical] = matched.field_id
    }
  }
  return mapping
}

export function buildSlaFieldIdToNameMap(
  bitableFields: FeishuBitableField[],
): Map<string, string> {
  return new Map(bitableFields.map((field) => [field.field_id, field.field_name]))
}

function extractMappedCellValue(
  record: FeishuBitableRecord,
  fieldId: string,
  fieldIdToName: Map<string, string>,
  canonicalHeader: string,
): string {
  const fieldName = fieldIdToName.get(fieldId)
  if (!fieldName) return ''
  const raw = record.fields[fieldName]
  if (DATE_CANONICAL_HEADERS.has(canonicalHeader)) {
    return formatFeishuBitableDateValue(raw)
  }
  return extractFeishuBitableFieldText(raw)
}

export function mapSlaBitableRecordsToImportRows(input: {
  records: FeishuBitableRecord[]
  fieldMapping: SlaBitableFieldMapping
  fieldIdToName: Map<string, string>
  syncKind: SlaBitableSyncKind
}): Array<{ bitableRecordId: string; canonical: Record<string, string> }> {
  const headers = SLA_CANONICAL_HEADERS_BY_KIND[input.syncKind]
  const mappedHeaders = headers.filter((header) => input.fieldMapping[header])

  return input.records.map((record) => {
    const canonical: Record<string, string> = {}
    for (const header of headers) {
      canonical[header] = ''
    }
    for (const header of mappedHeaders) {
      const fieldId = input.fieldMapping[header]
      if (!fieldId) continue
      canonical[header] = extractMappedCellValue(record, fieldId, input.fieldIdToName, header)
    }
    return { bitableRecordId: record.record_id, canonical }
  })
}

export function validateSlaFieldMapping(
  fieldMapping: SlaBitableFieldMapping,
  syncKind: SlaBitableSyncKind,
): string[] {
  return getRequiredHeadersForSlaSyncKind(syncKind).filter((header) => !fieldMapping[header])
}

export {
  filterRecordsByCursor,
  computeNextCursor,
} from '@/lib/server/integrations/feishu/bitable-field-mapper'
