import type {
  DomainBatchShipFailure,
  DomainBatchShipInput,
  DomainBatchShipPackage,
  DomainBatchShipResult,
} from "../domain/types"
import type { MarketplaceConnector } from "./types"

/**
 * 逐包裹调用 connector.shipOrder 完成批次交运。
 * 不假设平台有批量接口；失败累积到 failures，不中断后续包裹。
 * 调用方负责按 shopId 分组后传入对应 connector。
 */
export async function shipBatchViaConnector(
  connector: MarketplaceConnector,
  input: DomainBatchShipInput,
): Promise<DomainBatchShipResult> {
  const failures: DomainBatchShipFailure[] = []
  let shippedCount = 0
  for (const pkg of input.packages) {
    const outcome = await shipOnePackage(connector, pkg)
    if (outcome.ok) {
      shippedCount += 1
    } else {
      failures.push({
        externalPackageId: pkg.externalPackageId,
        message: outcome.message,
      })
    }
  }
  return {
    ok: failures.length === 0,
    shippedCount,
    failures,
    raw: { batchId: input.batchId, packageCount: input.packages.length },
  }
}

async function shipOnePackage(
  connector: MarketplaceConnector,
  pkg: DomainBatchShipPackage,
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await connector.shipOrder({
      externalOrderId: pkg.externalOrderId,
      orderItemIds: pkg.orderItemIds,
      packageId: pkg.platformPackageId,
      trackingNumber: pkg.trackingNumber,
      shipmentProviderCode: pkg.shipmentProviderCode,
    })
    if (result.ok) return { ok: true, message: "" }
    const message =
      result.itemResults
        ?.map((r) => r.message)
        .filter(Boolean)
        .join("; ") || "平台返回失败"
    return { ok: false, message }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
