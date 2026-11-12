export const DEFAULT_TIME_ZONE = "Asia/Shanghai"

export function formatLocalDay(date: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/** Asia/Shanghai 全年 UTC+8，无夏令时。其他时区按 +08 近似，并在结果中标明 timeZone。 */
export function startOfLocalDay(day: string, timeZone = DEFAULT_TIME_ZONE): Date {
  const offset = timeZone === DEFAULT_TIME_ZONE || timeZone === "Asia/Shanghai" ? "+08:00" : "+08:00"
  return new Date(`${day}T00:00:00${offset}`)
}

export function endOfLocalDay(day: string, timeZone = DEFAULT_TIME_ZONE): Date {
  const offset = timeZone === DEFAULT_TIME_ZONE || timeZone === "Asia/Shanghai" ? "+08:00" : "+08:00"
  return new Date(`${day}T23:59:59.999${offset}`)
}

export function dayBounds(input?: {
  now?: Date
  dateFrom?: string | Date | null
  dateTo?: string | Date | null
  timeZone?: string | null
}): {
  asOf: string
  dateFrom: Date
  dateTo: Date
  timeZone: string
} {
  const timeZone = input?.timeZone?.trim() || DEFAULT_TIME_ZONE
  const now = input?.now ?? new Date()
  const from = input?.dateFrom
    ? input.dateFrom instanceof Date
      ? input.dateFrom
      : startOfLocalDay(input.dateFrom.slice(0, 10), timeZone)
    : startOfLocalDay(formatLocalDay(now, timeZone), timeZone)
  const to = input?.dateTo
    ? input.dateTo instanceof Date
      ? input.dateTo
      : endOfLocalDay(input.dateTo.slice(0, 10), timeZone)
    : endOfLocalDay(formatLocalDay(from, timeZone), timeZone)
  return { asOf: now.toISOString(), dateFrom: from, dateTo: to, timeZone }
}

export function timeMeta(bounds: { asOf: string; dateFrom: Date; dateTo: Date; timeZone: string }) {
  return {
    asOf: bounds.asOf,
    dateFrom: bounds.dateFrom.toISOString(),
    dateTo: bounds.dateTo.toISOString(),
    timeZone: bounds.timeZone,
  }
}
