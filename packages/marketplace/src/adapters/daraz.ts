import { LazopConnectorBase } from "./lazop-base"
import type { MarketplaceConnectorConfig } from "./types"
import type { DomainImCapabilityInfo } from "../domain/types"
import { DEFAULT_DARAZ_REGION } from "../regions/endpoints"

export class DarazConnector extends LazopConnectorBase {
  readonly platform = "daraz" as const

  /**
   * Daraz 复用 Lazop 体系，但 docs/design/platform-apis/daraz 目录未独立确认 IM API。
   * 暂标 'unknown'，待 Daraz 文档补充后改 known_unimplemented / ready。
   */
  override imCapability: DomainImCapabilityInfo = {
    capability: 'unknown',
    docRef: 'docs/design/platform-apis/daraz',
    note: 'Daraz 复用 Lazop 体系，IM API 未在 daraz 文档独立确认。',
  }

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
