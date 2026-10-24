/**
 * Region → REST base URL maps.
 * Daraz defaults emphasize LK (Sri Lanka); other regions remain configurable.
 */

export type DarazRegion = "pk" | "bd" | "lk" | "np" | "mm"
export type LazadaRegion = "sg" | "my" | "th" | "vn" | "ph" | "id"
export type TiktokRegion = "global" | "us" | "eu" | "sg"

export const DEFAULT_DARAZ_REGION: DarazRegion = "lk"
export const DEFAULT_LAZADA_REGION: LazadaRegion = "sg"
export const DEFAULT_TIKTOK_REGION: TiktokRegion = "global"

/** Daraz seller API gateways (LAZOP `/rest`). */
export const DARAZ_REST_ENDPOINTS: Record<DarazRegion, string> = {
  pk: "https://api.daraz.pk/rest",
  bd: "https://api.daraz.com.bd/rest",
  lk: "https://api.daraz.lk/rest",
  np: "https://api.daraz.com.np/rest",
  mm: "https://api.shop.com.mm/rest",
}

/** Lazada seller API gateways (LAZOP `/rest`). */
export const LAZADA_REST_ENDPOINTS: Record<LazadaRegion, string> = {
  sg: "https://api.lazada.sg/rest",
  my: "https://api.lazada.com.my/rest",
  th: "https://api.lazada.co.th/rest",
  vn: "https://api.lazada.vn/rest",
  ph: "https://api.lazada.com.ph/rest",
  id: "https://api.lazada.co.id/rest",
}

/** Shared Lazop OAuth authorize + token hosts. */
export const LAZOP_AUTH = {
  authorizeUrl: "https://auth.lazada.com/oauth/authorize",
  /** Token exchange uses the regional REST host with `/auth/token/create` etc. */
  tokenPathCreate: "/auth/token/create",
  tokenPathRefresh: "/auth/token/refresh",
} as const

export const TIKTOK_ENDPOINTS: Record<
  TiktokRegion,
  { apiBase: string; authBase: string }
> = {
  global: {
    apiBase: "https://open-api.tiktokglobalshop.com",
    authBase: "https://auth.tiktok-shops.com",
  },
  us: {
    apiBase: "https://open-api.tiktokshop.us",
    authBase: "https://auth.tiktok-shops.com",
  },
  eu: {
    apiBase: "https://open-api.tiktokshop.eu",
    authBase: "https://auth.tiktok-shops.com",
  },
  sg: {
    apiBase: "https://open-api.tiktokglobalshop.com",
    authBase: "https://auth.tiktok-shops.com",
  },
}

export function normalizeRegion(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase()
}

export function resolveDarazRestBase(region?: string): string {
  const key = (normalizeRegion(region) || DEFAULT_DARAZ_REGION) as DarazRegion
  return DARAZ_REST_ENDPOINTS[key] ?? DARAZ_REST_ENDPOINTS[DEFAULT_DARAZ_REGION]
}

export function resolveLazadaRestBase(region?: string): string {
  const key = (normalizeRegion(region) || DEFAULT_LAZADA_REGION) as LazadaRegion
  return LAZADA_REST_ENDPOINTS[key] ?? LAZADA_REST_ENDPOINTS[DEFAULT_LAZADA_REGION]
}

export function resolveTiktokEndpoints(region?: string) {
  const key = (normalizeRegion(region) || DEFAULT_TIKTOK_REGION) as TiktokRegion
  return TIKTOK_ENDPOINTS[key] ?? TIKTOK_ENDPOINTS[DEFAULT_TIKTOK_REGION]
}
