export const DEFAULT_PAGE_SIZE = 20

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const

export function normalizePage(page?: number) {
  return Math.max(1, Math.trunc(page ?? 1))
}

export function normalizePageSize(pageSize?: number, fallback = DEFAULT_PAGE_SIZE) {
  return Math.min(100, Math.max(1, Math.trunc(pageSize ?? fallback)))
}

export function pageValues(page?: number, pageSize?: number) {
  return {
    page: normalizePage(page),
    pageSize: normalizePageSize(pageSize),
  }
}
