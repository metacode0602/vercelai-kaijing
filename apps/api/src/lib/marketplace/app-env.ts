export interface MarketplaceAppCredentials {
  appKey: string
  appSecret: string
  defaultRegion: string
}

export type LazopPlatform = "daraz" | "lazada"

export function getMarketplaceAppCredentials(
  platform: LazopPlatform
): MarketplaceAppCredentials {
  if (platform === "daraz") {
    return {
      appKey: process.env.DARAZ_APP_KEY ?? "",
      appSecret: process.env.DARAZ_APP_SECRET ?? "",
      defaultRegion: process.env.DARAZ_DEFAULT_REGION || "lk",
    }
  }
  return {
    appKey: process.env.LAZADA_APP_KEY ?? "",
    appSecret: process.env.LAZADA_APP_SECRET ?? "",
    defaultRegion: process.env.LAZADA_DEFAULT_REGION || "sg",
  }
}

export function isLazopPlatform(platform: string): platform is LazopPlatform {
  return platform === "daraz" || platform === "lazada"
}

export function resolveLazopPlatformFromSite(
  site: string | undefined
): LazopPlatform | null {
  const normalized = (site ?? "").trim().toLowerCase()
  if (normalized.startsWith("lazada")) return "lazada"
  if (normalized.startsWith("daraz")) return "daraz"
  return null
}

export function resolveLazopPlatformFromAppKey(
  appKey: string | undefined
): LazopPlatform | null {
  if (!appKey) return null
  if (appKey === process.env.LAZADA_APP_KEY) return "lazada"
  if (appKey === process.env.DARAZ_APP_KEY) return "daraz"
  return null
}
