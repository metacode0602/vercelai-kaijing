import type { MarketplacePlatform } from "../domain/types"
import type { MarketplaceConnector, MarketplaceConnectorConfig } from "./types"
import { DarazConnector } from "./daraz"
import { LazadaConnector } from "./lazada"
import { TiktokConnector } from "./tiktok"

export function createMarketplaceConnector(
  cfg: MarketplaceConnectorConfig,
): MarketplaceConnector {
  switch (cfg.platform) {
    case "daraz":
      return new DarazConnector(cfg)
    case "lazada":
      return new LazadaConnector(cfg)
    case "tiktok_shop":
      return new TiktokConnector(cfg)
    default: {
      const _exhaustive: never = cfg.platform
      throw new Error(`Unsupported marketplace platform: ${_exhaustive}`)
    }
  }
}

export function isMarketplacePlatform(value: string): value is MarketplacePlatform {
  return value === "daraz" || value === "lazada" || value === "tiktok_shop"
}
