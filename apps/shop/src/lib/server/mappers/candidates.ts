export const UI_CANDIDATE_STATUSES = ['待审', '已通过', '已拒绝'] as const
export type UiCandidateStatus = (typeof UI_CANDIDATE_STATUSES)[number]

export const UI_CANDIDATE_SOURCES = ['手工录入', '导入', '寻源'] as const
export type UiCandidateSource = (typeof UI_CANDIDATE_SOURCES)[number]

const STATUS_TO_UI: Record<string, UiCandidateStatus> = {
  new: '待审',
  pending: '待审',
  accepted: '已通过',
  rejected: '已拒绝',
}

const STATUS_TO_DB: Record<string, string> = {
  待审: 'new',
  已通过: 'accepted',
  已拒绝: 'rejected',
  new: 'new',
  accepted: 'accepted',
  rejected: 'rejected',
}

const SOURCE_TO_UI: Record<string, UiCandidateSource> = {
  manual: '手工录入',
  import: '导入',
  sourcing: '寻源',
}

const SOURCE_TO_DB: Record<string, string> = {
  手工录入: 'manual',
  导入: 'import',
  寻源: 'sourcing',
  manual: 'manual',
  import: 'import',
  sourcing: 'sourcing',
}

export function toUiCandidateStatus(v: string | null | undefined): UiCandidateStatus {
  return STATUS_TO_UI[(v ?? 'new').toLowerCase()] ?? '待审'
}

export function toDbCandidateStatus(v: string | null | undefined, fallback = 'new'): string {
  if (!v) return fallback
  return STATUS_TO_DB[v] ?? STATUS_TO_DB[v.toLowerCase()] ?? fallback
}

export function toUiCandidateSource(v: string | null | undefined): UiCandidateSource {
  return SOURCE_TO_UI[(v ?? 'manual').toLowerCase()] ?? '手工录入'
}

export function toDbCandidateSource(v: string | null | undefined, fallback = 'manual'): string {
  if (!v) return fallback
  return SOURCE_TO_DB[v] ?? SOURCE_TO_DB[v.toLowerCase()] ?? fallback
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const x = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(x.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}`
}

export function money(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
