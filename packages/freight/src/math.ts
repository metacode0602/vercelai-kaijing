/** Shared rounding / carton volume helpers for landed-cost and pricing. */

export function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

/** 箱体积（cm → CBM） */
export function cbmPerCartonCm(lengthCm: number, widthCm: number, heightCm: number) {
  return (lengthCm * widthCm * heightCm) / 1_000_000
}

/** 单件体积 = 箱体积 ÷ 每箱件数 */
export function pieceCbm(cartonCbm: number, unitsPerCarton: number) {
  const upc = Math.max(1, unitsPerCarton)
  return cartonCbm / upc
}

/** 单件毛重 = 箱毛重 ÷ 每箱件数。weight_grams 为净重，不算毛重。 */
export function pieceGrossKg(cartonGrossKg: number, unitsPerCarton: number) {
  const upc = Math.max(1, unitsPerCarton)
  return cartonGrossKg / upc
}

/** 规范化 HS：去掉点/空格，保留数字（及末尾字母若有）。 */
export function normalizeHsCode(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[.\s]/g, '').toUpperCase()
}
