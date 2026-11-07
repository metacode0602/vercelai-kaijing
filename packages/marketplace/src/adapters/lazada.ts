import { LazopConnectorBase } from "./lazop-base"
import type { MarketplaceConnectorConfig } from "./types"
import { DEFAULT_LAZADA_REGION } from "../regions/endpoints"
import type { DomainReverseDecideInput } from "../domain/types"

export class LazadaConnector extends LazopConnectorBase {
  readonly platform = "lazada" as const

  constructor(cfg: MarketplaceConnectorConfig) {
    super("lazada", {
      ...cfg,
      region: cfg.region ?? DEFAULT_LAZADA_REGION,
      platform: "lazada",
    })
  }

  /**
   * 卖家同意/拒绝退款决定。
   * CANCEL → /order/reverse/cancel/seller/decide（agree_cancel + reason_code）
   * ONLY_REFUND → /order/reverse/onlyrefund/seller/decide（action=agreeRefund/startDispute）
   * Daraz 公开文档未提供 seller decide，故仅 Lazada 实现。
   * @see docs/design/platform-apis/lazada/lazada-aftersales-api.md §7
   */
  async decideReverse(
    input: DomainReverseDecideInput
  ): Promise<{ ok: boolean; raw?: Record<string, unknown> }> {
    if (input.requestType === "CANCEL") {
      const json = await this.http.call({
        path: "/order/reverse/cancel/seller/decide",
        params: {
          reverse_order_id: input.externalReverseOrderId,
          agree_cancel: input.agree ? "true" : "false",
          ...(input.reasonCode ? { reason_code: input.reasonCode } : {}),
        },
      })
      return { ok: true, raw: json as Record<string, unknown> }
    }
    // ONLY_REFUND
    const action = input.agree ? "agreeRefund" : "startDispute"
    const json = await this.http.call({
      path: "/order/reverse/onlyrefund/seller/decide",
      params: {
        reverse_order_id: input.externalReverseOrderId,
        reverse_order_item_ids: JSON.stringify([
          input.externalReverseOrderId,
        ]),
        action,
        ...(input.comment ? { comment: input.comment } : {}),
      },
    })
    return { ok: true, raw: json as Record<string, unknown> }
  }
}

export function createLazadaConnector(cfg: Omit<MarketplaceConnectorConfig, "platform">) {
  return new LazadaConnector({ ...cfg, platform: "lazada" })
}
