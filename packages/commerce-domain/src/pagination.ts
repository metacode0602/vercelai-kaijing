export function normalizeLimit(value?: number, fallback = 20, max = 100): number {
  if (!Number.isFinite(value) || !value || value <= 0) return fallback
  return Math.min(Math.floor(value), max)
}

export function normalizeOffset(value?: number): number {
  if (!Number.isFinite(value) || !value || value < 0) return 0
  return Math.floor(value)
}
