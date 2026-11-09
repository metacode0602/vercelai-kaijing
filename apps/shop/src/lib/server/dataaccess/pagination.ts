export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export function normalizePage(page?: number): number {
  const n = Number(page)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

export function normalizePageSize(pageSize?: number, max = 100): number {
  const n = Number(pageSize)
  if (!Number.isFinite(n) || n < 1) return 20
  return Math.min(Math.floor(n), max)
}
