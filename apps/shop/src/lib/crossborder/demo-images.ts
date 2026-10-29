function svgDataUrl(label: string, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="160" cy="132" r="58" fill="rgba(255,255,255,0.22)"/><circle cx="160" cy="132" r="34" fill="rgba(255,255,255,0.35)"/><text x="160" y="248" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const DEMO_IMAGES = {
  teeBlack: svgDataUrl("TEE · BLACK", "#0f172a", "#334155"),
  teeWhite: svgDataUrl("TEE · WHITE", "#64748b", "#e2e8f0"),
  teeGrey: svgDataUrl("TEE · GREY", "#475569", "#94a3b8"),
  hub: svgDataUrl("USB-C HUB", "#1e3a8a", "#38bdf8"),
  mat: svgDataUrl("YOGA MAT", "#065f46", "#34d399"),
  bag: svgDataUrl("TOTE BAG", "#7c2d12", "#fb923c"),
  lamp: svgDataUrl("DESK LAMP", "#713f12", "#facc15"),
  bottle: svgDataUrl("BOTTLE", "#0c4a6e", "#22d3ee"),
} as const
