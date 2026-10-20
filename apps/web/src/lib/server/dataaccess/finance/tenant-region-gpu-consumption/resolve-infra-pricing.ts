import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import { mapTenantProductLineToPlatformListPrice } from '@/lib/monthly-cost/financials'
import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { parseDeviceModel } from '../baremetal-order-parse'
import {
  loadCostMasterDataContext,
  resolveDataCenterByContainerRegion,
  resolveDataCenterByName,
  resolveDataCenterForBareMetal,
  resolveGpuCardType,
} from '../cost-master-data'
import {
  DEFAULT_BAREMETAL_BILLING_UNIT,
  DEFAULT_TENANT_BILL_BILLING_UNIT,
  resolvePlatformListPriceAt,
} from '../platform-list-price'
import {
  loadPricingResolveContext,
  resolveUnitCostForDcCard,
  resolveUnitCostForPair,
} from '../tenant-bill-pricing'
import { normalizeBillingRegion } from '../tenant-bill-pricing'
import type { PricingResolveStatus } from './types'

export type InfraPricingSnapshot = {
  dataCenterId: string | null
  dataCenterCode: string | null
  dataCenterName: string | null
  gpuCardTypeId: string | null
  gpuCardTypeCode: string | null
  gpuCardTypeName: string | null
  pricingMode: string | null
  listPricePerHour: string | null
  unitPricePerHour: string | null
  revenueSharePercent: string | null
  platformCardListPriceId: string | null
  supplierUnitCostId: string | null
  supplierPricingRecordId: string | null
  pricingResolveStatus: PricingResolveStatus
}

function emptyInfra(status: PricingResolveStatus): InfraPricingSnapshot {
  return {
    dataCenterId: null,
    dataCenterCode: null,
    dataCenterName: null,
    gpuCardTypeId: null,
    gpuCardTypeCode: null,
    gpuCardTypeName: null,
    pricingMode: null,
    listPricePerHour: null,
    unitPricePerHour: null,
    revenueSharePercent: null,
    platformCardListPriceId: null,
    supplierUnitCostId: null,
    supplierPricingRecordId: null,
    pricingResolveStatus: status,
  }
}

function resolvePricingStatus(
  platformOk: boolean,
  unitCostOk: boolean,
  dcOk: boolean,
  cardOk: boolean,
): PricingResolveStatus {
  if (!dcOk) return 'region_not_found'
  if (!cardOk) return 'card_type_not_found'
  if (platformOk && unitCostOk) return 'ok'
  if (!platformOk && unitCostOk) return 'platform_list_price_not_found'
  if (platformOk && !unitCostOk) return 'pricing_pair_not_found'
  return 'pricing_pair_not_found'
}

export async function resolveInfraPricingSnapshot(input: {
  regionCode: string
  gpuModel: string
  usageDate: string
  productLine?: TenantRegionGpuProductLine
  idcName?: string | null
}): Promise<InfraPricingSnapshot> {
  const productLine = input.productLine ?? 'elastic_deployment'
  const platformProductLine = mapTenantProductLineToPlatformListPrice(productLine)
  const billingUnit =
    productLine === 'bare_metal' ? DEFAULT_BAREMETAL_BILLING_UNIT : DEFAULT_TENANT_BILL_BILLING_UNIT

  const masterCtx = await loadCostMasterDataContext()
  const regionCode = normalizeBillingRegion(input.regionCode)

  let dc =
    productLine === 'bare_metal'
      ? resolveDataCenterForBareMetal(masterCtx, regionCode)
      : resolveDataCenterByContainerRegion(masterCtx, regionCode)

  if (!dc && input.idcName?.trim()) {
    dc =
      productLine === 'bare_metal'
        ? resolveDataCenterForBareMetal(masterCtx, input.idcName)
        : resolveDataCenterByName(masterCtx, input.idcName)
  }

  if (!dc) return emptyInfra('region_not_found')

  let card = resolveGpuCardType(masterCtx, input.gpuModel)
  if (!card && productLine === 'bare_metal') {
    const parsed = parseDeviceModel(input.gpuModel)
    if (parsed) {
      card = resolveGpuCardType(masterCtx, parsed.cardCode)
    }
  }
  if (!card) {
    return {
      ...emptyInfra('card_type_not_found'),
      dataCenterId: dc.id,
      dataCenterCode: dc.code,
      dataCenterName: dc.name,
    }
  }

  const [platformPrice, pricingCtx] = await Promise.all([
    resolvePlatformListPriceAt({
      gpuCardTypeId: card.id,
      asOfDate: input.usageDate,
      productLine: platformProductLine,
      billingUnit,
    }),
    loadPricingResolveContext(),
  ])

  const unitCostGpuModel =
    productLine === 'bare_metal'
      ? (parseDeviceModel(input.gpuModel)?.cardCode ?? input.gpuModel)
      : input.gpuModel

  // 裸金属区域可能不是 container_instance_region；已命中机房时按机房 ID 取成本
  const unitCost =
    (await resolveUnitCostForDcCard({
      dataCenterId: dc.id,
      gpuCardTypeId: card.id,
      asOfDate: input.usageDate,
      ctx: pricingCtx,
    })) ??
    (await resolveUnitCostForPair(
      { regionCode, gpuModel: unitCostGpuModel },
      input.usageDate,
      pricingCtx,
    ))

  const platformOk = platformPrice != null
  const unitCostOk = unitCost != null

  return {
    dataCenterId: dc.id,
    dataCenterCode: dc.code,
    dataCenterName: dc.name,
    gpuCardTypeId: card.id,
    gpuCardTypeCode: card.code,
    gpuCardTypeName: card.name,
    pricingMode: unitCost?.pricingMode ?? null,
    listPricePerHour:
      platformPrice != null ? toMoneyString(platformPrice.listPricePerHour) : null,
    unitPricePerHour:
      unitCost?.unitPricePerHour != null
        ? toMoneyString(unitCost.unitPricePerHour)
        : null,
    revenueSharePercent:
      unitCost?.revenueSharePercent != null
        ? String(unitCost.revenueSharePercent)
        : null,
    platformCardListPriceId: platformPrice?.platformCardListPriceId ?? null,
    supplierUnitCostId: unitCost?.supplierUnitCostId ?? null,
    supplierPricingRecordId: unitCost?.pricingRecordId ?? null,
    pricingResolveStatus: resolvePricingStatus(platformOk, unitCostOk, true, true),
  }
}

export function computeBaseValueFallback(input: {
  baseValue: string | number | null | undefined
  totalCardHours: string | number
  listPricePerHour: string | null
}): string {
  if (input.baseValue != null && input.baseValue !== '') {
    return toMoneyString(Number(input.baseValue))
  }
  if (input.listPricePerHour == null) return '0'
  const hours = Number(input.totalCardHours)
  const price = Number(input.listPricePerHour)
  if (Number.isNaN(hours) || Number.isNaN(price)) return '0'
  return toMoneyString(hours * price)
}
