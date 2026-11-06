export const UI_NOTIFICATION_CATEGORIES = [
  'inventory',
  'order',
  'shop',
  'sourcing',
  'finance',
  'system',
] as const
export type UiNotificationCategory = (typeof UI_NOTIFICATION_CATEGORIES)[number]

export function toUiNotificationCategory(v: string | null | undefined): UiNotificationCategory {
  const x = (v ?? 'system').toLowerCase()
  return (UI_NOTIFICATION_CATEGORIES as readonly string[]).includes(x)
    ? (x as UiNotificationCategory)
    : 'system'
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const x = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(x.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}`
}
