import { LazopConnectorBase } from "./lazop-base"
import type { MarketplaceConnectorConfig } from "./types"
import { DEFAULT_LAZADA_REGION } from "../regions/endpoints"

export class LazadaConnector extends LazopConnectorBase {
  readonly platform = "lazada" as const

  constructor(cfg: MarketplaceConnectorConfig) {
    super("lazada", {
      ...cfg,
      region: cfg.region ?? DEFAULT_LAZADA_REGION,
      platform: "lazada",
    })
  }
}

export function createLazadaConnector(cfg: Omit<MarketplaceConnectorConfig, "platform">) {
  return new LazadaConnector({ ...cfg, platform: "lazada" })
}
