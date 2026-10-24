import { LazopConnectorBase } from "./lazop-base"
import type { MarketplaceConnectorConfig } from "./types"
import { DEFAULT_DARAZ_REGION } from "../regions/endpoints"

export class DarazConnector extends LazopConnectorBase {
  readonly platform = "daraz" as const

  constructor(cfg: MarketplaceConnectorConfig) {
    super("daraz", {
      ...cfg,
      region: cfg.region ?? DEFAULT_DARAZ_REGION,
      platform: "daraz",
    })
  }
}

export function createDarazConnector(cfg: Omit<MarketplaceConnectorConfig, "platform">) {
  return new DarazConnector({ ...cfg, platform: "daraz" })
}
